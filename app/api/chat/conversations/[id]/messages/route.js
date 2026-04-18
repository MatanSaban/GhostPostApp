import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember } from '@/lib/auth-permissions';

/**
 * GET /api/chat/conversations/[id]/messages
 * Load messages for a conversation (with sender info)
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

  // Verify user belongs to this account
  if (!isSuperAdmin && conversation.accountId !== member.accountId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const messages = await prisma.chatMessage.findMany({
    where: { conversationId: id },
    include: {
      user: {
        select: { id: true, firstName: true, lastName: true, email: true, image: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ messages });
}
