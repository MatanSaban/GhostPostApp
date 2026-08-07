import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

const INTEGRATION_SELECT = {
  type: true,
  status: true,
  lastSeenAt: true,
  clientVersion: true,
  killSwitch: true,
};

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
        isSuperAdmin: true,
        accountMemberships: {
          select: {
            accountId: true,
            isOwner: true,
            role: {
              select: {
                permissions: true,
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

// Resolve the site if the user can access it (SuperAdmin or account member)
async function findAccessibleSite(user, siteId) {
  if (user.isSuperAdmin) {
    return prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, accountId: true },
    });
  }
  const accountIds = user.accountMemberships.map(m => m.accountId);
  return prisma.site.findFirst({
    where: { id: siteId, accountId: { in: accountIds } },
    select: { id: true, accountId: true },
  });
}

/**
 * GET /api/sites/[id]/integrations
 * List the site's transport integrations (SDK / edge proxy / MCP ...) recorded
 * by the contract heartbeat, including each row's kill-switch state.
 */
export async function GET(request, { params }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: siteId } = await params;
    const site = await findAccessibleSite(user, siteId);
    if (!site) {
      return NextResponse.json(
        { error: 'Site not found or unauthorized' },
        { status: 404 }
      );
    }

    const integrations = await prisma.siteIntegration.findMany({
      where: { siteId },
      select: INTEGRATION_SELECT,
    });

    return NextResponse.json({ integrations });
  } catch (error) {
    console.error('Failed to list site integrations:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/sites/[id]/integrations
 * Body: { type, killSwitch } - toggle the kill switch on one transport row.
 * When engaged, the public Contract API serves minimal "paused" payloads for
 * the whole site and contract-mode writes are blocked.
 */
export async function PATCH(request, { params }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: siteId } = await params;
    const site = await findAccessibleSite(user, siteId);
    if (!site) {
      return NextResponse.json(
        { error: 'Site not found or unauthorized' },
        { status: 404 }
      );
    }

    if (!user.isSuperAdmin) {
      // Check if user has SITES_EDIT permission or is owner
      const membership = user.accountMemberships.find(m => m.accountId === site.accountId);
      const hasEditPermission =
        membership?.isOwner ||
        membership?.role?.permissions?.includes('*') ||
        membership?.role?.permissions?.includes('SITES_EDIT');

      if (!hasEditPermission) {
        return NextResponse.json(
          { error: 'Insufficient permissions to modify this site' },
          { status: 403 }
        );
      }
    }

    const body = await request.json().catch(() => ({}));
    const { type, killSwitch } = body || {};
    if (typeof type !== 'string' || !type || typeof killSwitch !== 'boolean') {
      return NextResponse.json(
        { error: 'type (string) and killSwitch (boolean) are required' },
        { status: 400 }
      );
    }

    const updated = await prisma.siteIntegration.updateMany({
      where: { siteId, type },
      data: { killSwitch },
    });
    if (updated.count === 0) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
    }

    const integration = await prisma.siteIntegration.findUnique({
      where: { siteId_type: { siteId, type } },
      select: INTEGRATION_SELECT,
    });

    return NextResponse.json({ success: true, integration });
  } catch (error) {
    console.error('Failed to update site integration:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
