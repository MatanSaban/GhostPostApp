import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { executeAction } from '@/lib/bot-actions/executor';

const SESSION_COOKIE = 'user_session';

// Verify super admin access
async function verifySuperAdmin() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isSuperAdmin: true },
    });

    if (!user || !user.isSuperAdmin) {
      return null;
    }

    return user;
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

// POST - Test a bot action
export async function POST(request) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { actionName, parameters } = await request.json();

    if (!actionName) {
      return NextResponse.json(
        { error: 'Action name is required' },
        { status: 400 }
      );
    }

    // Create a mock context for testing
    const mockContext = {
      userId: admin.id,
      interviewId: 'test-' + Date.now(),
      isTest: true,
    };

    // Execute the action
    const result = await executeAction(actionName, parameters || {}, mockContext);

    return NextResponse.json({
      success: result.success,
      result: result.result,
      error: result.error,
      executionTime: result.executionTime,
    });
  } catch (error) {
    console.error('Error testing bot action:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error.message || 'Failed to test action',
      },
      { status: 500 }
    );
  }
}
