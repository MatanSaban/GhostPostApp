import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember } from '@/lib/auth-permissions';
import { getTextModel, MODELS } from '@/lib/ai/gemini';
import { streamText } from 'ai';
import { logAIUsage, AI_OPERATIONS } from '@/lib/ai/credits';
import { trackAIUsage } from '@/lib/ai/credits-service';

const SYSTEM_PROMPT = `You are the Ghost Post AI Assistant — an expert SEO advisor embedded in the Ghost Post platform.

Your capabilities:
- SEO strategy and analysis
- Content optimization and planning
- Keyword research guidance
- Technical SEO troubleshooting
- Competitor analysis insights
- Link building strategies
- Site audit interpretation
- Content calendar planning

Guidelines:
- Be concise, actionable, and data-driven
- When referencing site-specific data, use the context provided about the user's site
- Format responses with clear headers, bullet points, and structured advice
- If asked about something outside your expertise, be honest about limitations
- Respond in the same language the user writes in
- You are NOT a general-purpose chatbot — stay focused on SEO, content, and digital marketing`;

/**
 * POST /api/chat
 * Send a message and get a streaming AI response
 * Body: { conversationId, message, siteId }
 */
export async function POST(request) {
  const { authorized, member, error, isSuperAdmin } = await getCurrentAccountMember();
  if (!authorized) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const body = await request.json();
  const { conversationId, message, siteId } = body;

  if (!conversationId || !message || typeof message !== 'string') {
    return NextResponse.json({ error: 'conversationId and message are required' }, { status: 400 });
  }

  // Load conversation
  const conversation = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
    include: { site: { select: { name: true, url: true, platform: true } } },
  });

  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  if (!isSuperAdmin && conversation.accountId !== member.accountId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Save user message to DB
  await prisma.chatMessage.create({
    data: {
      conversationId,
      role: 'USER',
      userId: member.userId,
      content: message.trim(),
    },
  });

  // Load conversation history for context
  const history = await prisma.chatMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    take: 50, // Keep last 50 messages for context window
  });

  // Build messages array for the AI
  const aiMessages = history.map((msg) => ({
    role: msg.role === 'USER' ? 'user' : 'assistant',
    content: msg.content,
  }));

  // Build site context for system prompt
  const siteContext = conversation.site
    ? `\n\nCurrent site context:\n- Site name: ${conversation.site.name}\n- URL: ${conversation.site.url}\n- Platform: ${conversation.site.platform || 'Unknown'}`
    : '';

  const systemPrompt = SYSTEM_PROMPT + siteContext;

  // Stream the response
  const model = getTextModel();
  let fullResponse = '';

  const result = streamText({
    model,
    system: systemPrompt,
    messages: aiMessages,
    maxTokens: 4096,
    temperature: 0.7,
    onFinish: async ({ text, usage }) => {
      // Save AI response to DB
      try {
        await prisma.chatMessage.create({
          data: {
            conversationId,
            role: 'ASSISTANT',
            userId: null,
            content: text,
          },
        });

        // Update conversation timestamp
        await prisma.chatConversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        });

        // Track credits
        const inputTokens = usage?.inputTokens || 0;
        const outputTokens = usage?.outputTokens || 0;
        const totalTokens = usage?.totalTokens || 0;

        logAIUsage({
          operation: 'CHAT_MESSAGE',
          inputTokens,
          outputTokens,
          totalTokens,
          model: MODELS.TEXT,
          metadata: { conversationId },
        });

        if (member.accountId) {
          trackAIUsage({
            accountId: member.accountId,
            userId: member.userId,
            siteId: conversation.siteId,
            operation: 'CHAT_MESSAGE',
            inputTokens,
            outputTokens,
            totalTokens,
            metadata: { model: MODELS.TEXT, conversationId },
          }).catch((err) => console.error('[Chat] trackAIUsage error:', err.message));
        }
      } catch (err) {
        console.error('[Chat] Error saving AI response:', err.message);
      }
    },
  });

  return result.toDataStreamResponse();
}
