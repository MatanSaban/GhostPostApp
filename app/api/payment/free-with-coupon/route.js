import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { getNextFirstOfMonth } from '@/lib/proration';
import { isCouponApplicableToPlan } from '@/lib/coupon-applicability';
import { validateAndRedeemAddOnCoupon, CouponRedemptionError } from '@/lib/coupon-redemption';
import { notifyAdmins, emailTemplates } from '@/lib/mailer';

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
    if (coupon.validFrom && now < coupon.validFrom) {
      return NextResponse.json({ error: 'Coupon not yet active' }, { status: 400 });
    }
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

    // Per-account redemption cap.
    const accountRedemptions = await prisma.couponRedemption.count({
      where: { couponId: coupon.id, accountId: account.id },
    });
    if (accountRedemptions >= (coupon.maxPerAccount || 1)) {
      return NextResponse.json({ error: 'Coupon already used by this account' }, { status: 400 });
    }

    // Channel-scoped applicability check (plan vs add-on). Without this an
    // add-on-only coupon could be applied to a plan upgrade for free, or
    // vice-versa.
    if (action.type === 'plan_upgrade') {
      const targetPlan = await prisma.plan.findFirst({
        where: { slug: action.planSlug, isActive: true },
        select: { id: true },
      });
      if (!targetPlan) {
        return NextResponse.json({ error: 'Plan not found or inactive' }, { status: 400 });
      }
      const planScope = isCouponApplicableToPlan(coupon, targetPlan.id);
      if (!planScope.applies) {
        return NextResponse.json({ error: 'Coupon not applicable to this plan' }, { status: 400 });
      }
    }
    // For add-on purchases we re-validate inside validateAndRedeemAddOnCoupon
    // below, since it has the AddOn row fetched.

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

    const subscription = account.subscription;

    // Execute the action FIRST so we have an addOnPurchaseId to link the
    // redemption to (for add-on purchases). For plan upgrades the redemption
    // is plan-scoped and addOnPurchaseId stays null.
    let actionResult = null;
    let addOnPurchaseForRedemption = null;
    let addOnForRedemption = null;

    if (action.type === 'plan_upgrade') {
      actionResult = await handlePlanUpgrade(account, action);
    } else if (action.type === 'addon_purchase') {
      const result = await handleAddonPurchase(account, action);
      actionResult = result.actionResult;
      addOnPurchaseForRedemption = result.purchase;
      addOnForRedemption = result.addOn;
    }

    // Record the redemption. For add-on purchases use the shared helper so
    // the snapshot shape (addOnPurchaseId, empty plan-channel arrays) stays
    // identical to the post-charge routes. For plan upgrades fall back to the
    // plan-channel shape (limitationOverrides/extraFeatures from the coupon).
    if (action.type === 'addon_purchase' && addOnPurchaseForRedemption && addOnForRedemption) {
      try {
        await validateAndRedeemAddOnCoupon(prisma, {
          couponCode: coupon.code,
          addOn: { id: addOnForRedemption.id, type: addOnForRedemption.type },
          addOnPurchase: addOnPurchaseForRedemption,
          accountId: account.id,
          subscriptionId: subscription?.id || null,
        });
      } catch (err) {
        if (err instanceof CouponRedemptionError) {
          // We already created the AddOnPurchase + AI credits etc. — strict
          // failure here would orphan that work. Mark the payment FAILED for
          // audit and surface the error to the client without rolling back the
          // grant (matches the "user already got the goods" semantics of the
          // post-charge routes).
          await prisma.payment.update({
            where: { id: payment.id },
            data: {
              status: 'FAILED',
              metadata: {
                ...(payment.metadata || {}),
                couponRedemptionFailed: { code: err.code, message: err.message },
                failedAt: new Date().toISOString(),
              },
            },
          });
          return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
        }
        throw err;
      }
    } else {
      // Plan-upgrade redemption (or no specific add-on context): plan-channel snapshot.
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
    }

    try {
      notifyAdmins(emailTemplates.adminNewPayment({
        kind: action.type || 'addon_purchase',
        amount: 0,
        currency: 'USD',
        user,
        account: { id: account.id, name: account.name },
        productName: actionResult?.addOnName || actionResult?.planName || null,
        planName: actionResult?.type === 'plan_upgrade' ? actionResult.planName : null,
        transactionId: payment.transactionId,
        couponCode: coupon.code,
      }));
    } catch (e) {
      console.error('[Free-with-coupon] admin notification failed:', e);
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

  // Return the raw addOn + purchase so the caller can hand them to the
  // shared validateAndRedeemAddOnCoupon helper, which needs both to record
  // the redemption with addOnPurchaseId set and the channel scope re-checked.
  return {
    actionResult: {
      type: 'addon_purchase',
      purchaseId: purchase.id,
      addOnName: addOn.name,
    },
    addOn,
    purchase,
  };
}
