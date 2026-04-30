import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { canPurchaseAddOn, addAiCredits } from '@/lib/account-utils';
import { isCouponApplicableToAddOn } from '@/lib/coupon-applicability';
import { applyCouponToOrder } from '@/lib/coupon-pricing';

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
      select: { 
        id: true, 
        email: true,
      },
    });

    return user;
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

/**
 * POST /api/subscription/addons/purchase
 * Purchase an add-on for the current account's subscription
 */
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { addOnId, quantity = 1, couponCode } = body;

    if (!addOnId) {
      return NextResponse.json(
        { error: 'Add-on ID is required' },
        { status: 400 }
      );
    }

    // Get user's current account membership
    const membership = await prisma.accountMember.findFirst({
      where: {
        userId: user.id,
        status: 'ACTIVE',
      },
      include: {
        account: {
          include: {
            subscription: true,
          },
        },
        role: true,
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: 'No active account membership' },
        { status: 400 }
      );
    }

    // Check if user has permission to manage subscription
    const hasPermission = membership.isOwner || 
      membership.role.permissions.includes('ACCOUNT_BILLING_MANAGE');

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions to purchase add-ons' },
        { status: 403 }
      );
    }

    const subscription = membership.account.subscription;
    if (!subscription || subscription.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'No active subscription found' },
        { status: 400 }
      );
    }

    // Get the add-on
    const addOn = await prisma.addOn.findUnique({
      where: { id: addOnId },
    });

    if (!addOn || !addOn.isActive) {
      return NextResponse.json(
        { error: 'Add-on not found or not available' },
        { status: 404 }
      );
    }

    // Check if account can purchase this add-on type
    const canPurchase = await canPurchaseAddOn(
      membership.account.id,
      addOn.type,
      quantity
    );

    if (!canPurchase.allowed) {
      return NextResponse.json(
        { 
          error: canPurchase.reason,
          errorKey: canPurchase.reasonKey,
          errorParams: canPurchase.reasonParams,
        },
        { status: 400 }
      );
    }

    // Resolve and validate the coupon (if any) BEFORE creating the purchase,
    // so we can reject early with a clear errorKey for the UI.
    let validatedCoupon = null;
    if (couponCode && typeof couponCode === 'string') {
      const code = couponCode.toUpperCase().trim();
      const coupon = await prisma.coupon.findUnique({
        where: { code },
        include: { _count: { select: { redemptions: true } } },
      });

      if (!coupon || !coupon.isActive) {
        return NextResponse.json(
          { error: 'Invalid coupon code', errorKey: 'admin.coupons.errors.invalid' },
          { status: 400 }
        );
      }

      const now = new Date();
      if (coupon.validFrom && now < coupon.validFrom) {
        return NextResponse.json(
          { error: 'This coupon is not yet active', errorKey: 'admin.coupons.errors.notYetActive' },
          { status: 400 }
        );
      }
      if (coupon.validUntil && now > coupon.validUntil) {
        return NextResponse.json(
          { error: 'This coupon has expired', errorKey: 'admin.coupons.errors.expired' },
          { status: 400 }
        );
      }
      if (coupon.maxRedemptions && coupon._count.redemptions >= coupon.maxRedemptions) {
        return NextResponse.json(
          { error: 'This coupon has reached its usage limit', errorKey: 'admin.coupons.errors.usageLimit' },
          { status: 400 }
        );
      }

      // Per-account redemption cap.
      const accountRedemptions = await prisma.couponRedemption.count({
        where: { couponId: coupon.id, accountId: membership.account.id },
      });
      if (accountRedemptions >= (coupon.maxPerAccount || 1)) {
        return NextResponse.json(
          { error: 'You have already used this coupon', errorKey: 'admin.coupons.errors.maxPerAccount' },
          { status: 400 }
        );
      }

      const scope = isCouponApplicableToAddOn(coupon, { id: addOn.id, type: addOn.type });
      if (!scope.applies) {
        return NextResponse.json(
          { error: 'This coupon is not applicable to the selected add-on', errorKey: 'admin.coupons.errors.notApplicable' },
          { status: 400 }
        );
      }

      validatedCoupon = coupon;
    }

    // Create the add-on purchase
    const purchase = await prisma.addOnPurchase.create({
      data: {
        subscriptionId: subscription.id,
        addOnId: addOn.id,
        quantity,
        status: 'ACTIVE',
        // For one-time Ai-GCoins, track remaining credits
        creditsRemaining: addOn.type === 'AI_CREDITS' && addOn.billingType === 'ONE_TIME'
          ? (addOn.quantity || 0) * quantity
          : null,
        // For recurring add-ons, set expiration to match subscription
        expiresAt: addOn.billingType === 'RECURRING'
          ? subscription.currentPeriodEnd
          : null,
      },
      include: {
        addOn: true,
      },
    });

    // Compute discounted total (pre-VAT) and snapshot the redemption.
    let appliedCoupon = null;
    if (validatedCoupon) {
      const orderUsd = (addOn.price || 0) * quantity;
      const result = applyCouponToOrder(orderUsd, validatedCoupon);
      if (result.applies) {
        await prisma.couponRedemption.create({
          data: {
            couponId: validatedCoupon.id,
            accountId: membership.account.id,
            subscriptionId: subscription.id,
            addOnPurchaseId: purchase.id,
            discountType: validatedCoupon.discountType,
            discountValue: validatedCoupon.discountValue,
            recurringPriceSchedule: Array.isArray(validatedCoupon.recurringPriceSchedule)
              ? validatedCoupon.recurringPriceSchedule
              : [],
            floorOrderToZero: !!validatedCoupon.floorOrderToZero,
            // limitationOverrides/extraFeatures only kick in for plan
            // redemptions; snapshot empty arrays for add-on redemptions so
            // the row stays consistent.
            limitationOverrides: [],
            extraFeatures: [],
            durationMonths: null,
            status: 'ACTIVE',
          },
        });

        appliedCoupon = {
          code: validatedCoupon.code,
          discountType: validatedCoupon.discountType,
          discountValue: validatedCoupon.discountValue,
          orderUsd,
          finalUsd: result.finalUsd,
          discountUsd: result.discountUsd,
        };
      }
    }

    // If Ai-GCoins add-on, add credits to account balance
    if (addOn.type === 'AI_CREDITS') {
      const creditsToAdd = (addOn.quantity || 0) * quantity;
      await addAiCredits(membership.account.id, creditsToAdd, {
        source: 'addon_purchase',
        sourceId: purchase.id,
        description: `Purchased ${addOn.name} x${quantity}`,
      });
    }

    // TODO: Create payment record and process payment
    // For now, we're just creating the purchase record

    return NextResponse.json({
      success: true,
      purchase,
      coupon: appliedCoupon,
      message: `Successfully purchased ${addOn.name}${quantity > 1 ? ` x${quantity}` : ''}`,
    });
  } catch (error) {
    console.error('Error purchasing add-on:', error);
    return NextResponse.json(
      { error: 'Failed to purchase add-on' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/subscription/addons/purchase
 * Get current account's active add-on purchases
 */
export async function GET(request) {
  try {
    const user = await verifyAuth();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's current account
    const membership = await prisma.accountMember.findFirst({
      where: {
        userId: user.id,
        status: 'ACTIVE',
      },
      include: {
        account: {
          include: {
            subscription: {
              include: {
                addOnPurchases: {
                  where: { status: 'ACTIVE' },
                  include: {
                    addOn: {
                      include: {
                        translations: true,
                      },
                    },
                  },
                  orderBy: { purchasedAt: 'desc' },
                },
              },
            },
          },
        },
      },
    });

    if (!membership?.account?.subscription) {
      return NextResponse.json({ purchases: [] });
    }

    return NextResponse.json({
      purchases: membership.account.subscription.addOnPurchases,
    });
  } catch (error) {
    console.error('Error fetching add-on purchases:', error);
    return NextResponse.json(
      { error: 'Failed to fetch add-on purchases' },
      { status: 500 }
    );
  }
}
