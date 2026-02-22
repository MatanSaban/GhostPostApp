import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { createLowProfile, buildDocument } from '@/lib/cardcom';

const TEMP_REG_COOKIE = 'temp_reg_id';

/**
 * POST /api/auth/registration/payment-init
 * 
 * Creates a CardCom LowProfile deal for registration payment.
 * Uses temp_reg_id cookie (no user_session yet during registration).
 * 
 * Body:
 *  - amount: number (total to charge, in ILS)
 *  - language: string (default 'he')
 *  - couponCode: string (optional, for discount tracking)
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

    if (new Date() > tempReg.expiresAt) {
      return NextResponse.json(
        { error: 'Registration expired' },
        { status: 410 }
      );
    }

    if (!tempReg.selectedPlanId) {
      return NextResponse.json(
        { error: 'No plan selected' },
        { status: 400 }
      );
    }

    // Get the selected plan
    const plan = await prisma.plan.findUnique({
      where: { id: tempReg.selectedPlanId },
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

    // Build webhook URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '';
    const webhookUrl = baseUrl ? `${baseUrl}/api/payment/webhook` : '';

    // Build document for invoice
    const customerName = `${tempReg.firstName || ''} ${tempReg.lastName || ''}`.trim() || tempReg.email;
    const document = buildDocument({
      customerName,
      customerEmail: tempReg.email,
      customerPhone: tempReg.phoneNumber || '',
      products: [{
        description: `${plan.name} Plan - Monthly Subscription`,
        quantity: 1,
        unitCost: amount,
      }],
    });

    // Create LowProfile deal at CardCom
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
