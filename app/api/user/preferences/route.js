import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

// Get authenticated user
async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    return user;
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

// GET - Get UI preferences for a site
export async function GET(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');

    if (!siteId) {
      return NextResponse.json({ error: 'Site ID is required' }, { status: 400 });
    }

    const preference = await prisma.userSitePreference.findUnique({
      where: {
        userId_siteId: {
          userId: user.id,
          siteId,
        },
      },
      select: {
        uiPreferences: true,
      },
    });

    return NextResponse.json({
      uiPreferences: preference?.uiPreferences || {},
    });
  } catch (error) {
    console.error('Error fetching preferences:', error);
    return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 });
  }
}

// PATCH - Update UI preferences for a site
export async function PATCH(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { siteId, key, value } = body;

    if (!siteId || !key) {
      return NextResponse.json({ error: 'Site ID and key are required' }, { status: 400 });
    }

    // Get existing preferences
    const existing = await prisma.userSitePreference.findUnique({
      where: {
        userId_siteId: {
          userId: user.id,
          siteId,
        },
      },
      select: {
        uiPreferences: true,
      },
    });

    const currentPreferences = (existing?.uiPreferences || {});
    const updatedPreferences = {
      ...currentPreferences,
      [key]: value,
    };

    // Upsert the preference
    const preference = await prisma.userSitePreference.upsert({
      where: {
        userId_siteId: {
          userId: user.id,
          siteId,
        },
      },
      update: {
        uiPreferences: updatedPreferences,
      },
      create: {
        userId: user.id,
        siteId,
        uiPreferences: updatedPreferences,
      },
      select: {
        uiPreferences: true,
      },
    });

    return NextResponse.json({
      uiPreferences: preference.uiPreferences,
    });
  } catch (error) {
    console.error('Error updating preferences:', error);
    return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 });
  }
}
