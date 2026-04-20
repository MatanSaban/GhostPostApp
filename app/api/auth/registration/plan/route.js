import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { getDraftAccountForUser } from '@/lib/draft-account';

const SESSION_COOKIE = 'user_session';

export async function POST(request) {
  try {
    const body = await request.json();
    const { planId } = body;

    const cookieStore = await cookies();
    const sessionUserId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!sessionUserId) {
      return NextResponse.json(
        { error: 'No registration in progress' },
        { status: 400 }
      );
    }

    if (!planId) {
      return NextResponse.json(
        { error: 'Plan ID is required' },
        { status: 400 }
      );
    }

    let plan = await prisma.plan.findUnique({
      where: { id: planId },
      select: { id: true, name: true, slug: true, price: true },
    });

    if (!plan) {
      plan = await prisma.plan.findUnique({
        where: { slug: planId },
        select: { id: true, name: true, slug: true, price: true },
      });
    }

    if (!plan) {
      return NextResponse.json(
        { error: 'Invalid plan selected' },
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
      data: { draftSelectedPlanId: plan.id },
    });

    if (['VERIFY', 'ACCOUNT_SETUP', 'INTERVIEW', 'PLAN'].includes(user.registrationStep)) {
      await prisma.user.update({
        where: { id: user.id },
        data: { registrationStep: 'PAYMENT' },
      });
    }

    return NextResponse.json({
      success: true,
      plan: {
        id: plan.id,
        slug: plan.slug,
        name: plan.name,
        price: plan.price,
      },
    });
  } catch (error) {
    console.error('Save plan error:', error);
    return NextResponse.json(
      { error: 'Failed to save plan selection' },
      { status: 500 }
    );
  }
}
