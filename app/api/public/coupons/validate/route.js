import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isCouponApplicableToPlan, isCouponApplicableToAddOn } from '@/lib/coupon-applicability';

// POST /api/public/coupons/validate - Validate a coupon code during checkout
// Body: { code, planId? , addOnId?, addOnType? }
//   - planId          : validates the coupon for a plan checkout.
//   - addOnId/addOnType: validates the coupon for an add-on purchase.
//     addOnType is auto-resolved from addOnId when only addOnId is sent.
export async function POST(request) {
  try {
    const body = await request.json();
    const { code, planId, addOnId } = body;
    let { addOnType } = body;

    if (!code) {
      return NextResponse.json({ error: 'Coupon code is required' }, { status: 400 });
    }

    const coupon = await prisma.coupon.findUnique({
      where: { code: code.toUpperCase().trim() },
      include: {
        _count: { select: { redemptions: true } },
      },
    });

    if (!coupon) {
      return NextResponse.json({ valid: false, error: 'Invalid coupon code' }, { status: 404 });
    }

    // Check if active
    if (!coupon.isActive) {
      return NextResponse.json({ valid: false, errorCode: 'notActive', error: 'This coupon is no longer active' }, { status: 400 });
    }

    // Check validity dates
    const now = new Date();
    if (coupon.validFrom && now < coupon.validFrom) {
      return NextResponse.json({ valid: false, errorCode: 'notYetActive', error: 'This coupon is not yet active' }, { status: 400 });
    }
    if (coupon.validUntil && now > coupon.validUntil) {
      return NextResponse.json({ valid: false, errorCode: 'expired', error: 'This coupon has expired' }, { status: 400 });
    }

    // Check max redemptions
    if (coupon.maxRedemptions && coupon._count.redemptions >= coupon.maxRedemptions) {
      return NextResponse.json({ valid: false, errorCode: 'usageLimit', error: 'This coupon has reached its usage limit' }, { status: 400 });
    }

    // Channel-scoped applicability (plan checkout vs add-on purchase). The
    // helper enforces both directions: an add-on-only coupon refuses on a
    // plan checkout, a plan-only coupon refuses on an add-on purchase.
    if (planId) {
      const result = isCouponApplicableToPlan(coupon, planId);
      if (!result.applies) {
        return NextResponse.json(
          { valid: false, errorCode: result.errorCode || 'notApplicable', error: 'This coupon is not applicable to the selected plan' },
          { status: 400 }
        );
      }
    } else if (addOnId || addOnType) {
      // Resolve the add-on row when only id was sent, so we can check both
      // applicableAddOnIds and applicableAddOnTypes scopes.
      let resolvedType = addOnType;
      if (addOnId && !resolvedType) {
        const addOn = await prisma.addOn.findUnique({
          where: { id: addOnId },
          select: { type: true, isActive: true },
        });
        if (!addOn) {
          return NextResponse.json({ valid: false, errorCode: 'notApplicable', error: 'Add-on not found' }, { status: 400 });
        }
        resolvedType = addOn.type;
      }
      const result = isCouponApplicableToAddOn(coupon, { id: addOnId, type: resolvedType });
      if (!result.applies) {
        return NextResponse.json(
          { valid: false, errorCode: result.errorCode || 'notApplicable', error: 'This coupon is not applicable to the selected add-on' },
          { status: 400 }
        );
      }
    }

    // Return coupon info (without sensitive internals)
    const limitationOverrides = Array.isArray(coupon.limitationOverrides) ? coupon.limitationOverrides : [];
    const extraFeatures = Array.isArray(coupon.extraFeatures) ? coupon.extraFeatures : [];

    return NextResponse.json({
      valid: true,
      coupon: {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        // floorOrderToZero only matters for FIXED_PRICE; the client-side
        // applyCouponToOrder helper reads it to decide whether an over-priced
        // FIXED_PRICE coupon (e.g. $50 fixed price on a $30 order) should
        // floor the total to $0 or refuse to apply.
        floorOrderToZero: coupon.floorOrderToZero ?? false,
        // Per-cycle override for the recurring engine (B2). Empty array →
        // no schedule, recurring follows discountType/discountValue.
        recurringPriceSchedule: Array.isArray(coupon.recurringPriceSchedule) ? coupon.recurringPriceSchedule : [],
        hasLimitationOverrides: limitationOverrides.length > 0,
        hasExtraFeatures: extraFeatures.length > 0,
        limitationOverrides,
        extraFeatures,
        durationMonths: coupon.durationMonths,
      },
    });
  } catch (error) {
    console.error('Error validating coupon:', error);
    return NextResponse.json({ error: 'Failed to validate coupon' }, { status: 500 });
  }
}
