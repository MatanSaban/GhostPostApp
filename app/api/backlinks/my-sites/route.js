import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { hasPermission } from '@/lib/permissions';

const SESSION_COOKIE = 'user_session';

/**
 * GET /api/backlinks/my-sites
 * Returns all sites the user can list as backlinks - across ALL accounts
 * where the user has SITES_CREATE permission (or is owner/superadmin).
 * Each site includes accountId and accountName for context.
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        isSuperAdmin: true,
        accountMemberships: {
          where: { status: 'ACTIVE' },
          select: {
            accountId: true,
            isOwner: true,
            role: {
              select: {
                name: true,
                permissions: true,
              },
            },
            account: {
              select: {
                id: true,
                name: true,
                sites: {
                  where: { isActive: true },
                  select: {
                    id: true,
                    name: true,
                    url: true,
                    connectionStatus: true,
                    businessCategory: true,
                    contentLanguage: true,
                    businessName: true,
                    businessAbout: true,
                    platform: true,
                    pluginVersion: true,
                    googleIntegration: {
                      select: {
                        gaConnected: true,
                        gscConnected: true,
                      },
                    },
                  },
                  orderBy: { name: 'asc' },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sitesWithPermission = [];

    for (const membership of user.accountMemberships) {
      // Build a member object for permission checking
      const member = {
        isOwner: membership.isOwner,
        role: membership.role ? { permissions: membership.role.permissions } : null,
      };

      // SuperAdmins and owners always have access
      const canCreate = user.isSuperAdmin || hasPermission(member, 'SITES', 'CREATE');

      if (!canCreate) continue;

      for (const site of membership.account.sites) {
        // Check if site already has an active listing
        const existingListing = await prisma.backlinkListing.findFirst({
          where: {
            publisherSiteId: site.id,
            status: { in: ['ACTIVE', 'PAUSED', 'DRAFT'] },
          },
          select: { id: true, status: true },
        });

        const isWordPress = (site.platform || '').toLowerCase() === 'wordpress';
        const hasPlugin = isWordPress && site.connectionStatus === 'CONNECTED' && !!site.pluginVersion;

        // Fallback to interview responses when Site-level fields are null
        let businessCategory = site.businessCategory || null;
        let contentLanguage = site.contentLanguage || null;
        let businessName = site.businessName || null;
        let businessAbout = site.businessAbout || null;

        if (!businessCategory || !contentLanguage || !businessName || !businessAbout) {
          const interview = await prisma.userInterview.findFirst({
            where: { siteId: site.id },
            select: { responses: true },
            orderBy: { updatedAt: 'desc' },
          });
          if (interview?.responses) {
            const r = typeof interview.responses === 'string'
              ? JSON.parse(interview.responses)
              : interview.responses;
            if (!contentLanguage && r.contentLanguage) contentLanguage = r.contentLanguage;
            if (!businessCategory && r.businessInfo?.category) businessCategory = r.businessInfo.category;
            if (!businessName && r.businessInfo?.businessName) businessName = r.businessInfo.businessName;
            if (!businessAbout && r.businessInfo?.about) businessAbout = r.businessInfo.about;
          }
        }

        sitesWithPermission.push({
          siteId: site.id,
          siteName: site.name,
          siteUrl: site.url,
          connectionStatus: site.connectionStatus,
          businessCategory,
          contentLanguage,
          businessName,
          businessAbout,
          platform: site.platform || null,
          isWordPress,
          hasPlugin,
          hasGa4: !!site.googleIntegration?.gaConnected,
          hasGsc: !!site.googleIntegration?.gscConnected,
          accountId: membership.account.id,
          accountName: membership.account.name,
          hasActiveListing: !!existingListing,
          existingListingId: existingListing?.id || null,
          existingListingStatus: existingListing?.status || null,
        });
      }
    }

    return NextResponse.json({ sites: sitesWithPermission });
  } catch (error) {
    console.error('Error fetching user backlink sites:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
