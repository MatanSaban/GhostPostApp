import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

// Cookie name for temp registration ID
const TEMP_REG_COOKIE = 'temp_reg_id';
// Temp registration expires after 7 days
const TEMP_REG_EXPIRY_DAYS = 7;

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      firstName,
      lastName,
      email,
      phoneNumber,
      password,
      consent,
    } = body;

    // Validate required fields
    if (!firstName || !lastName || !email || !password) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (!consent) {
      return NextResponse.json(
        { error: 'You must agree to the terms and conditions' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase();

    // Check if a real user already exists with this email
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'A user with this email already exists' },
        { status: 409 }
      );
    }

    // Check if there's an existing temp registration for this email
    let tempReg = await prisma.tempRegistration.findUnique({
      where: { email: normalizedEmail },
    });

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 12);
    const expiresAt = new Date(Date.now() + TEMP_REG_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    if (tempReg) {
      // Update the existing temp registration
      tempReg = await prisma.tempRegistration.update({
        where: { id: tempReg.id },
        data: {
          firstName,
          lastName,
          phoneNumber: phoneNumber || null,
          password: hashedPassword,
          consentGiven: true,
          consentDate: new Date(),
          currentStep: 'VERIFY',
          expiresAt,
          // Reset verification if re-submitting form
          emailVerified: null,
          phoneVerified: null,
        },
      });
    } else {
      // Create a new temp registration
      tempReg = await prisma.tempRegistration.create({
        data: {
          email: normalizedEmail,
          firstName,
          lastName,
          phoneNumber: phoneNumber || null,
          password: hashedPassword,
          consentGiven: true,
          consentDate: new Date(),
          currentStep: 'VERIFY',
          expiresAt,
        },
      });
    }

    // Set cookie with temp registration ID
    const cookieStore = await cookies();
    cookieStore.set(TEMP_REG_COOKIE, tempReg.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: TEMP_REG_EXPIRY_DAYS * 24 * 60 * 60, // 7 days in seconds
      path: '/',
    });

    // Return success
    return NextResponse.json({
      success: true,
      tempRegId: tempReg.id,
      email: tempReg.email,
      firstName: tempReg.firstName,
      lastName: tempReg.lastName,
    });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'An error occurred during registration' },
      { status: 500 }
    );
  }
}
