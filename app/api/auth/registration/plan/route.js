import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const TEMP_REG_COOKIE = 'temp_reg_id';

export async function POST(request) {
  try {
    const body = await request.json();
    const { planId } = body;

    // Get tempRegId from cookie
    const cookieStore = await cookies();
    const tempRegId = cookieStore.get(TEMP_REG_COOKIE)?.value;

    if (!tempRegId) {
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

    // Look up plan by ID first, then by slug as fallback
    let plan = await prisma.plan.findUnique({
      where: { id: planId },
      select: { id: true, name: true, slug: true, price: true },
    });

    // If not found by ID, try by slug
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

    // Find the temp registration
    const tempReg = await prisma.tempRegistration.findUnique({
      where: { id: tempRegId },
    });

    if (!tempReg) {
      cookieStore.delete(TEMP_REG_COOKIE);
      return NextResponse.json(
        { error: 'Registration not found. Please start over.' },
        { status: 404 }
      );
    }

    // Update temp registration with selected plan (store actual plan ID, not slug)
    await prisma.tempRegistration.update({
      where: { id: tempRegId },
      data: {
        selectedPlanId: plan.id,
        currentStep: 'PAYMENT',
      },
    });

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
