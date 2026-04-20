import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { getDraftAccountForUser } from '@/lib/draft-account';

const SESSION_COOKIE = 'user_session';

export async function POST(request) {
  try {
    const body = await request.json();
    const { interviewData, isComplete = false } = body;

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

    const draftAccount = await getDraftAccountForUser(user.id);

    if (!draftAccount) {
      return NextResponse.json(
        { error: 'No draft account found. Please start over.' },
        { status: 404 }
      );
    }

    await prisma.account.update({
      where: { id: draftAccount.id },
      data: { draftInterviewData: interviewData || {} },
    });

    // On any interaction with the interview, advance ACCOUNT_SETUP → INTERVIEW
    // so that a refresh resumes the user on the interview step (not the
    // previously-completed account-setup step).
    let nextStep = null;
    if (isComplete && ['VERIFY', 'ACCOUNT_SETUP', 'INTERVIEW'].includes(user.registrationStep)) {
      nextStep = 'PLAN';
    } else if (['VERIFY', 'ACCOUNT_SETUP'].includes(user.registrationStep)) {
      nextStep = 'INTERVIEW';
    }

    if (nextStep) {
      await prisma.user.update({
        where: { id: user.id },
        data: { registrationStep: nextStep },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Save interview error:', error);
    return NextResponse.json(
      { error: 'Failed to save interview data' },
      { status: 500 }
    );
  }
}
