import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember } from '@/lib/auth-permissions';

/**
 * POST /api/chat/conversations/[id]/mark-read
 *
 * Bumps the requesting user's lastRead timestamp on this conversation to NOW
 * so subsequent GET /conversations queries no longer count the existing
 * assistant messages as unread. Called by the chat popup whenever a user
 * opens a conversation (selects it in the sidebar or it becomes the active
 * one) so unread badges clear immediately.
 *
 * Stored on ChatConversation.userLastRead (Json map of { [userId]: ISO })
 * rather than a join table because reads are always per-user and writes are
 * infrequent (one per open). Concurrent writes from the same user race-free
 * because we only touch our own key inside the JSON object.
 */
export async function POST(_request, { params }) {
  const { authorized, member, error, isSuperAdmin } = await getCurrentAccountMember();
  if (!authorized) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const { id } = await params;

  const conversation = await prisma.chatConversation.findUnique({
    where: { id },
    select: { id: true, accountId: true, userLastRead: true },
  });
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }
  if (!isSuperAdmin && conversation.accountId !== member.accountId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const now = new Date().toISOString();
  const merged = {
    ...(conversation.userLastRead && typeof conversation.userLastRead === 'object'
      ? conversation.userLastRead
      : {}),
    [member.userId]: now,
  };

  await prisma.chatConversation.update({
    where: { id },
    data: { userLastRead: merged },
  });

  return NextResponse.json({ ok: true, lastReadAt: now });
}
