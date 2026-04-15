import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import {
  refreshAccessToken,
  fetchGADailyTraffic,
} from '@/lib/google-integration';

const SESSION_COOKIE = 'user_session';

async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) return null;
    return prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isSuperAdmin: true, accountMemberships: { select: { accountId: true } } },
    });
  } catch {
    return null;
  }
}

/**
 * GET /api/dashboard/stats/traffic-chart?siteId=xxx&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Returns GA4 daily traffic data for a custom date range
 */
export async function GET(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const compareStartDate = searchParams.get('compareStartDate');
    const compareEndDate = searchParams.get('compareEndDate');

    if (!siteId) {
      return NextResponse.json({ error: 'siteId required' }, { status: 400 });
    }

    const siteWhere = user.isSuperAdmin
      ? { id: siteId }
      : { id: siteId, accountId: { in: user.accountMemberships.map(m => m.accountId) } };
    const site = await prisma.site.findFirst({
      where: siteWhere,
      include: { googleIntegration: true },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const integration = site.googleIntegration;
    if (!integration || !integration.gaConnected || !integration.gaPropertyId) {
      return NextResponse.json({ trafficChart: [] });
    }

    // Refresh token if needed
    let accessToken = integration.accessToken;
    const FIVE_MIN = 5 * 60 * 1000;
    const needsRefresh = integration.refreshToken && (
      !integration.tokenExpiresAt ||
      new Date(integration.tokenExpiresAt).getTime() - Date.now() < FIVE_MIN
    );

    if (needsRefresh) {
      try {
        const refreshed = await refreshAccessToken(integration.refreshToken);
        accessToken = refreshed.access_token;
        await prisma.googleIntegration.update({
          where: { id: integration.id },
          data: {
            accessToken: refreshed.access_token,
            tokenExpiresAt: new Date(Date.now() + (refreshed.expires_in || 3600) * 1000),
          },
        });
      } catch (err) {
        console.error('[Traffic Chart] Token refresh failed:', err);
        return NextResponse.json({ trafficChart: [], tokenError: true });
      }
    }

    const compareRange = (compareStartDate && compareEndDate) ? { startDate: compareStartDate, endDate: compareEndDate } : null;
    const result = await fetchGADailyTraffic(
      accessToken,
      integration.gaPropertyId,
      { startDate, endDate },
      compareRange
    ).catch(err => {
      console.error('[Traffic Chart] fetchGADailyTraffic error:', err.message);
      return { rows: [], comparison: null };
    });

    return NextResponse.json({
      trafficChart: Array.isArray(result?.rows ?? result) ? (result.rows ?? result) : [],
      comparison: result?.comparison || null,
    });
  } catch (error) {
    console.error('[Traffic Chart] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
