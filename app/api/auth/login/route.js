import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';
const REG_DONE_COOKIE = 'reg_done';

// Map registration steps to redirect paths
const STEP_REDIRECTS = {
  VERIFY: '/auth/register?step=verify',
  ACCOUNT_SETUP: '/auth/register?step=account-setup',
  INTERVIEW: '/auth/register?step=interview',
  PLAN: '/auth/register?step=plan',
  PAYMENT: '/auth/register?step=payment',
  COMPLETED: '/dashboard',
};

export async function POST(request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    if (!user.isActive) {
      return NextResponse.json(
        { error: 'Your account has been deactivated. Please contact support.' },
        { status: 403 }
      );
    }

    if (!user.password) {
      return NextResponse.json(
        { error: 'Please login using your original sign-in method' },
        { status: 400 }
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const cookieStore = await cookies();
    const isRegistrationComplete = user.registrationStep === 'COMPLETED' || user.isSuperAdmin;

    // Set session cookie for every authenticated user — including mid-registration
    // drafts. The middleware uses the reg_done cookie to tell completed from draft.
    cookieStore.set(SESSION_COOKIE, user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    if (isRegistrationComplete) {
      cookieStore.set(REG_DONE_COOKIE, '1', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
        path: '/',
      });
    } else {
      // Ensure stale reg_done cookies don't let a draft user through.
      cookieStore.delete(REG_DONE_COOKIE);
    }

    if (user.isSuperAdmin) {
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

    const redirectTo = STEP_REDIRECTS[user.registrationStep] || '/dashboard';

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
