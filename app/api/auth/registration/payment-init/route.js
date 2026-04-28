import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { createLowProfile } from '@/lib/cardcom';
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
 *  - amount: number (total to charge, in USD — Israeli cardholders' banks
 *    handle the USD→ILS conversion at their own rate)
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
      include: { translations: true },
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

    // Resolve the plan name in the user's language so the CardCom receipt /
    // invoice gets a localized description (the user complaint: a Hebrew
    // session was getting "Enterprise Plan - Monthly Subscription" in English).
    const langCode = language === 'en' ? 'EN' : 'HE';
    const planTranslation = plan.translations?.find(t => t.language === langCode);
    const localizedPlanName = planTranslation?.name || plan.name;

    // Localized productName is shown by CardCom inside the iframe payment
    // page header. The full "{plan} - Monthly Subscription" description is
    // built in /payment-confirm at the actual charge so the document gets
    // tied to the charge transaction, not the J2 validation.
    const planLabel = language === 'en' ? 'Plan' : 'תוכנית';
    const productName = language === 'en'
      ? `${localizedPlanName} ${planLabel}`
      : `${planLabel} ${localizedPlanName}`;

    // Two-step charge flow:
    //   1) here — Operation: CreateTokenOnly + JValidateType: 2 (J2). CardCom
    //      validates the card with the issuer (catches bad CVV / expired
    //      card) and issues a token, but does NOT charge yet. We do NOT
    //      attach a Document at this step — J2 is a validate-only check, the
    //      invoice is generated at the actual charge below.
    //   2) /payment-confirm — inspects card type (block debit/gift), then
    //      runs Transactions/Transaction with the token + the document so
    //      CardCom emits the TaxInvoiceAndReceipt against the real charge.
    // This is what powers our debit-card block, our pre-charge CVV
    // validation, and our save-card-on-file feature.
    const lpResult = await createLowProfile({
      amount,
      currency: 'USD',
      language,
      productName,
      webhookUrl,
      operation: 'CreateTokenOnly',
      jValidateType: 2,
      returnValue: draftAccount.id,
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
