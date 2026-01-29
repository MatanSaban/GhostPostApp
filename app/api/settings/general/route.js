import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

// Get authenticated user with their account memberships
async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { 
        id: true, 
        email: true, 
        firstName: true, 
        lastName: true,
        lastSelectedAccountId: true,
        accountMemberships: {
          select: {
            accountId: true,
            account: {
              select: {
                timezone: true,
                defaultLanguage: true,
              },
            },
          },
        },
      },
    });

    return user;
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

// GET - Get general settings for a site
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

    // Get site data
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: {
        id: true,
        name: true,
        url: true,
        platform: true,
        maintenanceMode: true,
        accountId: true,
        account: {
          select: {
            timezone: true,
            defaultLanguage: true,
          },
        },
      },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Verify user has access to this site's account
    const hasAccess = user.accountMemberships.some(m => m.accountId === site.accountId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Get user's site-specific preferences
    const userPreference = await prisma.userSitePreference.findUnique({
      where: {
        userId_siteId: {
          userId: user.id,
          siteId: siteId,
        },
      },
    });

    return NextResponse.json({
      settings: {
        siteUrl: site.url,
        siteName: site.name,
        platform: site.platform,
        maintenanceMode: site.maintenanceMode,
        // Language: user's site preference > account default
        language: userPreference?.language || site.account.defaultLanguage || 'EN',
        // Timezone: user's site preference > account default
        timezone: userPreference?.timezone || site.account.timezone || 'UTC',
        // Defaults from account (for reference)
        accountDefaults: {
          language: site.account.defaultLanguage || 'EN',
          timezone: site.account.timezone || 'UTC',
        },
      },
    });
  } catch (error) {
    console.error('Failed to fetch settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

// PUT - Update general settings for a site
export async function PUT(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { siteId, siteName, language, timezone, maintenanceMode } = body;

    if (!siteId) {
      return NextResponse.json({ error: 'Site ID is required' }, { status: 400 });
    }

    // NOTE: siteUrl is intentionally NOT accepted - it cannot be changed

    // Get site to verify access
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: {
        id: true,
        accountId: true,
      },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Verify user has access to this site's account
    const hasAccess = user.accountMemberships.some(m => m.accountId === site.accountId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Update site data (name and maintenance mode)
    const siteUpdateData = {};
    if (siteName !== undefined) {
      siteUpdateData.name = siteName;
    }
    if (maintenanceMode !== undefined) {
      siteUpdateData.maintenanceMode = maintenanceMode;
    }

    if (Object.keys(siteUpdateData).length > 0) {
      await prisma.site.update({
        where: { id: siteId },
        data: siteUpdateData,
      });
    }

    // Update or create user's site-specific preferences (language and timezone)
    const preferenceData = {};
    if (language !== undefined) {
      preferenceData.language = language;
    }
    if (timezone !== undefined) {
      preferenceData.timezone = timezone;
    }

    if (Object.keys(preferenceData).length > 0) {
      await prisma.userSitePreference.upsert({
        where: {
          userId_siteId: {
            userId: user.id,
            siteId: siteId,
          },
        },
        update: preferenceData,
        create: {
          userId: user.id,
          siteId: siteId,
          ...preferenceData,
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update settings:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
