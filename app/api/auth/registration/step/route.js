import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

const VALID_STEPS = ['VERIFY', 'INTERVIEW', 'PLAN', 'PAYMENT', 'COMPLETED'];

// Step progression order
const STEP_ORDER = {
  'VERIFY': 0,
  'INTERVIEW': 1,
  'PLAN': 2,
  'PAYMENT': 3,
  'COMPLETED': 4,
};

export async function POST(request) {
  try {
    const body = await request.json();
    const { userId, step } = body;

    if (!userId || !step) {
      return NextResponse.json(
        { error: 'Missing userId or step' },
        { status: 400 }
      );
    }

    if (!VALID_STEPS.includes(step)) {
      return NextResponse.json(
        { error: 'Invalid registration step' },
        { status: 400 }
      );
    }

    // Find the user
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Only allow forward progression (can't go back to earlier steps)
    const currentStepOrder = STEP_ORDER[user.registrationStep];
    const newStepOrder = STEP_ORDER[step];

    if (newStepOrder < currentStepOrder) {
      return NextResponse.json(
        { error: 'Cannot go back to a previous step' },
        { status: 400 }
      );
    }

    // Update the registration step
    await prisma.user.update({
      where: { id: userId },
      data: { registrationStep: step },
    });

    return NextResponse.json({
      success: true,
      previousStep: user.registrationStep,
      currentStep: step,
    });
  } catch (error) {
    console.error('Update registration step error:', error);
    return NextResponse.json(
      { error: 'Failed to update registration step' },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        registrationStep: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      registrationStep: user.registrationStep,
    });
  } catch (error) {
    console.error('Get registration step error:', error);
    return NextResponse.json(
      { error: 'Failed to get registration step' },
      { status: 500 }
    );
  }
}
