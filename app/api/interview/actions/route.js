import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { executeAction } from '@/lib/bot-actions/executor';

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
      select: { id: true, email: true, firstName: true, lastName: true },
    });

    return user;
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

// POST - Execute a bot action
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { actionName, parameters, questionId } = await request.json();

    if (!actionName) {
      return NextResponse.json(
        { error: 'Action name is required' },
        { status: 400 }
      );
    }

    // Find the user's active interview
    const interview = await prisma.userInterview.findFirst({
      where: { 
        userId: user.id,
        status: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
      },
    });

    if (!interview) {
      return NextResponse.json(
        { error: 'No active interview found' },
        { status: 404 }
      );
    }

    // If questionId provided, verify the action is allowed for this question
    if (questionId) {
      const question = await prisma.interviewQuestion.findUnique({
        where: { id: questionId },
      });

      if (question && question.allowedActions?.length > 0) {
        if (!question.allowedActions.includes(actionName)) {
          return NextResponse.json(
            { error: 'This action is not allowed for this question' },
            { status: 403 }
          );
        }
      }
    }

    // Create context for execution
    const context = {
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      interviewId: interview.id,
      interview, // Pass full interview object for efficiency
      responses: interview.responses || {},
      externalData: interview.externalData || {},
    };

    // Execute the action
    const result = await executeAction(actionName, parameters || {}, context);

    // If successful and action returns data to store, update interview
    if (result.success && result.storeInExternalData) {
      // Some actions may return data to store in externalData
      const updatedExternalData = {
        ...(interview.externalData || {}),
        ...result.storeInExternalData,
      };

      await prisma.userInterview.update({
        where: { id: interview.id },
        data: { externalData: updatedExternalData },
      });
    }

    // The executor returns the handler result directly, not wrapped in { result: ... }
    return NextResponse.json({
      success: result.success,
      result: result,  // Return the full handler result
      error: result.error,
    });
  } catch (error) {
    console.error('Error executing action:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error.message || 'Failed to execute action',
      },
      { status: 500 }
    );
  }
}

// GET - Get available actions for the current question
export async function GET(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const questionId = searchParams.get('questionId');

    // Get all active bot actions
    let actions = await prisma.botAction.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        description: true,
        parameters: true,
      },
    });

    // If questionId provided, filter to only allowed actions
    if (questionId) {
      const question = await prisma.interviewQuestion.findUnique({
        where: { id: questionId },
      });

      if (question && question.allowedActions?.length > 0) {
        const allowedNames = question.allowedActions;
        actions = actions.filter(a => allowedNames.includes(a.name));
      }
    }

    return NextResponse.json({ actions });
  } catch (error) {
    console.error('Error fetching actions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch actions' },
      { status: 500 }
    );
  }
}
