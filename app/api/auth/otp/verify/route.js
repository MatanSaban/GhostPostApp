import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const MAX_ATTEMPTS = 5;
const SESSION_COOKIE = 'user_session';

export async function POST(request) {
  try {
    const body = await request.json();
    const { code } = body;

    if (!code) {
      return NextResponse.json(
        { error: 'Missing verification code' },
        { status: 400 }
      );
    }

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
      select: { id: true, registrationStep: true },
    });

    if (!user) {
      cookieStore.delete(SESSION_COOKIE);
      return NextResponse.json(
        { error: 'Registration not found. Please start over.' },
        { status: 404 }
      );
    }

    const otpCode = await prisma.otpCode.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpCode) {
      return NextResponse.json(
        { error: 'No OTP code found. Please request a new one.' },
        { status: 404 }
      );
    }

    if (otpCode.verified) {
      return NextResponse.json(
        { error: 'This code has already been used' },
        { status: 400 }
      );
    }

    if (new Date() > otpCode.expiresAt) {
      return NextResponse.json(
        { error: 'OTP code has expired. Please request a new one.' },
        { status: 400 }
      );
    }

    if (otpCode.attempts >= MAX_ATTEMPTS) {
      return NextResponse.json(
        { error: 'Too many failed attempts. Please request a new code.' },
        { status: 429 }
      );
    }

    if (otpCode.code !== code) {
      await prisma.otpCode.update({
        where: { id: otpCode.id },
        data: { attempts: otpCode.attempts + 1 },
      });

      const remainingAttempts = MAX_ATTEMPTS - otpCode.attempts - 1;
      return NextResponse.json(
        { error: 'Invalid code', remainingAttempts },
        { status: 400 }
      );
    }

    await prisma.otpCode.update({
      where: { id: otpCode.id },
      data: { verified: true },
    });

    const verificationData = otpCode.method === 'SMS'
      ? { phoneVerified: new Date() }
      : { emailVerified: new Date() };

    // Advance registration step only if still at VERIFY; don't regress a user
    // who somehow re-verifies after progressing further.
    await prisma.user.update({
      where: { id: user.id },
      data: {
        ...verificationData,
        ...(user.registrationStep === 'VERIFY'
          ? { registrationStep: 'ACCOUNT_SETUP' }
          : {}),
      },
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
