import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { createLowProfile, buildDocument } from '@/lib/cardcom';
import { getDraftAccountForUser } from '@/lib/draft-account';

const SESSION_COOKIE = 'user_session';

/**
 * POST /api/auth/registration/payment-init
 *
 * Creates a CardCom LowProfile deal for registration payment.
 * Uses user_session cookie - the session is set from first registration step
 * on the draft user.
 *
 * Body:
 *  - amount: number (total to charge, in ILS)
 *  - language: string (default 'he')
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
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        emailVerified: true,
        phoneVerified: true,
      },
    });

    if (!user) {
      cookieStore.delete(SESSION_COOKIE);
      return NextResponse.json(
        { error: 'Registration not found. Please start over.' },
        { status: 404 }
      );
    }

    if (!user.emailVerified && !user.phoneVerified) {
      return NextResponse.json(
        { error: 'Verification required before payment' },
        { status: 400 }
      );
    }

    const draftAccount = await getDraftAccountForUser(user.id);

    if (!draftAccount) {
      return NextResponse.json(
        { error: 'No draft account found. Please start over.' },
        { status: 404 }
      );
    }

    if (!draftAccount.draftSelectedPlanId) {
      return NextResponse.json(
        { error: 'No plan selected' },
        { status: 400 }
      );
    }

    const plan = await prisma.plan.findUnique({
      where: { id: draftAccount.draftSelectedPlanId },
    });

    if (!plan) {
      return NextResponse.json(
        { error: 'Selected plan not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { amount, language = 'he' } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: 'Invalid amount' },
        { status: 400 }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '';
    const webhookUrl = baseUrl ? `${baseUrl}/api/payment/webhook` : '';

    const customerName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
    const document = buildDocument({
      customerName,
      customerEmail: user.email,
      customerPhone: user.phoneNumber || '',
      products: [{
        description: `${plan.name} Plan - Monthly Subscription`,
        quantity: 1,
        unitCost: amount,
      }],
    });

    const lpResult = await createLowProfile({
      amount,
      currency: 'ILS',
      language,
      productName: `${plan.name} Plan`,
      webhookUrl,
      document,
    });

    if (!lpResult.LowProfileId) {
      console.error('CardCom LP creation failed:', lpResult);
      return NextResponse.json(
        { error: 'Failed to initialize payment session' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      lowProfileId: lpResult.LowProfileId,
      planName: plan.name,
    });
  } catch (error) {
    console.error('Registration payment init error:', error);
    return NextResponse.json(
      { error: 'Failed to initialize payment' },
      { status: 500 }
    );
  }
}
