import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import {
  refreshAccessToken,
  fetchAITrafficStats,
  // fetchGSCQueriesForAIPages,
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
 * GET /api/dashboard/stats/ai-traffic?siteId=xxx&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Returns AI-referred traffic: sessions, share, engines breakdown, top landing pages
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
    if (!integration || !integration.gaConnected || !integration.gaPropertyId) {
      return NextResponse.json({ aiTraffic: null });
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
        console.error('[AI Traffic] Token refresh failed:', err);
        return NextResponse.json({ aiTraffic: null, tokenError: true });
      }
    }

    const range = (startDate && endDate) ? { startDate, endDate } : 30;
    const compareRange = (compareStartDate && compareEndDate)
      ? { startDate: compareStartDate, endDate: compareEndDate }
      : null;

    const aiTraffic = await fetchAITrafficStats(accessToken, integration.gaPropertyId, range, compareRange).catch(err => {
      console.error('[AI Traffic] fetchAITrafficStats error:', err.message);
      return null;
    });

    // AI Keywords — disabled for now
    // let aiKeywords = [];
    // if (integration.gscConnected && integration.gscSiteUrl && aiTraffic?.topLandingPages?.length) {
    //   const aiPagePaths = aiTraffic.topLandingPages.map(p => p.page);
    //   aiKeywords = await fetchGSCQueriesForAIPages(accessToken, integration.gscSiteUrl, range, aiPagePaths).catch(err => {
    //     console.error('[AI Traffic] GSC queries for AI pages error:', err.message);
    //     return [];
    //   });
    // }

    return NextResponse.json({ aiTraffic });
  } catch (error) {
    console.error('[AI Traffic] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
