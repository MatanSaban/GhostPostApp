import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { getNextFirstOfMonth } from '@/lib/proration';

const SESSION_COOKIE = 'user_session';

async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) return null;
    return await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
  } catch {
    return null;
  }
}

/**
 * POST /api/payment/free-with-coupon
 *
 * Applies a plan upgrade (or addon purchase) when a coupon covers the
 * full amount (effectiveAmount = 0).  Validates the coupon server-side,
 * records a $0 payment, and executes the action.
 *
 * Body:
 *  - action: { type, planSlug?, planId?, addOnId?, quantity?, coupon: { code } }
 */
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    if (!action?.type) {
      return NextResponse.json({ error: 'Action type is required' }, { status: 400 });
    }

    const couponCode = action?.coupon?.code;
    if (!couponCode) {
      return NextResponse.json({ error: 'Coupon code is required' }, { status: 400 });
    }

    // Re-validate coupon server-side
    const coupon = await prisma.coupon.findUnique({
      where: { code: couponCode.toUpperCase().trim() },
      include: {
        _count: { select: { redemptions: true } },
      },
    });

    if (!coupon || !coupon.isActive) {
      return NextResponse.json({ error: 'Invalid or expired coupon' }, { status: 400 });
    }

    // Check validity dates
    const now = new Date();
    if (coupon.validUntil && now > coupon.validUntil) {
      return NextResponse.json({ error: 'Coupon has expired' }, { status: 400 });
    }

    // Check usage limit
    if (coupon.maxRedemptions && coupon._count.redemptions >= coupon.maxRedemptions) {
      return NextResponse.json({ error: 'Coupon usage limit reached' }, { status: 400 });
    }

    // Get user account
    const membership = await prisma.accountMember.findFirst({
      where: { userId: user.id, status: 'ACTIVE' },
      include: {
        account: {
          include: { subscription: { include: { plan: true } } },
        },
      },
    });

    if (!membership?.account) {
      return NextResponse.json({ error: 'No active account' }, { status: 400 });
    }

    const account = membership.account;

    // Create a $0 payment record
    const payment = await prisma.payment.create({
      data: {
        accountId: account.id,
        subscriptionId: account.subscription?.id || null,
        amount: 0,
        currency: 'ILS',
        status: 'COMPLETED',
        paymentMethod: 'COUPON',
        transactionId: `coupon_${coupon.code}_${Date.now()}`,
        metadata: {
          action,
          coupon: {
            id: coupon.id,
            code: coupon.code,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue,
          },
          completedAt: new Date().toISOString(),
        },
      },
    });

    // Record coupon redemption
    const subscription = account.subscription;
    const redemptionExpiresAt = coupon.durationMonths
      ? new Date(new Date().setMonth(new Date().getMonth() + coupon.durationMonths))
      : null;

    await prisma.couponRedemption.create({
      data: {
        couponId: coupon.id,
        accountId: account.id,
        subscriptionId: subscription?.id || null,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        limitationOverrides: coupon.limitationOverrides || [],
        extraFeatures: coupon.extraFeatures || [],
        durationMonths: coupon.durationMonths,
        expiresAt: redemptionExpiresAt,
        status: 'ACTIVE',
      },
    });

    // Execute the action
    let actionResult = null;

    if (action.type === 'plan_upgrade') {
      actionResult = await handlePlanUpgrade(account, action);
    } else if (action.type === 'addon_purchase') {
      actionResult = await handleAddonPurchase(account, action);
    }

    return NextResponse.json({
      success: true,
      message: 'Coupon applied successfully',
      paymentId: payment.id,
      actionResult,
    });
  } catch (error) {
    console.error('Free-with-coupon error:', error);
    return NextResponse.json(
      { error: 'Failed to apply coupon' },
      { status: 500 }
    );
  }
}

async function handlePlanUpgrade(account, action) {
  const { planSlug } = action;

  const plan = await prisma.plan.findFirst({
    where: { slug: planSlug, isActive: true },
  });
  if (!plan) throw new Error('Plan not found or inactive');

  const subscription = account.subscription;
  if (!subscription) throw new Error('No active subscription');

  const now = new Date();
  const nextFirst = getNextFirstOfMonth(now);

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      planId: plan.id,
      currentPeriodStart: now,
      currentPeriodEnd: nextFirst,
    },
  });

  return {
    type: 'plan_upgrade',
    planName: plan.name,
    planSlug: plan.slug,
    nextBillingDate: nextFirst.toISOString(),
  };
}

async function handleAddonPurchase(account, action) {
  const { addOnId, quantity = 1 } = action;

  const addOn = await prisma.addOn.findUnique({ where: { id: addOnId } });
  if (!addOn || !addOn.isActive) throw new Error('Add-on not found or inactive');

  const subscription = account.subscription;
  if (!subscription) throw new Error('No active subscription');

  const purchase = await prisma.addOnPurchase.create({
    data: {
      subscriptionId: subscription.id,
      addOnId: addOn.id,
      quantity,
      status: 'ACTIVE',
      creditsRemaining:
        addOn.type === 'AI_CREDITS' && addOn.billingType === 'ONE_TIME'
          ? (addOn.quantity || 0) * quantity
          : null,
      expiresAt:
        addOn.billingType === 'RECURRING' ? subscription.currentPeriodEnd : null,
    },
  });

  if (addOn.type === 'AI_CREDITS') {
    const creditsToAdd = (addOn.quantity || 0) * quantity;
    await prisma.account.update({
      where: { id: account.id },
      data: { aiCreditsBalance: { increment: creditsToAdd } },
    });
  }

  return {
    type: 'addon_purchase',
    purchaseId: purchase.id,
    addOnName: addOn.name,
  };
}
