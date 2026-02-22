import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const TEMP_REG_COOKIE = 'temp_reg_id';

// POST /api/auth/registration/coupon - Save coupon code to temp registration
export async function POST(request) {
  try {
    const body = await request.json();
    const { couponCode } = body;

    // Get tempRegId from cookie
    const cookieStore = await cookies();
    const tempRegId = cookieStore.get(TEMP_REG_COOKIE)?.value;

    if (!tempRegId) {
      return NextResponse.json(
        { error: 'No registration in progress' },
        { status: 400 }
      );
    }

    // Find the temp registration
    const tempReg = await prisma.tempRegistration.findUnique({
      where: { id: tempRegId },
    });

    if (!tempReg) {
      cookieStore.delete(TEMP_REG_COOKIE);
      return NextResponse.json(
        { error: 'Registration not found. Please start over.' },
        { status: 404 }
      );
    }

    // Update temp registration with coupon code (null to clear)
    await prisma.tempRegistration.update({
      where: { id: tempRegId },
      data: {
        couponCode: couponCode || null,
      },
    });

    return NextResponse.json({
      success: true,
      couponCode: couponCode || null,
    });
  } catch (error) {
    console.error('Save coupon error:', error);
    return NextResponse.json(
      { error: 'Failed to save coupon' },
      { status: 500 }
    );
  }
}
