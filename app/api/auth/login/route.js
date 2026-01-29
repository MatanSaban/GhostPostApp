import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';

const TEMP_REG_COOKIE = 'temp_reg_id';
const SESSION_COOKIE = 'user_session';

// Map registration steps to redirect paths
const STEP_REDIRECTS = {
  VERIFY: '/auth/register?step=verify',
  ACCOUNT_SETUP: '/auth/register?step=account-setup',
  INTERVIEW: '/auth/register?step=interview',
  PLAN: '/auth/register?step=plan',
  PAYMENT: '/auth/register?step=payment',
  COMPLETED: '/dashboard',
};

// Map temp registration steps to redirect paths
const TEMP_STEP_REDIRECTS = {
  FORM: '/auth/register?step=form',
  VERIFY: '/auth/register?step=verify',
  ACCOUNT_SETUP: '/auth/register?step=account-setup',
  INTERVIEW: '/auth/register?step=interview',
  PLAN: '/auth/register?step=plan',
  PAYMENT: '/auth/register?step=payment',
};

export async function POST(request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // Validate required fields
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase();

    // First, check if there's a temp registration for this email
    const tempReg = await prisma.tempRegistration.findUnique({
      where: { email: normalizedEmail },
    });

    if (tempReg) {
      // Check if temp registration has expired
      if (new Date() > tempReg.expiresAt) {
        // Delete expired temp registration
        await prisma.tempRegistration.delete({ where: { id: tempReg.id } });
      } else {
        // Temp registration exists and is valid - verify password
        if (!tempReg.password) {
          return NextResponse.json(
            { error: 'Invalid email or password' },
            { status: 401 }
          );
        }

        const isTempPasswordValid = await bcrypt.compare(password, tempReg.password);

        if (isTempPasswordValid) {
          // Password matches temp registration - set cookie and redirect to current step
          const cookieStore = await cookies();
          cookieStore.set(TEMP_REG_COOKIE, tempReg.id, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 7, // 7 days
            path: '/',
          });

          const redirectTo = TEMP_STEP_REDIRECTS[tempReg.currentStep] || '/auth/register';

          return NextResponse.json({
            success: true,
            isTempRegistration: true,
            tempReg: {
              id: tempReg.id,
              email: tempReg.email,
              firstName: tempReg.firstName,
              lastName: tempReg.lastName,
              currentStep: tempReg.currentStep,
            },
            redirectTo,
            isRegistrationComplete: false,
          });
        }
        // If password doesn't match, fall through to check real user
      }
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Check if user is active
    if (!user.isActive) {
      return NextResponse.json(
        { error: 'Your account has been deactivated. Please contact support.' },
        { status: 403 }
      );
    }

    // Check if user has a password (might be OAuth only)
    if (!user.password) {
      return NextResponse.json(
        { error: 'Please login using your original sign-in method' },
        { status: 400 }
      );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Super admins always go to dashboard - they don't need to complete registration
    // Their purpose is platform management, not using the platform as regular users
    if (user.isSuperAdmin) {
      // Set session cookie for super admin
      const cookieStore = await cookies();
      cookieStore.set(SESSION_COOKIE, user.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: '/',
      });

      return NextResponse.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          isSuperAdmin: user.isSuperAdmin,
          registrationStep: 'COMPLETED',
        },
        redirectTo: '/dashboard',
        isRegistrationComplete: true,
      });
    }

    // Determine redirect based on registration step for regular users
    const redirectTo = STEP_REDIRECTS[user.registrationStep] || '/dashboard';
    const isRegistrationComplete = user.registrationStep === 'COMPLETED';

    // Set session cookie for completed registrations
    if (isRegistrationComplete) {
      const cookieStore = await cookies();
      cookieStore.set(SESSION_COOKIE, user.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: '/',
      });
    }

    // Return user data (excluding password)
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isSuperAdmin: user.isSuperAdmin,
        registrationStep: user.registrationStep,
      },
      redirectTo,
      isRegistrationComplete,
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'An error occurred during login' },
      { status: 500 }
    );
  }
}
