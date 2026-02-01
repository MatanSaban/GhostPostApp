import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

// GET - Get current user's full profile
export async function GET() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        image: true,
        emailVerified: true,
        phoneVerified: true,
        primaryAuthMethod: true,
        selectedLanguage: true,
        preferredCurrency: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!user.isActive) {
      return NextResponse.json({ error: 'Account deactivated' }, { status: 403 });
    }

    // Get auth providers
    const authProviders = await prisma.authProvider.findMany({
      where: { userId },
      select: {
        id: true,
        provider: true,
        providerAccountId: true,
        isPrimary: true,
        linkedAt: true,
      },
    });

    return NextResponse.json({ user, authProviders });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

// PUT - Update user profile
export async function PUT(request) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { firstName, lastName, phoneNumber, selectedLanguage, preferredCurrency } = body;

    // Validate required fields
    if (firstName !== undefined && typeof firstName !== 'string') {
      return NextResponse.json({ error: 'Invalid first name' }, { status: 400 });
    }

    if (lastName !== undefined && typeof lastName !== 'string') {
      return NextResponse.json({ error: 'Invalid last name' }, { status: 400 });
    }

    // Build update data
    const updateData = {};
    if (firstName !== undefined) updateData.firstName = firstName.trim();
    if (lastName !== undefined) updateData.lastName = lastName.trim();
    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber.trim() || null;
    if (selectedLanguage !== undefined) updateData.selectedLanguage = selectedLanguage;
    if (preferredCurrency !== undefined) updateData.preferredCurrency = preferredCurrency;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        image: true,
        selectedLanguage: true,
        preferredCurrency: true,
      },
    });

    return NextResponse.json({ user: updatedUser });
  } catch (error) {
    console.error('Error updating user profile:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
