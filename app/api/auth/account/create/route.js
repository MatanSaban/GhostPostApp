import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const TEMP_REG_COOKIE = 'temp_reg_id';

export async function POST(request) {
  try {
    const body = await request.json();
    const { name, slug } = body;

    // Get tempRegId from cookie
    const cookieStore = await cookies();
    const tempRegId = cookieStore.get(TEMP_REG_COOKIE)?.value;

    if (!tempRegId) {
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

    // Validate slug format
    const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    if (!slugRegex.test(slug)) {
      return NextResponse.json(
        { error: 'Invalid slug format' },
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

    // Check if slug is already taken by an existing account
    const existingAccount = await prisma.account.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (existingAccount) {
      return NextResponse.json(
        { error: 'This slug is already taken' },
        { status: 409 }
      );
    }

    // Check if slug is reserved by another temp registration
    const existingTempReg = await prisma.tempRegistration.findFirst({
      where: {
        accountSlug: slug,
        id: { not: tempRegId },
      },
    });

    if (existingTempReg) {
      return NextResponse.json(
        { error: 'This slug is already taken' },
        { status: 409 }
      );
    }

    // Update temp registration with account info
    await prisma.tempRegistration.update({
      where: { id: tempRegId },
      data: {
        accountName: name,
        accountSlug: slug,
        currentStep: 'INTERVIEW',
      },
    });

    return NextResponse.json({
      success: true,
      accountSetup: {
        name,
        slug,
      },
    });
  } catch (error) {
    console.error('Account setup error:', error);
    return NextResponse.json(
      { error: 'Failed to save account setup' },
      { status: 500 }
    );
  }
}
