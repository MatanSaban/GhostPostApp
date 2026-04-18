import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember } from '@/lib/auth-permissions';

/**
 * DELETE /api/chat/conversations/[id]
 * Delete a conversation (creator + account owner only)
 */
export async function DELETE(request, { params }) {
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

  // Only creator or account owner can delete
  if (!isSuperAdmin) {
    const isCreator = conversation.createdByUserId === member.userId;
    if (!isCreator && !member.isOwner) {
      return NextResponse.json({ error: 'Only the creator or account owner can delete this conversation' }, { status: 403 });
    }
  }

  await prisma.chatConversation.delete({ where: { id } });

  return NextResponse.json({ success: true });
}

/**
 * PATCH /api/chat/conversations/[id]
 * Rename a conversation
 */
export async function PATCH(request, { params }) {
  const { authorized, member, error, isSuperAdmin } = await getCurrentAccountMember();
  if (!authorized) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { title } = body;

  if (!title || typeof title !== 'string') {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

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

  const updated = await prisma.chatConversation.update({
    where: { id },
    data: { title: title.trim() },
  });

  return NextResponse.json({ conversation: updated });
}
