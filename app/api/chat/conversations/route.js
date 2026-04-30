import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember } from '@/lib/auth-permissions';

/**
 * GET /api/chat/conversations?siteId=xxx
 * List all conversations for a site (all site members can see all conversations)
 */
export async function GET(request) {
  const { authorized, member, error, isSuperAdmin } = await getCurrentAccountMember();
  if (!authorized) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get('siteId');

  if (!siteId) {
    return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
  }

  // Verify user has access to this site
  if (!isSuperAdmin) {
    const siteMember = await prisma.siteMember.findFirst({
      where: {
        siteId,
        accountMember: { userId: member.userId, accountId: member.accountId },
      },
    });
    // Account owner has implicit access to all sites
    if (!siteMember && !member.isOwner) {
      return NextResponse.json({ error: 'No access to this site' }, { status: 403 });
    }
  }

  // SuperAdmins have no accountId (getCurrentAccountMember returns
  // accountId: null for them, since they're not bound to any tenant). Drop
  // the accountId filter for that case - they already have global access -
  // and apply it normally for tenant users.
  const conversationWhere = { siteId };
  if (!isSuperAdmin && member.accountId) {
    conversationWhere.accountId = member.accountId;
  }
  const conversations = await prisma.chatConversation.findMany({
    where: conversationWhere,
    include: {
      createdByUser: {
        select: { id: true, firstName: true, lastName: true, email: true, image: true },
      },
      _count: { select: { messages: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  // Compute per-user unreadCount: number of ASSISTANT messages newer than the
  // requesting user's last-read timestamp on each conversation. ASSISTANT-only
  // because the user's own messages are obviously already "seen". The
  // userLastRead field is a Json map of { [userId]: ISO } that the
  // mark-read endpoint maintains; if it's missing for this user we treat the
  // entire history as unread (so first-time visitors see all the assistant
  // messages they haven't opened yet).
  const userId = member.userId;
  const enriched = await Promise.all(conversations.map(async (c) => {
    const lastRead = c.userLastRead && typeof c.userLastRead === 'object'
      ? c.userLastRead[userId]
      : null;
    const where = { conversationId: c.id, role: 'ASSISTANT' };
    if (lastRead) where.createdAt = { gt: new Date(lastRead) };
    const unreadCount = await prisma.chatMessage.count({ where });
    // Strip the raw lastRead map - that's an internal detail.
    const { userLastRead, ...rest } = c;
    return { ...rest, unreadCount };
  }));

  const totalUnread = enriched.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  return NextResponse.json({ conversations: enriched, totalUnread });
}

/**
 * POST /api/chat/conversations
 * Create a new conversation
 */
export async function POST(request) {
  const { authorized, member, error, isSuperAdmin } = await getCurrentAccountMember();
  if (!authorized) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const body = await request.json();
  const { siteId, title } = body;

  if (!siteId) {
    return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
  }

  // Verify user has access to this site
  if (!isSuperAdmin) {
    const siteMember = await prisma.siteMember.findFirst({
      where: {
        siteId,
        accountMember: { userId: member.userId, accountId: member.accountId },
      },
    });
    if (!siteMember && !member.isOwner) {
      return NextResponse.json({ error: 'No access to this site' }, { status: 403 });
    }
  }

  // SuperAdmin sessions carry no accountId. Resolve the conversation's
  // accountId from the site itself so SuperAdmin-initiated conversations are
  // still owned by the correct tenant (and existing tenant queries that filter
  // by site.accountId continue to find them).
  let convAccountId = member.accountId;
  if (!convAccountId) {
    const siteRow = await prisma.site.findUnique({
      where: { id: siteId },
      select: { accountId: true },
    });
    if (!siteRow?.accountId) {
      return NextResponse.json({ error: 'Site has no owning account' }, { status: 500 });
    }
    convAccountId = siteRow.accountId;
  }

  const conversation = await prisma.chatConversation.create({
    data: {
      siteId,
      accountId: convAccountId,
      createdByUserId: member.userId,
      title: title || null,
    },
    include: {
      createdByUser: {
        select: { id: true, firstName: true, lastName: true, email: true, image: true },
      },
    },
  });

  return NextResponse.json({ conversation }, { status: 201 });
}
