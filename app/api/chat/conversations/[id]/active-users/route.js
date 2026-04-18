import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember } from '@/lib/auth-permissions';

const ACTIVE_TIMEOUT_MS = 30000; // 30 seconds - user considered inactive after this

/**
 * GET /api/chat/conversations/[id]/active-users
 * Register current user as active and return list of active users
 */
export async function GET(request, { params }) {
  const { authorized, member, error, isSuperAdmin } = await getCurrentAccountMember();
  if (!authorized) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const { id } = await params;

  const conversation = await prisma.chatConversation.findUnique({
    where: { id },
  });

  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  if (!isSuperAdmin && conversation.accountId !== member.accountId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Get user's name for display
  const user = await prisma.user.findUnique({
    where: { id: member.userId },
    select: { id: true, firstName: true, lastName: true },
  });

  const now = Date.now();
  const currentActiveUsers = Array.isArray(conversation.activeUsers) ? conversation.activeUsers : [];

  // Remove stale users and update/add current user
  const freshUsers = currentActiveUsers.filter(
    (u) => u.userId !== member.userId && (now - u.lastSeen) < ACTIVE_TIMEOUT_MS
  );

  freshUsers.push({
    userId: member.userId,
    userName: [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'User',
    lastSeen: now,
  });

  await prisma.chatConversation.update({
    where: { id },
    data: { activeUsers: freshUsers },
  });

  // Return other active users (exclude self)
  const otherUsers = freshUsers.filter((u) => u.userId !== member.userId);

  return NextResponse.json({ activeUsers: otherUsers });
}
