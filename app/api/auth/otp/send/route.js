import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { sendEmail, emailTemplates } from '@/lib/mailer';

const TEMP_REG_COOKIE = 'temp_reg_id';

// Generate a random 4-digit OTP
function generateOtp() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { tempRegId, method } = body; // method: 'SMS' or 'EMAIL'

    // Get tempRegId from body or cookie
    const cookieStore = await cookies();
    const cookieTempRegId = cookieStore.get(TEMP_REG_COOKIE)?.value;
    const id = tempRegId || cookieTempRegId;

    if (!id || !method) {
      return NextResponse.json(
        { error: 'Missing tempRegId or method' },
        { status: 400 }
      );
    }

    // Validate method
    if (!['SMS', 'EMAIL'].includes(method)) {
      return NextResponse.json(
        { error: 'Invalid OTP method. Use SMS or EMAIL' },
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

    // Check if temp registration has expired
    if (new Date() > tempReg.expiresAt) {
      await prisma.tempRegistration.delete({ where: { id } });
      return NextResponse.json(
        { error: 'Registration expired. Please start over.' },
        { status: 410 }
      );
    }

    // Generate OTP code
    const code = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Delete any existing OTP codes for this temp registration
    await prisma.otpCode.deleteMany({
      where: { tempRegId: id },
    });

    // Create new OTP code
    await prisma.otpCode.create({
      data: {
        tempRegId: id,
        code,
        method,
        expiresAt,
        verified: false,
        attempts: 0,
      },
    });

    // Update temp registration with OTP method
    await prisma.tempRegistration.update({
      where: { id },
      data: { otpMethod: method },
    });

    // Send the OTP via SMS or Email
    if (method === 'EMAIL') {
      const { subject, html } = emailTemplates.otp({ code });
      await sendEmail({
        to: tempReg.email,
        subject,
        html,
      });
    } else if (method === 'SMS') {
      // TODO: Implement SMS sending service (e.g., Twilio)
      console.log(`📱 SMS OTP Code for ${tempReg.phoneNumber}: ${code}`);
    }

    // Log in development for debugging
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔐 OTP Code for ${tempReg.email}: ${code} (via ${method})`);
    }

    return NextResponse.json({
      success: true,
      message: `OTP sent via ${method}`,
      // Only include code in development for testing
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
