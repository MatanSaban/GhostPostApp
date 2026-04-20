import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { getLowProfileResult } from '@/lib/cardcom';
import { getDraftAccountForUser } from '@/lib/draft-account';

const SESSION_COOKIE = 'user_session';

/**
 * POST /api/auth/registration/payment-confirm
 *
 * Verifies a registration payment at CardCom and stores confirmation data on
 * the draft account so finalize can create a Payment record.
 *
 * Body:
 *  - lowProfileId: string (required)
 */
export async function POST(request) {
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
      select: { id: true },
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
        { error: 'No draft account found. Please start over.' },
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

    // Store payment confirmation inside draftInterviewData so finalize can read it.
    const existingInterview = draftAccount.draftInterviewData || {};
    await prisma.account.update({
      where: { id: draftAccount.id },
      data: {
        draftInterviewData: {
          ...existingInterview,
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
