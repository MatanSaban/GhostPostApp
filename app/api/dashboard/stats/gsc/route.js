import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import {
  refreshAccessToken,
  fetchGSCReport,
  fetchGSCTopPages,
  fetchGSCTopQueries,
} from '@/lib/google-integration';

const SESSION_COOKIE = 'user_session';

async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) return null;
    return prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, accountMemberships: { select: { accountId: true } } },
    });
  } catch {
    return null;
  }
}

/**
 * GET /api/dashboard/stats/gsc?siteId=xxx&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&section=kpis|topPages|topKeywords
 * Returns GSC data for a custom date range.
 * section param filters which data to return (defaults to all).
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
    const section = searchParams.get('section'); // 'kpis', 'topPages', 'topKeywords'

    if (!siteId) {
      return NextResponse.json({ error: 'siteId required' }, { status: 400 });
    }

    const accountIds = user.accountMemberships.map(m => m.accountId);
    const site = await prisma.site.findFirst({
      where: {
        id: siteId,
        accountId: { in: accountIds },
      },
      include: { googleIntegration: true },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const integration = site.googleIntegration;
    if (!integration || !integration.gscConnected || !integration.gscSiteUrl) {
      return NextResponse.json({ gsc: null, topPages: [], topQueries: [] });
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
        console.error('[GSC] Token refresh failed:', err);
        return NextResponse.json({ gsc: null, topPages: [], topQueries: [], tokenError: true });
      }
    }

    const range = (startDate && endDate) ? { startDate, endDate } : 30;
    const compareRange = (compareStartDate && compareEndDate) ? { startDate: compareStartDate, endDate: compareEndDate } : null;
    const result = {};

    if (!section || section === 'kpis') {
      result.gsc = await fetchGSCReport(accessToken, integration.gscSiteUrl, range, compareRange).catch(err => {
        console.error('[GSC] fetchGSCReport error:', err.message);
        return null;
      });
    }

    if (!section || section === 'topPages') {
      result.topPages = await fetchGSCTopPages(accessToken, integration.gscSiteUrl, range, compareRange).catch(err => {
        console.error('[GSC] fetchGSCTopPages error:', err.message);
        return [];
      });
    }

    if (!section || section === 'topKeywords') {
      result.topQueries = await fetchGSCTopQueries(accessToken, integration.gscSiteUrl, range, compareRange).catch(err => {
        console.error('[GSC] fetchGSCTopQueries error:', err.message);
        return [];
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[GSC] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
