import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import {
  refreshAccessToken,
  fetchGSCReport,
  fetchGSCTopPages,
  fetchGSCTopQueries,
  fetchGSCForKeywords,
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
    const section = searchParams.get('section'); // 'kpis', 'topPages', 'topKeywords', 'trackedKeywords'
    const keywordsParam = searchParams.get('keywords'); // comma-separated keywords for trackedKeywords section

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
    const errors = {};

    const isAuthError = (errMsg) =>
      /\b(401|403|UNAUTHENTICATED|PERMISSION_DENIED|invalid_grant|CREDENTIALS_MISSING)\b/i.test(errMsg || '');

    if (!section || section === 'kpis') {
      result.gsc = await fetchGSCReport(accessToken, integration.gscSiteUrl, range, compareRange).catch(err => {
        console.error('[GSC] fetchGSCReport error:', err.message);
        errors.gsc = err.message;
        return null;
      });
    }

    if (!section || section === 'topPages') {
      result.topPages = await fetchGSCTopPages(accessToken, integration.gscSiteUrl, range, compareRange).catch(err => {
        console.error('[GSC] fetchGSCTopPages error:', err.message);
        errors.topPages = err.message;
        return [];
      });
    }

    if (!section || section === 'topKeywords') {
      result.topQueries = await fetchGSCTopQueries(accessToken, integration.gscSiteUrl, range, compareRange).catch(err => {
        console.error('[GSC] fetchGSCTopQueries error:', err.message);
        errors.topQueries = err.message;
        return [];
      });
    }

    if (section === 'trackedKeywords' && keywordsParam) {
      const keywords = keywordsParam.split(',').map(k => k.trim()).filter(Boolean);
      const forceRefresh = searchParams.get('forceRefresh') === 'true';
      if (keywords.length > 0) {
        // Determine cache key from the date span (maps to preset or custom dates)
        const cacheKey = (() => {
          if (!startDate || !endDate) return '30d';
          const s = new Date(startDate + 'T00:00:00');
          const e = new Date(endDate + 'T00:00:00');
          const days = Math.round((e - s) / 86400000);
          const presetMap = { 7: '7d', 30: '30d', 90: '90d', 180: '180d', 365: '365d' };
          return presetMap[days] || `custom:${startDate}:${endDate}`;
        })();

        const TWELVE_HOURS = 12 * 60 * 60 * 1000;

        // Check cache (skip if forceRefresh)
        const cached = forceRefresh ? null : await prisma.gscKeywordCache.findUnique({
          where: { siteId_rangeKey: { siteId, rangeKey: cacheKey } },
        });

        if (cached && (Date.now() - new Date(cached.fetchedAt).getTime()) < TWELVE_HOURS) {
          const ageMin = Math.round((Date.now() - new Date(cached.fetchedAt).getTime()) / 60000);
          console.log(`[GSC] trackedKeywords served from DB cache (key: ${cacheKey}, age: ${ageMin}min, next refresh in ${Math.round(12 * 60 - ageMin)}min)`);
          result.trackedQueries = cached.data;
          result.cached = true;
        } else {
          console.log(`[GSC] trackedKeywords fetching FRESH from Google Search Console (key: ${cacheKey}${cached ? ', cache expired' : forceRefresh ? ', force refresh' : ', no cache'})`);
          result.trackedQueries = await fetchGSCForKeywords(accessToken, integration.gscSiteUrl, keywords, range, compareRange).catch(err => {
            console.error('[GSC] fetchGSCForKeywords error:', err.message);
            errors.trackedKeywords = err.message;
            return [];
          });

          // Save to cache (only if we got data)
          if (result.trackedQueries && result.trackedQueries.length > 0) {
            await prisma.gscKeywordCache.upsert({
              where: { siteId_rangeKey: { siteId, rangeKey: cacheKey } },
              update: { data: result.trackedQueries, fetchedAt: new Date() },
              create: { siteId, rangeKey: cacheKey, data: result.trackedQueries },
            }).catch(err => console.error('[GSC] Cache write error:', err.message));
          }
        }
      } else {
        result.trackedQueries = [];
      }
    }

    const hasTokenError = isAuthError(errors.gsc) || isAuthError(errors.topPages) || isAuthError(errors.topQueries) || isAuthError(errors.trackedKeywords);
    if (hasTokenError) result.tokenError = true;

    return NextResponse.json(result);
  } catch (error) {
    console.error('[GSC] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
