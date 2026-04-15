import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { refreshAccessToken } from '@/lib/google-integration';

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
 * GET /api/dashboard/stats/gsc/keywords
 * Paginated GSC keywords with search, sorting, and comparison data.
 * 
 * Query params:
 *   siteId        - required
 *   startDate     - YYYY-MM-DD
 *   endDate       - YYYY-MM-DD
 *   limit         - rows per page (default 20, max 500)
 *   offset        - pagination offset (default 0)
 *   search        - filter queries containing this string
 *   sort          - clicks|impressions|ctr|position (default clicks)
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
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10), 1), 500);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);
    const search = searchParams.get('search')?.trim().toLowerCase() || '';
    const sort = searchParams.get('sort') || 'clicks';

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
    if (!integration?.gscConnected || !integration?.gscSiteUrl) {
      return NextResponse.json({ rows: [], total: 0 });
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
        console.error('[GSC Keywords] Token refresh failed:', err);
        return NextResponse.json({ rows: [], total: 0, tokenError: true });
      }
    }

    // Build date range
    const fmt = (d) => d.toISOString().split('T')[0];
    let rangeStart, rangeEnd;
    if (startDate && endDate) {
      rangeStart = new Date(startDate + 'T00:00:00');
      rangeEnd = new Date(endDate + 'T00:00:00');
    } else {
      rangeEnd = new Date();
      rangeEnd.setDate(rangeEnd.getDate() - 3);
      rangeStart = new Date();
      rangeStart.setDate(rangeStart.getDate() - 30);
    }

    // Comparison period
    const diffMs = rangeEnd.getTime() - rangeStart.getTime();
    const prevEnd = new Date(rangeStart);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd.getTime() - diffMs);

    // We fetch a large batch from GSC (up to limit + offset or max 1000 for search/sort)
    // GSC API max rowLimit is 25000
    const fetchLimit = search ? 5000 : Math.min(limit + offset + 200, 5000);

    const fetchQueries = async (s, e, rowLimit) => {
      const res = await fetch(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(integration.gscSiteUrl)}/searchAnalytics/query`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            startDate: fmt(s),
            endDate: fmt(e),
            dimensions: ['query'],
            rowLimit,
          }),
        }
      );
      if (!res.ok) {
        console.error('[GSC Keywords] Query failed:', res.status);
        return [];
      }
      const data = await res.json();
      return (data.rows || []).map(row => ({
        query: row.keys[0],
        clicks: Math.round(row.clicks),
        impressions: Math.round(row.impressions),
        ctr: (row.ctr * 100).toFixed(1),
        position: row.position?.toFixed(1),
      }));
    };

    const [current, previous] = await Promise.all([
      fetchQueries(rangeStart, rangeEnd, fetchLimit),
      fetchQueries(prevStart, prevEnd, fetchLimit),
    ]);

    // Build comparison map
    const prevMap = new Map(previous.map(r => [r.query, r]));
    const pct = (cur, prev) => {
      if (!prev) return cur > 0 ? 100 : 0;
      return Math.round(((cur - prev) / prev) * 100);
    };

    let enriched = current.map(row => {
      const prev = prevMap.get(row.query);
      const curPosRaw = parseFloat(row.position);
      const prevPosRaw = prev ? parseFloat(prev.position) : null;
      // Round positions FIRST, then calculate the rank difference
      const curRank = Math.round(curPosRaw);
      const prevRank = prevPosRaw != null ? Math.round(prevPosRaw) : null;
      // positionChange is the actual rank difference (positive = improved, e.g., went from 5 to 3 = +2)
      const positionChange = prevRank != null ? prevRank - curRank : null;
      return {
        ...row,
        prevPosition: prevRank, // rounded rank (integer)
        clicksChange: pct(row.clicks, prev?.clicks ?? 0),
        impressionsChange: pct(row.impressions, prev?.impressions ?? 0),
        ctrChange: pct(parseFloat(row.ctr), parseFloat(prev?.ctr ?? 0)),
        positionChange, // actual rank difference, not percentage
      };
    });

    // Apply search filter
    if (search) {
      enriched = enriched.filter(row => row.query.toLowerCase().includes(search));
    }

    // Sort
    const sortKey = ['clicks', 'impressions', 'ctr', 'position'].includes(sort) ? sort : 'clicks';
    enriched.sort((a, b) => {
      const aVal = parseFloat(a[sortKey]) || 0;
      const bVal = parseFloat(b[sortKey]) || 0;
      return sortKey === 'position' ? aVal - bVal : bVal - aVal;
    });

    const total = enriched.length;
    const paginated = enriched.slice(offset, offset + limit);

    return NextResponse.json({ rows: paginated, total, limit, offset });
  } catch (error) {
    console.error('[GSC Keywords] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
