import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { getDraftAccountForUser } from '@/lib/draft-account';

const SESSION_COOKIE = 'user_session';

/**
 * POST /api/auth/registration/payment-skip-for-free-plan
 *
 * Used during registration when the selected plan has price <= 0 (e.g. the
 * seeded Free plan). Skips CardCom entirely and just marks
 * paymentConfirmed=true on the draft account so /finalize will accept the
 * registration. Mirrors payment-skip-for-trial / payment-free-with-coupon —
 * the difference is that this path does NOT require a coupon, and creates
 * a normal ACTIVE subscription (not TRIALING).
 *
 * Re-validates server-side that the selected plan really is free, so an
 * admin can't be tricked into skipping payment for a paid plan.
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
      select: { id: true, email: true },
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
    if ((plan.price ?? 0) > 0) {
      return NextResponse.json(
        { error: 'Plan requires payment — use the standard payment flow' },
        { status: 400 }
      );
    }

    // Flip the flag /finalize is gated on. The actual ACTIVE subscription
    // is created inside /finalize when it transitions the draft into a
    // real account.
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
          paymentSkippedForFreePlan: true,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Free-plan registration confirmed',
    });
  } catch (error) {
    console.error('Registration skip-for-free-plan error:', error);
    return NextResponse.json(
      { error: 'Failed to confirm free-plan registration' },
      { status: 500 }
    );
  }
}
