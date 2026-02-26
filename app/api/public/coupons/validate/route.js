import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// POST /api/public/coupons/validate - Validate a coupon code during checkout
export async function POST(request) {
  try {
    const body = await request.json();
    const { code, planId } = body;

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
      return NextResponse.json({ valid: false, error: 'This coupon is no longer active' }, { status: 400 });
    }

    // Check validity dates
    const now = new Date();
    if (coupon.validFrom && now < coupon.validFrom) {
      return NextResponse.json({ valid: false, error: 'This coupon is not yet active' }, { status: 400 });
    }
    if (coupon.validUntil && now > coupon.validUntil) {
      return NextResponse.json({ valid: false, error: 'This coupon has expired' }, { status: 400 });
    }

    // Check max redemptions
    if (coupon.maxRedemptions && coupon._count.redemptions >= coupon.maxRedemptions) {
      return NextResponse.json({ valid: false, error: 'This coupon has reached its usage limit' }, { status: 400 });
    }

    // Check applicable plans
    if (planId && coupon.applicablePlanIds?.length > 0) {
      if (!coupon.applicablePlanIds.includes(planId)) {
        return NextResponse.json({ valid: false, error: 'This coupon is not applicable to the selected plan' }, { status: 400 });
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
