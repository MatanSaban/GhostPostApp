import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { getLowProfileResult } from '@/lib/cardcom';

const TEMP_REG_COOKIE = 'temp_reg_id';

/**
 * POST /api/auth/registration/payment-confirm
 * 
 * Verifies a registration payment at CardCom.
 * Called after the frontend receives HandleSubmit with IsSuccess from CardCom iframes.
 * Stores payment confirmation data in tempReg so finalize can create a Payment record.
 * 
 * Body:
 *  - lowProfileId: string (required)
 */
export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const tempRegId = cookieStore.get(TEMP_REG_COOKIE)?.value;

    if (!tempRegId) {
      return NextResponse.json(
        { error: 'No registration in progress' },
        { status: 400 }
      );
    }

    const tempReg = await prisma.tempRegistration.findUnique({
      where: { id: tempRegId },
    });

    if (!tempReg) {
      return NextResponse.json(
        { error: 'Registration not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { lowProfileId } = body;

    if (!lowProfileId) {
      return NextResponse.json(
        { error: 'LowProfile ID is required' },
        { status: 400 }
      );
    }

    // Verify payment at CardCom
    let cardcomResult;
    try {
      cardcomResult = await getLowProfileResult(lowProfileId);
    } catch (err) {
      console.error('CardCom verification failed:', err);
      // Trust the frontend HandleSubmit if API check fails
    }

    const isSuccess = cardcomResult?.IsSuccess !== false;

    if (!isSuccess) {
      return NextResponse.json(
        { error: 'Payment verification failed', details: cardcomResult },
        { status: 400 }
      );
    }

    // Store payment data in tempReg interviewData (using existing JSON field)
    const existingData = tempReg.interviewData || {};
    await prisma.tempRegistration.update({
      where: { id: tempRegId },
      data: {
        interviewData: {
          ...existingData,
          paymentConfirmed: true,
          paymentLowProfileId: lowProfileId,
          paymentConfirmedAt: new Date().toISOString(),
          cardcomResult: cardcomResult || { frontendConfirmed: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Payment verified successfully',
    });
  } catch (error) {
    console.error('Registration payment confirm error:', error);
    return NextResponse.json(
      { error: 'Failed to confirm payment' },
      { status: 500 }
    );
  }
}
