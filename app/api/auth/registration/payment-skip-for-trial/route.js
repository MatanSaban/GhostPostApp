import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { getDraftAccountForUser } from '@/lib/draft-account';

const SESSION_COOKIE = 'user_session';

/**
 * POST /api/auth/registration/payment-skip-for-trial
 *
 * Used during registration when the selected plan has trialDays > 0 AND the
 * account hasn't used a trial yet. Skips CardCom entirely (no LP, no token,
 * no DoTransaction) — we don't collect payment up front for trials. Just
 * marks paymentConfirmed=true on the draft account so /finalize accepts the
 * registration and creates a TRIALING subscription.
 *
 * Re-validates eligibility server-side: plan really has trialDays > 0 and
 * the account.hasUsedTrial flag is false. Mirrors payment-free-with-coupon's
 * shape so admins can't be tricked into skipping payment for a paid plan.
 */
export async function POST() {
  try {
    const cookieStore = await cookies();
    const sessionUserId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!sessionUserId) {
      return NextResponse.json(
        { error: 'No registration in progress' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: sessionUserId },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    if (!user) {
      cookieStore.delete(SESSION_COOKIE);
      return NextResponse.json(
        { error: 'Registration not found. Please start over.' },
        { status: 404 }
      );
    }

    const draftAccount = await getDraftAccountForUser(user.id);
    if (!draftAccount) {
      return NextResponse.json(
        { error: 'No draft account found.' },
        { status: 404 }
      );
    }
    if (!draftAccount.draftSelectedPlanId) {
      return NextResponse.json({ error: 'Plan not selected' }, { status: 400 });
    }

    const plan = await prisma.plan.findUnique({
      where: { id: draftAccount.draftSelectedPlanId },
    });
    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }
    if (!plan.isActive) {
      return NextResponse.json({ error: 'Plan is not active' }, { status: 400 });
    }
    if (!plan.trialDays || plan.trialDays <= 0) {
      return NextResponse.json(
        { error: 'Plan does not offer a free trial' },
        { status: 400 }
      );
    }
    if (draftAccount.hasUsedTrial) {
      return NextResponse.json(
        { error: 'Account has already used a free trial' },
        { status: 400 }
      );
    }

    // Flip the flag /finalize is gated on. The actual TRIALING status,
    // trialStartedAt, trialEndAt, and hasUsedTrial=true are set inside
    // /finalize when it transitions the draft into a real subscription.
    const existingInterview = draftAccount.draftInterviewData || {};
    await prisma.account.update({
      where: { id: draftAccount.id },
      data: {
        draftInterviewData: {
          ...existingInterview,
          paymentConfirmed: true,
          paymentLowProfileId: null,
          paymentTransactionId: null,
          paymentConfirmedAt: new Date().toISOString(),
          paymentSkippedForTrial: true,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Trial registration confirmed',
      trialDays: plan.trialDays,
    });
  } catch (error) {
    console.error('Registration skip-for-trial error:', error);
    return NextResponse.json(
      { error: 'Failed to confirm trial registration' },
      { status: 500 }
    );
  }
}
