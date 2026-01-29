import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

/**
 * POST /api/sites/[id]/disconnect
 * Disconnect the WordPress plugin from this site (initiated from platform)
 */
export async function POST(request, { params }) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Get user and verify access
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        accountMemberships: {
          select: { accountId: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get site
    const site = await prisma.site.findUnique({
      where: { id },
      select: {
        id: true,
        accountId: true,
        connectionStatus: true,
      },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Verify access
    const hasAccess = user.accountMemberships.some(m => m.accountId === site.accountId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Update site status to disconnected
    await prisma.site.update({
      where: { id },
      data: {
        connectionStatus: 'DISCONNECTED',
        // Clear the keys so a new plugin download generates fresh ones
        siteKey: null,
        siteSecret: null,
        pluginVersion: null,
        wpVersion: null,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Site disconnected successfully',
    });
  } catch (error) {
    console.error('Disconnect error:', error);
    return NextResponse.json(
      { error: 'Failed to disconnect site' },
      { status: 500 }
    );
  }
}
