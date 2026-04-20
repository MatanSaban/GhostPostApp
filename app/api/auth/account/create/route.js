import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { getDraftAccountForUser } from '@/lib/draft-account';

const SESSION_COOKIE = 'user_session';

export async function POST(request) {
  try {
    const body = await request.json();
    const { name, slug } = body;

    const cookieStore = await cookies();
    const sessionUserId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!sessionUserId) {
      return NextResponse.json(
        { error: 'No registration in progress' },
        { status: 400 }
      );
    }

    if (!name || !slug) {
      return NextResponse.json(
        { error: 'Missing required fields: name and slug are required' },
        { status: 400 }
      );
    }

    const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    if (!slugRegex.test(slug)) {
      return NextResponse.json(
        { error: 'Invalid slug format' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: sessionUserId },
      select: { id: true, registrationStep: true, emailVerified: true, phoneVerified: true },
    });

    if (!user) {
      cookieStore.delete(SESSION_COOKIE);
      return NextResponse.json(
        { error: 'Registration not found. Please start over.' },
        { status: 404 }
      );
    }

    if (user.registrationStep === 'VERIFY' && !user.emailVerified && !user.phoneVerified) {
      return NextResponse.json(
        { error: 'Verification required before account setup' },
        { status: 400 }
      );
    }

    const draftAccount = await getDraftAccountForUser(user.id);

    if (!draftAccount) {
      return NextResponse.json(
        { error: 'No draft account found. Please start over.' },
        { status: 404 }
      );
    }

    // Check the chosen slug isn't taken by another account.
    const conflict = await prisma.account.findFirst({
      where: { slug, id: { not: draftAccount.id } },
      select: { id: true },
    });

    if (conflict) {
      return NextResponse.json(
        { error: 'This slug is already taken' },
        { status: 409 }
      );
    }

    await prisma.account.update({
      where: { id: draftAccount.id },
      data: { name, slug },
    });

    // Advance registration step unless the user is further along already.
    if (['VERIFY', 'ACCOUNT_SETUP'].includes(user.registrationStep)) {
      await prisma.user.update({
        where: { id: user.id },
        data: { registrationStep: 'INTERVIEW' },
      });
    }

    return NextResponse.json({
      success: true,
      accountSetup: { name, slug },
    });
  } catch (error) {
    console.error('Account setup error:', error);
    return NextResponse.json(
      { error: 'Failed to save account setup' },
      { status: 500 }
    );
  }
}
