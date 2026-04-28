import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { createLowProfile } from '@/lib/cardcom';

const SESSION_COOKIE = 'user_session';

async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) return null;
    return await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, firstName: true, lastName: true, phoneNumber: true },
    });
  } catch {
    return null;
  }
}

/**
 * POST /api/payment/init
 * 
 * Creates a CardCom LowProfile deal and a Payment record.
 * 
 * Body:
 *  - amount: number (required)
 *  - currency: string (default 'ILS')
 *  - productName: string (required)
 *  - language: string (default 'he')
 *  - action: { type: 'addon_purchase' | 'plan_upgrade', ... } (required)
 */
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { amount, currency = 'USD', productName, language = 'he', action } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }
    if (!productName) {
      return NextResponse.json({ error: 'Product name is required' }, { status: 400 });
    }
    if (!action || !action.type) {
      return NextResponse.json({ error: 'Action type is required' }, { status: 400 });
    }

    // Get user's account
    const membership = await prisma.accountMember.findFirst({
      where: { userId: user.id, status: 'ACTIVE' },
      include: {
        account: { include: { subscription: true } },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: 'No active account' }, { status: 400 });
    }

    // Build webhook URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '';
    const webhookUrl = baseUrl ? `${baseUrl}/api/payment/webhook` : '';

    // Two-step charge flow (matches the registration path):
    //   1) here — Operation: CreateTokenOnly + JValidateType: 2 (J2). CardCom
    //      validates the card with the issuer (catches bad CVV / expired
    //      card) and issues a token, but does NOT charge yet. No document
    //      attached to this LP — the invoice is generated against the actual
    //      charge in /payment/confirm.
    //   2) /payment/confirm — runs Transactions/Transaction with the token
    //      + invoice document. Token saved into PaymentMethod for one-click
    //      reuse on future addon purchases.
    const lpResult = await createLowProfile({
      amount,
      currency,
      productName,
      language,
      webhookUrl,
      operation: 'CreateTokenOnly',
      jValidateType: 2,
    });

    if (!lpResult.LowProfileId) {
      return NextResponse.json(
        { error: 'Failed to create payment session' },
        { status: 502 }
      );
    }

    // Create Payment record
    const payment = await prisma.payment.create({
      data: {
        accountId: membership.account.id,
        subscriptionId: membership.account.subscription?.id || null,
        amount,
        currency,
        status: 'PENDING',
        paymentMethod: 'CARDCOM',
        transactionId: lpResult.LowProfileId,
        metadata: {
          action,
          productName,
          lowProfileId: lpResult.LowProfileId,
          userId: user.id,
          language,
        },
      },
    });

    return NextResponse.json({
      success: true,
      paymentId: payment.id,
      lowProfileId: lpResult.LowProfileId,
    });
  } catch (error) {
    console.error('Payment init error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to initialize payment' },
      { status: 500 }
    );
  }
}
