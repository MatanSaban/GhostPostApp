import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { 
  generateSiteKey, 
  generateSiteSecret, 
  DEFAULT_SITE_PERMISSIONS 
} from '@/lib/site-keys';
import { enforceResourceLimit } from '@/lib/account-limits';

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
        isSuperAdmin: true,
        lastSelectedAccountId: true,
        accountMemberships: {
          select: {
            accountId: true,
            role: true,
            lastSelectedSiteId: true,
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

// GET - Get all sites for the current user's accounts
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // SuperAdmin: return ALL sites across all accounts
    if (user.isSuperAdmin) {
      const sites = await prisma.site.findMany({
        where: { isActive: true },
        include: { account: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      });

      // Try to find a last selected site from any membership
      const currentMembership = user.accountMemberships[0];
      const lastSelectedSiteId = currentMembership?.lastSelectedSiteId || null;

      return NextResponse.json({ sites, lastSelectedSiteId });
    }

    // Get all account IDs the user has access to
    const accountIds = user.accountMemberships.map(m => m.accountId);
    
    // If user has a selected account, prioritize showing sites from that account
    const selectedAccountId = user.lastSelectedAccountId && accountIds.includes(user.lastSelectedAccountId)
      ? user.lastSelectedAccountId
      : accountIds[0];

    // Get the user's current membership for this account
    const currentMembership = user.accountMemberships.find(m => m.accountId === selectedAccountId);
    const lastSelectedSiteId = currentMembership?.lastSelectedSiteId || null;

    // Get full membership info including isOwner
    const accountMember = await prisma.accountMember.findFirst({
      where: {
        accountId: selectedAccountId,
        userId: user.id,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        isOwner: true,
        siteMembers: {
          select: {
            siteId: true,
          },
        },
      },
    });

    let sites;

    // Owners see all account sites, non-owners only see assigned sites
    if (accountMember?.isOwner) {
      sites = await prisma.site.findMany({
        where: { 
          accountId: selectedAccountId || { in: accountIds },
          isActive: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    } else {
      // Get only sites the user is assigned to
      const assignedSiteIds = accountMember?.siteMembers.map(sm => sm.siteId) || [];
      
      sites = await prisma.site.findMany({
        where: { 
          id: { in: assignedSiteIds },
          accountId: selectedAccountId,
          isActive: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    return NextResponse.json({ sites, lastSelectedSiteId });
  } catch (error) {
    console.error('Failed to fetch sites:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sites' },
      { status: 500 }
    );
  }
}

// POST - Create a new site
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, url, accountId, contentLanguage } = body;

    if (!name || !url) {
      return NextResponse.json(
        { error: 'Name and URL are required' },
        { status: 400 }
      );
    }

    // Use provided accountId or the user's first account
    const targetAccountId = accountId || user.accountMemberships[0]?.accountId;
    
    if (!targetAccountId) {
      return NextResponse.json(
        { error: 'No account available to create site' },
        { status: 400 }
      );
    }

    // Verify user has access to this account
    if (!user.isSuperAdmin && !user.accountMemberships.some(m => m.accountId === targetAccountId)) {
      return NextResponse.json(
        { error: 'Unauthorized to create site in this account' },
        { status: 403 }
      );
    }

    // Check plan limit for sites
    const limitCheck = await enforceResourceLimit(targetAccountId, 'maxSites');
    if (!limitCheck.allowed) {
      return NextResponse.json(limitCheck, { status: 403 });
    }

    // Ensure URL has protocol
    let siteUrl = url;
    if (siteUrl && !siteUrl.startsWith('http://') && !siteUrl.startsWith('https://')) {
      siteUrl = `https://${siteUrl}`;
    }

    // Check for duplicate site URL in the same account
    const normalizedNew = siteUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '').toLowerCase();
    const existingSites = await prisma.site.findMany({
      where: { accountId: targetAccountId, isActive: true },
      select: { url: true },
    });
    const isDuplicate = existingSites.some(s => {
      const normalizedExisting = (s.url || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '').toLowerCase();
      return normalizedExisting === normalizedNew;
    });

    if (isDuplicate) {
      const account = await prisma.account.findUnique({
        where: { id: targetAccountId },
        select: { name: true },
      });
      return NextResponse.json(
        { error: 'DUPLICATE_SITE', accountName: account?.name || '' },
        { status: 409 }
      );
    }

    // Generate site connection keys
    const siteKey = generateSiteKey();
    const siteSecret = generateSiteSecret();

    const site = await prisma.site.create({
      data: {
        name,
        url: siteUrl,
        platform: body.platform || null,
        contentLanguage: contentLanguage || null,
        accountId: targetAccountId,
        siteKey,
        siteSecret,
        connectionStatus: 'PENDING',
        sitePermissions: DEFAULT_SITE_PERMISSIONS,
      },
    });

    // Return site without the secret (it should only be in the downloaded plugin)
    const { siteSecret: _, ...siteWithoutSecret } = site;

    return NextResponse.json({ 
      site: siteWithoutSecret,
      // Include siteKey for display but never siteSecret
      connectionInfo: {
        siteKey: site.siteKey,
        status: site.connectionStatus,
      }
    }, { status: 201 });
  } catch (error) {
    console.error('Failed to create site:', error);
    return NextResponse.json(
      { error: 'Failed to create site' },
      { status: 500 }
    );
  }
}

// PATCH - Update a site (name, url, etc.)
export async function PATCH(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { siteId, name, url, platform } = body;

    if (!siteId) {
      return NextResponse.json(
        { error: 'Site ID is required' },
        { status: 400 }
      );
    }

    // SuperAdmin can update any site; regular users only their own accounts' sites
    let site;
    if (user.isSuperAdmin) {
      site = await prisma.site.findUnique({ where: { id: siteId } });
    } else {
      const accountIds = user.accountMemberships.map(m => m.accountId);
      site = await prisma.site.findFirst({
        where: {
          id: siteId,
          accountId: { in: accountIds },
        },
      });
    }

    if (!site) {
      return NextResponse.json(
        { error: 'Site not found or unauthorized' },
        { status: 404 }
      );
    }

    // Build update data
    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (url !== undefined) updateData.url = url.trim();
    if (platform !== undefined) updateData.platform = platform;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    const updatedSite = await prisma.site.update({
      where: { id: siteId },
      data: updateData,
    });

    return NextResponse.json({ site: updatedSite });
  } catch (error) {
    console.error('Failed to update site:', error);
    return NextResponse.json(
      { error: 'Failed to update site' },
      { status: 500 }
    );
  }
}
