import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { getActionsForAI, executeAction } from '@/lib/bot-actions/executor';
import { chat, continueWithToolResult, buildInterviewSystemPrompt } from '@/lib/ai/service';

const SESSION_COOKIE = 'user_session';

// Get authenticated user
async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });

    return user;
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

// POST - Send a message to the AI
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { message, questionId } = await request.json();

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Find the user's active interview
    const interview = await prisma.userInterview.findFirst({
      where: { 
        userId: user.id,
        status: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
      },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 20, // Get recent messages for context
        },
      },
    });

    if (!interview) {
      return NextResponse.json(
        { error: 'No active interview found' },
        { status: 404 }
      );
    }

    // Get the current question
    let question = null;
    if (questionId) {
      question = await prisma.interviewQuestion.findUnique({
        where: { id: questionId },
      });
    }

    if (!question) {
      // Get based on current index
      const allQuestions = await prisma.interviewQuestion.findMany({
        where: { isActive: true },
        orderBy: { order: 'asc' },
      });
      question = allQuestions[interview.currentQuestionIndex || 0];
    }

    if (!question) {
      return NextResponse.json(
        { error: 'No active question found' },
        { status: 404 }
      );
    }

    // Save user message
    const userMessage = await prisma.interviewMessage.create({
      data: {
        interviewId: interview.id,
        role: 'USER',
        content: message,
      },
    });

    // Get allowed actions for this question
    let botActions = [];
    if (question.allowedActions?.length > 0) {
      const allActions = await getActionsForAI();
      botActions = allActions.filter(a => question.allowedActions.includes(a.name));
    }

    // Build context for AI
    const context = {
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      interviewId: interview.id,
      responses: interview.responses || {},
      externalData: interview.externalData || {},
    };

    // Build conversation history for AI
    const conversationHistory = interview.messages
      .reverse()
      .map(m => ({
        role: m.role === 'USER' ? 'user' : 'assistant',
        content: m.content,
      }));

    // Add current message
    conversationHistory.push({ role: 'user', content: message });

    // Build system prompt
    const systemPrompt = buildInterviewSystemPrompt(question, context, user.name);

    let aiResponse = {
      content: '',
      toolCall: null,
    };
    let actionResult = null;

    try {
      // Call AI service
      aiResponse = await chat({
        messages: conversationHistory,
        systemPrompt,
        botActions,
      });

      // If AI wants to call a tool/action
      if (aiResponse.toolCall) {
        // Execute the action
        const result = await executeAction(
          aiResponse.toolCall.name,
          aiResponse.toolCall.arguments,
          context
        );

        actionResult = result.result;

        // Continue conversation with tool result
        const continuedResponse = await continueWithToolResult({
          messages: conversationHistory,
          systemPrompt,
          toolCall: aiResponse.toolCall,
          toolResult: result.result,
          botActions,
        });

        aiResponse.content = continuedResponse.content;

        // If AI wants another tool call, we limit to one for simplicity
        // In production, you might want to loop here
      }
    } catch (aiError) {
      console.error('AI service error:', aiError);
      // Fallback response if AI service fails
      aiResponse.content = "I'm having trouble processing that right now. Could you please try again?";
    }

    // Save AI response
    const assistantMessage = await prisma.interviewMessage.create({
      data: {
        interviewId: interview.id,
        role: 'ASSISTANT',
        content: aiResponse.content,
        functionCall: aiResponse.toolCall,
        functionResult: actionResult,
      },
    });

    return NextResponse.json({
      message: {
        id: assistantMessage.id,
        role: 'ASSISTANT',
        content: aiResponse.content,
        createdAt: assistantMessage.createdAt,
      },
      actionExecuted: aiResponse.toolCall ? true : false,
      actionResult: actionResult,
    });
  } catch (error) {
    console.error('Error in chat:', error);
    return NextResponse.json(
      { error: 'Failed to process message' },
      { status: 500 }
    );
  }
}
