import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

// Verify super admin access
async function verifySuperAdmin() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) return null;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isSuperAdmin: true },
    });

    if (!user || !user.isSuperAdmin) return null;
    return user;
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

// GET /api/admin/coupons - List all coupons
export async function GET() {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const coupons = await prisma.coupon.findMany({
      include: {
        _count: {
          select: { redemptions: true },
        },
        translations: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get active redemptions count per coupon
    const activeRedemptionCounts = await prisma.couponRedemption.groupBy({
      by: ['couponId'],
      where: { status: 'ACTIVE' },
      _count: { id: true },
    });

    const activeCountMap = {};
    for (const item of activeRedemptionCounts) {
      activeCountMap[item.couponId] = item._count.id;
    }

    const formattedCoupons = coupons.map((coupon) => ({
      id: coupon.id,
      code: coupon.code,
      description: coupon.description,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      limitationOverrides: coupon.limitationOverrides || [],
      extraFeatures: coupon.extraFeatures || [],
      maxRedemptions: coupon.maxRedemptions,
      maxPerAccount: coupon.maxPerAccount,
      validFrom: coupon.validFrom.toISOString(),
      validUntil: coupon.validUntil?.toISOString() || null,
      applicablePlanIds: coupon.applicablePlanIds || [],
      durationMonths: coupon.durationMonths,
      isActive: coupon.isActive,
      totalRedemptions: coupon._count.redemptions,
      activeRedemptions: activeCountMap[coupon.id] || 0,
      translations: coupon.translations || [],
      createdAt: coupon.createdAt.toISOString(),
    }));

    // Stats
    const activeCoupons = coupons.filter((c) => c.isActive);
    const totalRedemptions = coupons.reduce((sum, c) => sum + c._count.redemptions, 0);
    const activeRedemptions = Object.values(activeCountMap).reduce((sum, c) => sum + c, 0);

    return NextResponse.json({
      coupons: formattedCoupons,
      stats: {
        totalCoupons: coupons.length,
        activeCoupons: activeCoupons.length,
        totalRedemptions,
        activeRedemptions,
      },
    });
  } catch (error) {
    console.error('Error fetching coupons:', error);
    return NextResponse.json({ error: 'Failed to fetch coupons' }, { status: 500 });
  }
}

// POST /api/admin/coupons - Create a new coupon
export async function POST(request) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      code,
      description,
      discountType,
      discountValue,
      limitationOverrides,
      extraFeatures,
      maxRedemptions,
      maxPerAccount,
      validFrom,
      validUntil,
      applicablePlanIds,
      durationMonths,
      isActive,
    } = body;

    if (!code) {
      return NextResponse.json({ error: 'Coupon code is required' }, { status: 400 });
    }

    // Check if code already exists
    const existing = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
    if (existing) {
      return NextResponse.json({ error: 'Coupon code already exists' }, { status: 400 });
    }

    const coupon = await prisma.coupon.create({
      data: {
        code: code.toUpperCase().trim(),
        description: description || null,
        discountType: discountType || 'PERCENTAGE',
        discountValue: parseFloat(discountValue) || 0,
        limitationOverrides: limitationOverrides || [],
        extraFeatures: extraFeatures || [],
        maxRedemptions: maxRedemptions ? parseInt(maxRedemptions) : null,
        maxPerAccount: maxPerAccount ? parseInt(maxPerAccount) : 1,
        validFrom: validFrom ? new Date(validFrom) : new Date(),
        validUntil: validUntil ? new Date(validUntil) : null,
        applicablePlanIds: applicablePlanIds || [],
        durationMonths: durationMonths ? parseInt(durationMonths) : null,
        isActive: isActive !== false,
      },
    });

    return NextResponse.json({ coupon, message: 'Coupon created successfully' });
  } catch (error) {
    console.error('Error creating coupon:', error);
    return NextResponse.json({ error: 'Failed to create coupon' }, { status: 500 });
  }
}
