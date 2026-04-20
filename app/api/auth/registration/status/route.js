import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { getDraftAccountForUser } from '@/lib/draft-account';
import { getExchangeRate } from '@/lib/currency';
import { formatPlanForClient } from '@/lib/plan-format';

const SESSION_COOKIE = 'user_session';

const STEP_MAP = {
  VERIFY: 'verify',
  ACCOUNT_SETUP: 'account-setup',
  INTERVIEW: 'interview',
  PLAN: 'plan',
  PAYMENT: 'payment',
  COMPLETED: 'completed',
};

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const lang = searchParams.get('lang') || 'he';

    const cookieStore = await cookies();
    const sessionUserId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!sessionUserId) {
      return NextResponse.json({
        success: true,
        hasTempRegistration: false,
        currentStep: 'form',
      });
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
        registrationStep: true,
      },
    });

    if (!user) {
      cookieStore.delete(SESSION_COOKIE);
      return NextResponse.json({
        success: true,
        hasTempRegistration: false,
        currentStep: 'form',
      });
    }

    if (user.registrationStep === 'COMPLETED') {
      return NextResponse.json({
        success: true,
        hasTempRegistration: false,
        currentStep: 'completed',
      });
    }

    const draftAccount = await getDraftAccountForUser(user.id);

    // When a draft user exists but has no draft account, recover by clearing
    // the session so the user starts over cleanly.
    if (!draftAccount) {
      cookieStore.delete(SESSION_COOKIE);
      return NextResponse.json({
        success: true,
        hasTempRegistration: false,
        currentStep: 'form',
      });
    }

    // If a plan is selected, hydrate the full plan object so the client can
    // render the payment step without a second round-trip. Reshape it the
    // same way /api/public/plans does so PaymentStep finds monthlyPrice,
    // usdToIlsRate, period, etc. after a refresh.
    let selectedPlan = null;
    if (draftAccount.draftSelectedPlanId) {
      const rawPlan = await prisma.plan.findUnique({
        where: { id: draftAccount.draftSelectedPlanId },
        include: { translations: true },
      });
      if (rawPlan) {
        const usdToIlsRate = await getExchangeRate('USD', 'ILS');
        selectedPlan = formatPlanForClient(rawPlan, {
          lang,
          usdToIlsRate,
          isPopular: rawPlan.slug === 'pro',
        });
      }
    }

    const urlStep = STEP_MAP[user.registrationStep] || 'form';

    return NextResponse.json({
      success: true,
      hasTempRegistration: true,
      tempReg: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        currentStep: user.registrationStep,
        isEmailVerified: !!user.emailVerified,
        isPhoneVerified: !!user.phoneVerified,
        // Draft account fields — the client treats these the same as the
        // former temp registration fields.
        accountName: draftAccount.isDraft ? (draftAccount.name?.startsWith(user.firstName || '') ? null : draftAccount.name) : draftAccount.name,
        accountSlug: draftAccount.slug?.startsWith('draft-') ? null : draftAccount.slug,
        interviewData: draftAccount.draftInterviewData || {},
        selectedPlanId: draftAccount.draftSelectedPlanId || null,
        couponCode: draftAccount.draftCouponCode || null,
      },
      selectedPlan,
      currentStep: urlStep,
    });
  } catch (error) {
    console.error('Get registration status error:', error);
    return NextResponse.json(
      { error: 'Failed to get registration status' },
      { status: 500 }
    );
  }
}
