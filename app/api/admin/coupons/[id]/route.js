import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

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

// GET /api/admin/coupons/[id] - Get single coupon with redemptions
export async function GET(request, { params }) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const coupon = await prisma.coupon.findUnique({
      where: { id },
      include: {
        redemptions: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });

    if (!coupon) {
      return NextResponse.json({ error: 'Coupon not found' }, { status: 404 });
    }

    return NextResponse.json({ coupon });
  } catch (error) {
    console.error('Error fetching coupon:', error);
    return NextResponse.json({ error: 'Failed to fetch coupon' }, { status: 500 });
  }
}

// PUT /api/admin/coupons/[id] - Update a coupon
export async function PUT(request, { params }) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
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

    // Check if coupon exists
    const existing = await prisma.coupon.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Coupon not found' }, { status: 404 });
    }

    // If code changed, check uniqueness
    if (code && code.toUpperCase() !== existing.code) {
      const codeExists = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
      if (codeExists) {
        return NextResponse.json({ error: 'Coupon code already exists' }, { status: 400 });
      }
    }

    const coupon = await prisma.coupon.update({
      where: { id },
      data: {
        ...(code !== undefined && { code: code.toUpperCase().trim() }),
        ...(description !== undefined && { description }),
        ...(discountType !== undefined && { discountType }),
        ...(discountValue !== undefined && { discountValue: parseFloat(discountValue) || 0 }),
        ...(limitationOverrides !== undefined && { limitationOverrides }),
        ...(extraFeatures !== undefined && { extraFeatures }),
        ...(maxRedemptions !== undefined && { maxRedemptions: maxRedemptions ? parseInt(maxRedemptions) : null }),
        ...(maxPerAccount !== undefined && { maxPerAccount: maxPerAccount ? parseInt(maxPerAccount) : 1 }),
        ...(validFrom !== undefined && { validFrom: validFrom ? new Date(validFrom) : new Date() }),
        ...(validUntil !== undefined && { validUntil: validUntil ? new Date(validUntil) : null }),
        ...(applicablePlanIds !== undefined && { applicablePlanIds }),
        ...(durationMonths !== undefined && { durationMonths: durationMonths ? parseInt(durationMonths) : null }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    return NextResponse.json({ coupon, message: 'Coupon updated successfully' });
  } catch (error) {
    console.error('Error updating coupon:', error);
    return NextResponse.json({ error: 'Failed to update coupon' }, { status: 500 });
  }
}

// DELETE /api/admin/coupons/[id] - Delete a coupon
export async function DELETE(request, { params }) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const coupon = await prisma.coupon.findUnique({
      where: { id },
      include: { _count: { select: { redemptions: true } } },
    });

    if (!coupon) {
      return NextResponse.json({ error: 'Coupon not found' }, { status: 404 });
    }

    // If coupon has active redemptions, deactivate instead of delete
    if (coupon._count.redemptions > 0) {
      await prisma.coupon.update({
        where: { id },
        data: { isActive: false },
      });
      return NextResponse.json({ message: 'Coupon deactivated (has existing redemptions)' });
    }

    await prisma.coupon.delete({ where: { id } });
    return NextResponse.json({ message: 'Coupon deleted successfully' });
  } catch (error) {
    console.error('Error deleting coupon:', error);
    return NextResponse.json({ error: 'Failed to delete coupon' }, { status: 500 });
  }
}
