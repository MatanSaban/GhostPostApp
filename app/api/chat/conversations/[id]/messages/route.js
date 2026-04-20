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

/**
 * DELETE /api/chat/conversations/[id]/messages
 * Truncate the conversation: delete the message identified by fromMessageId
 * (or by fromContent+fromRole fallback) AND every message that came after it.
 * Used by the chat UI's "Resend" action to rewind the conversation back to a
 * specific user turn before replaying it through the AI.
 */
export async function DELETE(request, { params }) {
  const { authorized, member, isSuperAdmin } = await getCurrentAccountMember();
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const conversation = await prisma.chatConversation.findUnique({ where: { id } });
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }
  if (!isSuperAdmin && conversation.accountId !== member.accountId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { fromMessageId, fromContent, fromRole } = body || {};

  let cutoffMessage = null;

  if (fromMessageId && /^[a-f0-9]{24}$/i.test(fromMessageId)) {
    cutoffMessage = await prisma.chatMessage.findFirst({
      where: { id: fromMessageId, conversationId: id },
    });
  }

  if (!cutoffMessage && fromContent && fromRole) {
    const role = fromRole.toUpperCase();
    cutoffMessage = await prisma.chatMessage.findFirst({
      where: { conversationId: id, role, content: fromContent },
      orderBy: { createdAt: 'desc' },
    });
  }

  if (!cutoffMessage) {
    return NextResponse.json({ error: 'Message not found in conversation', deletedCount: 0 }, { status: 404 });
  }

  const deleted = await prisma.chatMessage.deleteMany({
    where: {
      conversationId: id,
      createdAt: { gte: cutoffMessage.createdAt },
    },
  });

  return NextResponse.json({ deletedCount: deleted.count, cutoffAt: cutoffMessage.createdAt });
}
