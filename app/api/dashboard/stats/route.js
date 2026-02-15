import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import {
  refreshAccessToken,
  fetchGAReport,
  fetchGADailyTraffic,
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
 * GET /api/dashboard/stats?siteId=xxx
 * Returns real GA + GSC data for the dashboard
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

    if (!siteId) {
      return NextResponse.json({ error: 'siteId required' }, { status: 400 });
    }

    // Verify user has access to this site
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
    if (!integration) {
      return NextResponse.json({
        gaConnected: false,
        gscConnected: false,
        ga: null,
        gsc: null,
        trafficChart: [],
        topPages: [],
      });
    }

    // Refresh token if needed – always refresh when expiry is unknown (null)
    // or within 5 minutes of expiry to avoid stale tokens
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
        console.error('[Dashboard Stats] Token refresh failed:', err);
        // Don't wipe GA/GSC configuration — just report the error.
        // The settings page handles cleanup when the user visits it.
        return NextResponse.json({
          gaConnected: integration.gaConnected,
          gscConnected: integration.gscConnected,
          gaPropertyName: integration.gaPropertyName,
          gscSiteUrl: integration.gscSiteUrl,
          ga: null,
          gsc: null,
          trafficChart: [],
          topPages: [],
          topQueries: [],
          tokenError: true,
        });
      }
    }

    // Helper: check if an error is an auth/token error (401/403)
    const isAuthError = (errMsg) =>
      /\b(401|403|UNAUTHENTICATED|PERMISSION_DENIED|invalid_grant)\b/i.test(errMsg || '');

    // Fetch data in parallel
    const promises = {};
    const errors = {};

    if (integration.gaConnected && integration.gaPropertyId) {
      promises.ga = fetchGAReport(accessToken, integration.gaPropertyId, 30).catch(err => {
        console.error('[Dashboard Stats] fetchGAReport error:', err.message);
        errors.ga = err.message;
        return null;
      });
      const chartRange = (startDate && endDate) ? { startDate, endDate } : 7;
      promises.trafficChart = fetchGADailyTraffic(accessToken, integration.gaPropertyId, chartRange).catch(err => {
        console.error('[Dashboard Stats] fetchGADailyTraffic error:', err.message);
        errors.trafficChart = err.message;
        return null; // null = error, [] = genuine empty
      });
    }

    if (integration.gscConnected && integration.gscSiteUrl) {
      promises.gsc = fetchGSCReport(accessToken, integration.gscSiteUrl, 30).catch(err => {
        console.error('[Dashboard Stats] fetchGSCReport error:', err.message);
        errors.gsc = err.message;
        return null;
      });
      promises.topPages = fetchGSCTopPages(accessToken, integration.gscSiteUrl, 30).catch(err => {
        console.error('[Dashboard Stats] fetchGSCTopPages error:', err.message);
        errors.topPages = err.message;
        return null;
      });
      promises.topQueries = fetchGSCTopQueries(accessToken, integration.gscSiteUrl, 30).catch(err => {
        console.error('[Dashboard Stats] fetchGSCTopQueries error:', err.message);
        errors.topQueries = err.message;
        return null;
      });
    }

    const keys = Object.keys(promises);
    const results = await Promise.all(Object.values(promises));
    const resolved = {};
    keys.forEach((key, i) => {
      resolved[key] = results[i];
    });

    // Only flag tokenError for actual auth failures (401/403), not transient API errors
    const hasTokenError = isAuthError(errors.ga) || isAuthError(errors.trafficChart);

    console.log('[Dashboard Stats] Results:', {
      gaConnected: integration.gaConnected,
      gscConnected: integration.gscConnected,
      hasGA: !!resolved.ga,
      trafficChartLen: Array.isArray(resolved.trafficChart?.rows ?? resolved.trafficChart) ? (resolved.trafficChart?.rows ?? resolved.trafficChart).length : 'null',
      topPagesLen: Array.isArray(resolved.topPages) ? resolved.topPages.length : 'null',
      topQueriesLen: Array.isArray(resolved.topQueries) ? resolved.topQueries.length : 'null',
      errors,
      hasTokenError,
    });

    return NextResponse.json({
      gaConnected: integration.gaConnected,
      gscConnected: integration.gscConnected,
      gaPropertyName: integration.gaPropertyName,
      gscSiteUrl: integration.gscSiteUrl,
      ga: resolved.ga || null,
      gsc: resolved.gsc || null,
      trafficChart: Array.isArray(resolved.trafficChart?.rows ?? resolved.trafficChart) ? (resolved.trafficChart?.rows ?? resolved.trafficChart) : [],
      trafficComparison: resolved.trafficChart?.comparison || null,
      topPages: Array.isArray(resolved.topPages) ? resolved.topPages : [],
      topQueries: Array.isArray(resolved.topQueries) ? resolved.topQueries : [],
      tokenError: hasTokenError,
    });
  } catch (error) {
    console.error('[Dashboard Stats] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
