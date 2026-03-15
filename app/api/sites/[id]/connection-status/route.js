import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

/**
 * GET /api/sites/[id]/connection-status
 * Lightweight endpoint to check a site's plugin connection status.
 * Used for polling during plugin installation flow.
 */
export async function GET(request, { params }) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: siteId } = await params;

    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: {
        connectionStatus: true,
        pluginVersion: true,
        lastPingAt: true,
      },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    return NextResponse.json({
      connectionStatus: site.connectionStatus,
      pluginVersion: site.pluginVersion,
      lastPingAt: site.lastPingAt,
    });
  } catch (error) {
    console.error('Connection status check error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
