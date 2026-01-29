import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const MAX_ATTEMPTS = 5;
const TEMP_REG_COOKIE = 'temp_reg_id';

export async function POST(request) {
  try {
    const body = await request.json();
    const { tempRegId, code } = body;

    // Get tempRegId from body or cookie
    const cookieStore = await cookies();
    const cookieTempRegId = cookieStore.get(TEMP_REG_COOKIE)?.value;
    const id = tempRegId || cookieTempRegId;

    if (!id || !code) {
      return NextResponse.json(
        { error: 'Missing tempRegId or code' },
        { status: 400 }
      );
    }

    // Find the temp registration
    const tempReg = await prisma.tempRegistration.findUnique({
      where: { id },
    });

    if (!tempReg) {
      return NextResponse.json(
        { error: 'Registration not found. Please start over.' },
        { status: 404 }
      );
    }

    // Find the most recent OTP for this temp registration
    const otpCode = await prisma.otpCode.findFirst({
      where: { tempRegId: id },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpCode) {
      return NextResponse.json(
        { error: 'No OTP code found. Please request a new one.' },
        { status: 404 }
      );
    }

    // Check if already verified
    if (otpCode.verified) {
      return NextResponse.json(
        { error: 'This code has already been used' },
        { status: 400 }
      );
    }

    // Check if expired
    if (new Date() > otpCode.expiresAt) {
      return NextResponse.json(
        { error: 'OTP code has expired. Please request a new one.' },
        { status: 400 }
      );
    }

    // Check max attempts
    if (otpCode.attempts >= MAX_ATTEMPTS) {
      return NextResponse.json(
        { error: 'Too many failed attempts. Please request a new code.' },
        { status: 429 }
      );
    }

    // Verify the code
    if (otpCode.code !== code) {
      // Increment attempts
      await prisma.otpCode.update({
        where: { id: otpCode.id },
        data: { attempts: otpCode.attempts + 1 },
      });

      const remainingAttempts = MAX_ATTEMPTS - otpCode.attempts - 1;
      return NextResponse.json(
        { 
          error: 'Invalid code',
          remainingAttempts,
        },
        { status: 400 }
      );
    }

    // Code is valid - mark as verified
    await prisma.otpCode.update({
      where: { id: otpCode.id },
      data: { verified: true },
    });

    // Update temp registration verification status and step
    const updateData = otpCode.method === 'SMS' 
      ? { phoneVerified: new Date(), currentStep: 'ACCOUNT_SETUP' }
      : { emailVerified: new Date(), currentStep: 'ACCOUNT_SETUP' };

    await prisma.tempRegistration.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      message: 'OTP verified successfully',
      verifiedMethod: otpCode.method,
    });
  } catch (error) {
    console.error('OTP verify error:', error);
    return NextResponse.json(
      { error: 'Failed to verify OTP' },
      { status: 500 }
    );
  }
}
