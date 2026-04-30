import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { createDraftUserAndAccount, purgeDraftUserByEmail } from '@/lib/draft-account';

const SESSION_COOKIE = 'user_session';
const REG_DONE_COOKIE = 'reg_done';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

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

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase();

    // Block re-registration only when the email has actually been verified
    // by someone. Unverified abandoned drafts are wiped and replaced so a
    // new registration can take over the address — we don't want a typo
    // or quit-mid-registration to lock an email forever.
    //
    // Once anyone successfully verifies the email (emailVerified is set),
    // it's locked: nobody else can register with it. This prevents the
    // owner from being squatted.
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, registrationStep: true, emailVerified: true },
    });

    if (existing && existing.emailVerified) {
      return NextResponse.json(
        { error: 'A user with this email already exists' },
        { status: 409 }
      );
    }

    // Also block if there's already a verified user on the same phone — same
    // logic, applied before we delete the draft and create a fresh one.
    const candidatePhone = phoneNumber || null;
    if (candidatePhone) {
      const phoneOwner = await prisma.user.findFirst({
        where: { phoneNumber: candidatePhone, phoneVerified: { not: null } },
        select: { id: true },
      });
      if (phoneOwner && phoneOwner.id !== existing?.id) {
        return NextResponse.json(
          { error: 'A user with this phone number already exists' },
          { status: 409 }
        );
      }
    }

    await purgeDraftUserByEmail(normalizedEmail);

    const hashedPassword = await bcrypt.hash(password, 12);

    const { user } = await createDraftUserAndAccount({
      email: normalizedEmail,
      firstName,
      lastName,
      phoneNumber: phoneNumber || null,
      password: hashedPassword,
      authMethod: 'EMAIL',
      consentGiven: true,
      consentDate: new Date(),
      registrationStep: 'VERIFY',
    });

    // Set the regular session cookie immediately. The middleware will restrict
    // this "draft session" to /auth/register until registration completes.
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE,
      path: '/',
    });
    // Freshly-created drafts: ensure any stale reg_done cookie is wiped so the
    // middleware correctly treats them as incomplete.
    cookieStore.delete(REG_DONE_COOKIE);

    return NextResponse.json({
      success: true,
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'An error occurred during registration' },
      { status: 500 }
    );
  }
}
