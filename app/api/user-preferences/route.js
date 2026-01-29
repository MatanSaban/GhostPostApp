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

    return { id: userId };
  } catch (error) {
    console.error('Error getting authenticated user:', error);
    return null;
  }
}

// GET - Get user's language preference for a specific site
export async function GET(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');

    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
    }

    // Get user's preference for this site
    const userPreference = await prisma.userSitePreference.findUnique({
      where: {
        userId_siteId: {
          userId: user.id,
          siteId,
        },
      },
    });

    // If no preference exists, return null (will use default)
    return NextResponse.json({
      language: userPreference?.language || null,
      timezone: userPreference?.timezone || null,
    });
  } catch (error) {
    console.error('Error fetching user preferences:', error);
    return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 });
  }
}
