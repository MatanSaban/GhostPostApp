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
        integrationType: true,
      },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Non-plugin transports (SDK / edge proxy / MCP) recorded by the
    // contract heartbeat - empty for plugin-only WordPress sites.
    const transports = await prisma.siteIntegration.findMany({
      where: { siteId },
      select: {
        type: true,
        status: true,
        lastSeenAt: true,
        clientVersion: true,
      },
    });

    return NextResponse.json({
      connectionStatus: site.connectionStatus,
      pluginVersion: site.pluginVersion,
      lastPingAt: site.lastPingAt,
      integrationType: site.integrationType,
      transports,
    });
  } catch (error) {
    console.error('Connection status check error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
