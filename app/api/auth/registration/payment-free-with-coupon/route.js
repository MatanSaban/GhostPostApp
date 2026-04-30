import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { applyCouponToOrder } from '@/lib/coupon-pricing';
import { getDraftAccountForUser } from '@/lib/draft-account';
import { calculateNewSubscriptionProration } from '@/lib/proration';
import { notifyAdmins, emailTemplates } from '@/lib/mailer';

const SESSION_COOKIE = 'user_session';

/**
 * POST /api/auth/registration/payment-free-with-coupon
 *
 * Used during registration when a coupon brings the first-charge total to
 * $0 (e.g. a 100% PERCENTAGE coupon, or a FIXED_PRICE coupon set to $0, or
 * a FIXED_DISCOUNT large enough to absorb the entire prorated amount).
 * Skips CardCom entirely — no LP, no token, no DoTransaction — and just
 * marks paymentConfirmed=true on the draft account so /finalize will
 * accept the registration.
 *
 * Re-validates the coupon server-side and confirms the resulting first
 * charge is actually $0 before flipping the flag.
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
    if (!draftAccount.draftCouponCode) {
      return NextResponse.json({ error: 'No coupon to apply' }, { status: 400 });
    }

    const plan = await prisma.plan.findUnique({
      where: { id: draftAccount.draftSelectedPlanId },
    });
    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    const coupon = await prisma.coupon.findUnique({
      where: { code: draftAccount.draftCouponCode.toUpperCase().trim() },
      include: { _count: { select: { redemptions: true } } },
    });
    if (!coupon || !coupon.isActive) {
      return NextResponse.json({ error: 'Invalid or expired coupon' }, { status: 400 });
    }
    const now = new Date();
    if (coupon.validFrom && now < coupon.validFrom) {
      return NextResponse.json({ error: 'Coupon not yet active' }, { status: 400 });
    }
    if (coupon.validUntil && now > coupon.validUntil) {
      return NextResponse.json({ error: 'Coupon has expired' }, { status: 400 });
    }
    if (coupon.maxRedemptions && coupon._count.redemptions >= coupon.maxRedemptions) {
      return NextResponse.json({ error: 'Coupon usage limit reached' }, { status: 400 });
    }
    if (coupon.applicablePlanIds?.length > 0 && !coupon.applicablePlanIds.includes(plan.id)) {
      return NextResponse.json({ error: 'Coupon not applicable to this plan' }, { status: 400 });
    }

    // Verify the coupon actually brings the first charge to $0. Same math
    // (USD, pre-VAT) the client uses, so admin can't be tricked into
    // skipping payment by sending a non-free coupon to this endpoint.
    const proration = calculateNewSubscriptionProration(plan.price);
    const result = applyCouponToOrder(proration.proratedAmount, coupon);
    if (!result.applies || result.finalUsd > 0) {
      return NextResponse.json(
        { error: 'Coupon does not result in a free order' },
        { status: 400 }
      );
    }

    // Flip the flag /finalize is gated on. Coupon redemption itself is
    // recorded by /finalize when it transitions the draft to a real account.
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
          paymentFreeWithCoupon: true,
        },
      },
    });

    try {
      notifyAdmins(emailTemplates.adminNewPayment({
        kind: 'registration',
        amount: 0,
        currency: 'USD',
        user,
        account: { id: draftAccount.id, name: draftAccount.name },
        planName: plan.name,
        productName: `${plan.name} plan`,
        couponCode: coupon.code,
      }));
    } catch (e) {
      console.error('[Reg Free-Coupon] admin notification failed:', e);
    }

    return NextResponse.json({
      success: true,
      message: 'Free-coupon registration confirmed',
    });
  } catch (error) {
    console.error('Registration free-with-coupon error:', error);
    return NextResponse.json(
      { error: 'Failed to confirm free-with-coupon registration' },
      { status: 500 }
    );
  }
}
