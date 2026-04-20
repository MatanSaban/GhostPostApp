import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember } from '@/lib/auth-permissions';
import {
  ONBOARDING_STEPS,
  ONBOARDING_ORDER,
  isValidOnboardingStep,
  getNextStep,
} from '@/lib/onboarding';

async function resolveAccountId() {
  const { authorized, member, error, isSuperAdmin } = await getCurrentAccountMember();
  if (!authorized) return { error, status: 401 };
  const accountId = member?.accountId;
  if (!accountId) return { error: 'No account selected', status: 400 };
  return { accountId, isSuperAdmin };
}

/**
 * GET /api/onboarding/progress
 * Returns the current onboarding state for the selected account.
 */
export async function GET() {
  try {
    const resolved = await resolveAccountId();
    if (resolved.error) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    const account = await prisma.account.findUnique({
      where: { id: resolved.accountId },
      select: {
        onboardingStep: true,
        onboardingCompleted: true,
        onboardingSkipped: true,
        onboardingStartedAt: true,
        onboardingCompletedAt: true,
      },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    return NextResponse.json({
      step: account.onboardingStep || ONBOARDING_STEPS.GREETING,
      completed: account.onboardingCompleted,
      skipped: account.onboardingSkipped,
      startedAt: account.onboardingStartedAt,
      completedAt: account.onboardingCompletedAt,
      order: ONBOARDING_ORDER,
    });
  } catch (error) {
    console.error('Onboarding GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch onboarding state' }, { status: 500 });
  }
}

/**
 * POST /api/onboarding/progress
 * Body: { action: 'advance' | 'skip' | 'restart' | 'setStep', step?: string }
 */
export async function POST(request) {
  try {
    const resolved = await resolveAccountId();
    if (resolved.error) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    const body = await request.json().catch(() => ({}));
    const { action, step } = body || {};

    const current = await prisma.account.findUnique({
      where: { id: resolved.accountId },
      select: { onboardingStep: true, onboardingStartedAt: true },
    });
    if (!current) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const now = new Date();
    const data = {};
    if (!current.onboardingStartedAt) data.onboardingStartedAt = now;

    if (action === 'advance') {
      const next = getNextStep(current.onboardingStep || ONBOARDING_STEPS.GREETING);
      data.onboardingStep = next;
      if (next === ONBOARDING_STEPS.FINISHED) {
        data.onboardingCompleted = true;
        data.onboardingCompletedAt = now;
      }
    } else if (action === 'skip') {
      data.onboardingStep = ONBOARDING_STEPS.FINISHED;
      data.onboardingSkipped = true;
      data.onboardingCompletedAt = now;
    } else if (action === 'restart') {
      data.onboardingStep = ONBOARDING_STEPS.GREETING;
      data.onboardingCompleted = false;
      data.onboardingSkipped = false;
      data.onboardingStartedAt = now;
      data.onboardingCompletedAt = null;
    } else if (action === 'setStep') {
      if (!isValidOnboardingStep(step)) {
        return NextResponse.json({ error: 'Invalid step' }, { status: 400 });
      }
      data.onboardingStep = step;
      if (step === ONBOARDING_STEPS.FINISHED) {
        data.onboardingCompleted = true;
        data.onboardingCompletedAt = now;
      }
    } else {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    const updated = await prisma.account.update({
      where: { id: resolved.accountId },
      data,
      select: {
        onboardingStep: true,
        onboardingCompleted: true,
        onboardingSkipped: true,
        onboardingStartedAt: true,
        onboardingCompletedAt: true,
      },
    });

    return NextResponse.json({
      step: updated.onboardingStep,
      completed: updated.onboardingCompleted,
      skipped: updated.onboardingSkipped,
      startedAt: updated.onboardingStartedAt,
      completedAt: updated.onboardingCompletedAt,
    });
  } catch (error) {
    console.error('Onboarding POST error:', error);
    return NextResponse.json({ error: 'Failed to update onboarding state' }, { status: 500 });
  }
}
