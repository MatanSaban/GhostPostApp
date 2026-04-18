import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember } from '@/lib/auth-permissions';
import { generateTextResponse } from '@/lib/ai/gemini';

/**
 * POST /api/chat/generate-title
 * Generate a title for a conversation based on its first messages
 * Body: { conversationId }
 */
export async function POST(request) {
  const { authorized, member, error, isSuperAdmin } = await getCurrentAccountMember();
  if (!authorized) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const body = await request.json();
  const { conversationId } = body;

  if (!conversationId) {
    return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });
  }

  const conversation = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
  });

  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  if (!isSuperAdmin && conversation.accountId !== member.accountId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Already has a title
  if (conversation.title) {
    return NextResponse.json({ title: conversation.title });
  }

  // Get the first few messages
  const messages = await prisma.chatMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    take: 4,
  });

  if (messages.length === 0) {
    return NextResponse.json({ title: null });
  }

  const messagesSummary = messages
    .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
    .join('\n');

  const title = await generateTextResponse({
    system: 'Generate a short conversation title (3-6 words max) based on the messages below. Return ONLY the title text, nothing else. Use the same language as the messages.',
    prompt: messagesSummary,
    maxTokens: 30,
    temperature: 0.3,
    operation: 'GENERIC',
    accountId: member.accountId,
    userId: member.userId,
    siteId: conversation.siteId,
  });

  const cleanTitle = title.trim().replace(/^["']|["']$/g, '');

  await prisma.chatConversation.update({
    where: { id: conversationId },
    data: { title: cleanTitle },
  });

  return NextResponse.json({ title: cleanTitle });
}
