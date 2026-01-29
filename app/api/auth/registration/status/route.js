import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const TEMP_REG_COOKIE = 'temp_reg_id';

export async function GET(request) {
  try {
    // Get tempRegId from cookie
    const cookieStore = await cookies();
    const tempRegId = cookieStore.get(TEMP_REG_COOKIE)?.value;

    if (!tempRegId) {
      return NextResponse.json({
        success: true,
        hasTempRegistration: false,
        currentStep: 'form',
      });
    }

    const tempReg = await prisma.tempRegistration.findUnique({
      where: { id: tempRegId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        currentStep: true,
        emailVerified: true,
        phoneVerified: true,
        accountName: true,
        accountSlug: true,
        interviewData: true,
        selectedPlanId: true,
        expiresAt: true,
      },
    });

    if (!tempReg) {
      // Cookie exists but temp registration not found - clear cookie
      cookieStore.delete(TEMP_REG_COOKIE);
      return NextResponse.json({
        success: true,
        hasTempRegistration: false,
        currentStep: 'form',
      });
    }

    // Check if temp registration has expired
    if (new Date() > tempReg.expiresAt) {
      await prisma.tempRegistration.delete({ where: { id: tempRegId } });
      cookieStore.delete(TEMP_REG_COOKIE);
      return NextResponse.json({
        success: true,
        hasTempRegistration: false,
        currentStep: 'form',
        expired: true,
      });
    }

    // Map registration step to URL step param
    const STEP_MAP = {
      FORM: 'form',
      VERIFY: 'verify',
      ACCOUNT_SETUP: 'account-setup',
      INTERVIEW: 'interview',
      PLAN: 'plan',
      PAYMENT: 'payment',
    };

    return NextResponse.json({
      success: true,
      hasTempRegistration: true,
      tempReg: {
        id: tempReg.id,
        email: tempReg.email,
        firstName: tempReg.firstName,
        lastName: tempReg.lastName,
        phoneNumber: tempReg.phoneNumber,
        currentStep: tempReg.currentStep,
        isEmailVerified: !!tempReg.emailVerified,
        isPhoneVerified: !!tempReg.phoneVerified,
        accountName: tempReg.accountName,
        accountSlug: tempReg.accountSlug,
        interviewData: tempReg.interviewData || {},
        selectedPlanId: tempReg.selectedPlanId,
      },
      currentStep: STEP_MAP[tempReg.currentStep] || 'form',
    });
  } catch (error) {
    console.error('Get registration status error:', error);
    return NextResponse.json(
      { error: 'Failed to get registration status' },
      { status: 500 }
    );
  }
}
