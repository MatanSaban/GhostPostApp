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

  const conversations = await prisma.chatConversation.findMany({
    where: { siteId, accountId: member.accountId },
    include: {
      createdByUser: {
        select: { id: true, firstName: true, lastName: true, email: true, image: true },
      },
      _count: { select: { messages: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json({ conversations });
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

  const conversation = await prisma.chatConversation.create({
    data: {
      siteId,
      accountId: member.accountId,
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
