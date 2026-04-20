import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { sendEmail, emailTemplates } from '@/lib/mailer';

const SESSION_COOKIE = 'user_session';

function generateOtp() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { method } = body; // 'SMS' | 'EMAIL'

    if (!method || !['SMS', 'EMAIL'].includes(method)) {
      return NextResponse.json(
        { error: 'Invalid OTP method. Use SMS or EMAIL' },
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
      select: {
        id: true,
        email: true,
        phoneNumber: true,
        registrationStep: true,
      },
    });

    if (!user) {
      cookieStore.delete(SESSION_COOKIE);
      return NextResponse.json(
        { error: 'Registration not found. Please start over.' },
        { status: 404 }
      );
    }

    if (user.registrationStep === 'COMPLETED') {
      return NextResponse.json(
        { error: 'Registration already complete' },
        { status: 400 }
      );
    }

    const code = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Replace any existing unverified OTP codes for this user.
    await prisma.otpCode.deleteMany({
      where: { userId: user.id, verified: false },
    });

    await prisma.otpCode.create({
      data: {
        userId: user.id,
        code,
        method,
        expiresAt,
        verified: false,
        attempts: 0,
      },
    });

    if (method === 'EMAIL') {
      const { subject, html } = emailTemplates.otp({ code });
      await sendEmail({
        to: user.email,
        subject,
        html,
      });
    } else if (method === 'SMS') {
      // TODO: Implement SMS sending service (e.g., Twilio)
      console.log(`SMS OTP Code for ${user.phoneNumber}: ${code}`);
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`OTP Code for ${user.email}: ${code} (via ${method})`);
    }

    return NextResponse.json({
      success: true,
      message: `OTP sent via ${method}`,
      ...(process.env.NODE_ENV === 'development' && { code }),
    });
  } catch (error) {
    console.error('OTP send error:', error);
    return NextResponse.json(
      { error: 'Failed to send OTP' },
      { status: 500 }
    );
  }
}
