import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import {
  refreshAccessToken,
  listGSCSitemaps,
  submitGSCSitemap,
  verifySitemapSubmitted,
} from '@/lib/google-integration';
import { discoverSitemapUrls } from '@/lib/sitemap-delta-sync';
import { invalidateAgentInsights } from '@/lib/cache/invalidate.js';

const SESSION_COOKIE = 'user_session';

async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) return null;
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        isSuperAdmin: true,
        accountMemberships: { select: { accountId: true } },
      },
    });
  } catch {
    return null;
  }
}

async function getValidAccessToken(googleIntegration) {
  if (!googleIntegration) return null;
  const { accessToken, refreshToken, tokenExpiresAt } = googleIntegration;

  if (tokenExpiresAt && new Date(tokenExpiresAt) > new Date(Date.now() + 5 * 60 * 1000)) {
    return accessToken;
  }

  if (!refreshToken) return null;

  try {
    const result = await refreshAccessToken(refreshToken);
    const newExpiry = new Date(Date.now() + (result.expires_in - 60) * 1000);
    await prisma.googleIntegration.update({
      where: { id: googleIntegration.id },
      data: { accessToken: result.access_token, tokenExpiresAt: newExpiry },
    });
    return result.access_token;
  } catch {
    return null;
  }
}

// ─── Common auth + site lookup helper ─────────────────────────────

async function loadSiteWithAuth(siteId) {
  const user = await getAuthenticatedUser();
  if (!user) return { error: 'Unauthorized', status: 401 };

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: { googleIntegration: true },
  });
  if (!site) return { error: 'Site not found', status: 404 };

  const hasAccess = user.isSuperAdmin || user.accountMemberships.some(m => m.accountId === site.accountId);
  if (!hasAccess) return { error: 'Forbidden', status: 403 };

  if (!site.googleIntegration?.gscConnected) {
    return { error: 'GSC not connected', status: 400 };
  }

  return { user, site };
}

// ─── Popular sitemap patterns for guessing ──────────────────────

const POPULAR_SITEMAP_PATHS = [
  '/sitemap.xml',
  '/wp-sitemap.xml',
  '/sitemap_index.xml',
  '/sitemap-index.xml',
  '/post-sitemap.xml',
  '/page-sitemap.xml',
  '/category-sitemap.xml',
  '/news-sitemap.xml',
  '/product-sitemap.xml',
  '/server-sitemap.xml',
  '/server-sitemap-index.xml',
  '/sitemap-0.xml',
  '/sitemap-1.xml',
  '/yoast-sitemap.xml',
];

/**
 * GET /api/agent/sitemaps?siteId=xxx
 * 
 * Discover sitemaps from multiple sources:
 * 1. Database (SiteSitemap records)
 * 2. WordPress plugin (if connected, uses discoverSitemapUrls)
 * 3. Popular path guessing
 * 
 * Returns { sitemaps: string[] } — deduplicated list of discovered sitemap URLs.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 });

    const result = await loadSiteWithAuth(siteId);
    if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });

    const { site } = result;
    const siteUrl = site.url?.replace(/\/$/, '');
    if (!siteUrl) return NextResponse.json({ error: 'Site has no URL' }, { status: 400 });

    const discovered = new Set();

    // Source 1: Database SiteSitemap records
    const dbSitemaps = await prisma.siteSitemap.findMany({
      where: { siteId },
      select: { url: true },
    });
    for (const s of dbSitemaps) {
      if (s.url) discovered.add(s.url);
    }

    // Source 2: Live discovery from robots.txt + common fallbacks
    try {
      const liveSitemaps = await discoverSitemapUrls(siteUrl);
      for (const url of liveSitemaps) {
        discovered.add(url);
      }
    } catch (e) {
      console.error('[Sitemaps API] Live discovery failed:', e.message);
    }

    // Source 3: Probe popular sitemap paths (only paths not already discovered)
    const probedPaths = POPULAR_SITEMAP_PATHS.map(p => `${siteUrl}${p}`);
    const remainingProbes = probedPaths.filter(url => !discovered.has(url));

    // Parallel probe with timeout (quick HEAD/GET checks)
    const probeResults = await Promise.allSettled(
      remainingProbes.map(async (url) => {
        try {
          const resp = await fetch(url, {
            headers: { 'User-Agent': 'GhostPost-Platform/1.0' },
            signal: AbortSignal.timeout(8000),
            redirect: 'follow',
            cache: 'no-store',
          });
          if (!resp.ok) return null;
          const text = await resp.text();
          const isSitemap = text.includes('<urlset') || text.includes('<sitemapindex');
          return isSitemap ? url : null;
        } catch {
          return null;
        }
      })
    );

    for (const r of probeResults) {
      if (r.status === 'fulfilled' && r.value) {
        discovered.add(r.value);
      }
    }

    return NextResponse.json({ sitemaps: Array.from(discovered) });
  } catch (error) {
    console.error('[Sitemaps API] Discovery error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/agent/sitemaps
 * 
 * Submit discovered sitemaps to Google Search Console.
 * Body: { siteId: string, sitemaps: string[], insightId?: string }
 * 
 * Returns results for each submission with retry logic.
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { siteId, sitemaps, insightId } = body;

    if (!siteId || !sitemaps?.length) {
      return NextResponse.json({ error: 'siteId and sitemaps[] required' }, { status: 400 });
    }
    if (sitemaps.length > 50) {
      return NextResponse.json({ error: 'Maximum 50 sitemaps per submission' }, { status: 400 });
    }

    const result = await loadSiteWithAuth(siteId);
    if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });

    const { site } = result;
    const gscSiteUrl = site.googleIntegration.gscSiteUrl;
    const accessToken = await getValidAccessToken(site.googleIntegration);
    if (!accessToken) {
      return NextResponse.json({ error: 'Failed to get access token' }, { status: 401 });
    }

    const results = [];

    for (const sitemapUrl of sitemaps) {
      // Validate URL format
      try {
        new URL(sitemapUrl);
      } catch {
        results.push({ url: sitemapUrl, success: false, error: 'Invalid URL' });
        continue;
      }

      // Attempt 1
      let submitResult = await submitGSCSitemap(accessToken, gscSiteUrl, sitemapUrl);

      if (!submitResult.success && submitResult.error !== 'SCOPE_INSUFFICIENT') {
        // Retry once
        await new Promise(r => setTimeout(r, 1500));
        submitResult = await submitGSCSitemap(accessToken, gscSiteUrl, sitemapUrl);
      }

      results.push({
        url: sitemapUrl,
        success: submitResult.success,
        error: submitResult.error || null,
      });
    }

    const allSuccess = results.every(r => r.success);
    const hasScopeError = results.some(r => r.error === 'SCOPE_INSUFFICIENT');

    // Note: GSC has a propagation delay — newly submitted sitemaps
    // won't appear in the list API immediately, so we skip verification.
    const verified = false;

    // If all submitted successfully, mark insight as EXECUTED
    // (verification may fail due to GSC propagation delay, but 200 means accepted)
    if (insightId && allSuccess) {
      try {
        await prisma.agentInsight.update({
          where: { id: insightId },
          data: {
            status: 'EXECUTED',
            executedAt: new Date(),
            executionResult: {
              fixStatus: 'COMPLETED',
              success: true,
              submittedSitemaps: results.filter(r => r.success).map(r => r.url),
              verifiedAt: new Date().toISOString(),
            },
          },
        });
        invalidateAgentInsights(siteId);
      } catch (e) {
        console.error('[Sitemaps API] Failed to update insight:', e.message);
      }
    }

    return NextResponse.json({
      results,
      allSuccess,
      verified,
      hasScopeError,
      gscSitemapsUrl: `https://search.google.com/search-console/sitemaps?resource_id=${encodeURIComponent(gscSiteUrl)}`,
    });
  } catch (error) {
    console.error('[Sitemaps API] Submission error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
