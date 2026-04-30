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

    // Mongo ObjectID = 24-char hex. Anything else is treated as a slug, because
    // Prisma throws P2023 on malformed ObjectIDs instead of returning null.
    const looksLikeObjectId = typeof planId === 'string' && /^[a-f0-9]{24}$/i.test(planId);
    const select = { id: true, name: true, slug: true, price: true };

    // Run the plan, user, and draft-account lookups in parallel — they don't
    // depend on each other (only on session/body), so a single round of
    // network latency to Mongo instead of three sequential ones.
    const [planById, user, draftAccount] = await Promise.all([
      looksLikeObjectId
        ? prisma.plan.findUnique({ where: { id: planId }, select })
        : Promise.resolve(null),
      prisma.user.findUnique({
        where: { id: sessionUserId },
        select: { id: true, registrationStep: true },
      }),
      getDraftAccountForUser(sessionUserId),
    ]);

    // Slug fallback only if the ObjectId lookup didn't hit. Sequential by
    // necessity (depends on the parallel planById result).
    const plan = planById
      || (await prisma.plan.findUnique({ where: { slug: planId }, select }));

    if (!plan) {
      return NextResponse.json(
        { error: 'Invalid plan selected' },
        { status: 400 }
      );
    }

    if (!user) {
      cookieStore.delete(SESSION_COOKIE);
      return NextResponse.json(
        { error: 'Registration not found. Please start over.' },
        { status: 404 }
      );
    }

    if (!draftAccount) {
      return NextResponse.json(
        { error: 'No draft account found. Please start over.' },
        { status: 404 }
      );
    }

    // Two writes in parallel as well. Conditional registrationStep bump is
    // only emitted when needed so we don't pay a write when the user is
    // already past PAYMENT (e.g. revisits to change their plan).
    const writes = [
      prisma.account.update({
        where: { id: draftAccount.id },
        data: { draftSelectedPlanId: plan.id },
      }),
    ];
    if (['VERIFY', 'ACCOUNT_SETUP', 'INTERVIEW', 'PLAN'].includes(user.registrationStep)) {
      writes.push(
        prisma.user.update({
          where: { id: user.id },
          data: { registrationStep: 'PAYMENT' },
        })
      );
    }
    await Promise.all(writes);

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
