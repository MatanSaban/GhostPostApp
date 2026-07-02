import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { batchGetSearchVolume, isGoogleAdsConfigured, getLanguageId } from '@/lib/google-ads';
import { fetchSearchVolumeDFS, isDataForSEOConfigured } from '@/lib/dataforseo/keywords';
import { getLocationCode, getLanguageCode } from '@/lib/dataforseo/serp';
import { invalidateKeywords } from '@/lib/cache/invalidate.js';

const SESSION_COOKIE = 'user_session';

const CACHE_TTL_DAYS = 30;

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!userId) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isSuperAdmin: true },
  });
}

/**
 * POST /api/keywords/search-volume
 * 
 * Body: { siteId: string, keywords: string[], geo?: string, language?: string }
 * 
 * Returns cached results when available (< 30 days old),
 * fetches from Google Ads API for missing/stale keywords.
 */
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { siteId, keywords, geo = 'IL', language } = body;

    if (!siteId || !keywords?.length) {
      return NextResponse.json({ error: 'siteId and keywords are required' }, { status: 400 });
    }

    // Verify user has access to this site
    const site = await prisma.site.findFirst({
      where: user.isSuperAdmin
        ? { id: siteId }
        : { id: siteId, account: { members: { some: { userId: user.id } } } },
      select: { id: true, contentLanguage: true },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found or no access' }, { status: 404 });
    }

    const langId = language || getLanguageId(site.contentLanguage?.toLowerCase()) || '1000';
    const normalizedKeywords = keywords.map(k => k.toLowerCase().trim()).filter(Boolean);
    const uniqueKeywords = [...new Set(normalizedKeywords)];

    // Check cache first
    const staleDate = new Date(Date.now() - CACHE_TTL_DAYS * 24 * 60 * 60 * 1000);
    const cached = await prisma.keywordVolumeCache.findMany({
      where: {
        keyword: { in: uniqueKeywords },
        geo,
        language: langId,
        fetchedAt: { gte: staleDate },
      },
    });

    const cachedMap = new Map();
    for (const c of cached) {
      cachedMap.set(c.keyword, c);
    }

    // Find keywords not in cache
    const missingKeywords = uniqueKeywords.filter(kw => !cachedMap.has(kw));

    // Fetch missing data: Google Ads API first, DataForSEO as fallback for
    // anything Google Ads can't cover (unconfigured, errored, or no data for
    // a given keyword). Both return Keyword Planner data, so they share the
    // same cache.
    const freshData = new Map();
    if (missingKeywords.length > 0) {
      if (isGoogleAdsConfigured()) {
        try {
          const adsData = await batchGetSearchVolume(missingKeywords, geo, langId);
          for (const [kw, data] of adsData || new Map()) {
            freshData.set(kw, data);
          }
        } catch (err) {
          console.error('[Search Volume] Google Ads fetch failed, falling back to DataForSEO:', err.message);
        }
      }

      const stillMissing = missingKeywords.filter(kw => !freshData.has(kw));
      if (stillMissing.length > 0 && isDataForSEOConfigured()) {
        try {
          const dfsData = await fetchSearchVolumeDFS(
            stillMissing,
            getLocationCode(geo),
            getLanguageCode(site.contentLanguage, geo)
          );
          for (const [kw, data] of dfsData) {
            freshData.set(kw, data);
          }
        } catch (err) {
          console.error('[Search Volume] DataForSEO fetch failed:', err.message);
        }
      }
    }

    if (freshData.size > 0) {
      // Upsert into cache
      const upsertOps = [];
      for (const [kw, data] of freshData) {
        upsertOps.push(
          prisma.keywordVolumeCache.upsert({
            where: {
              keyword_geo_language: { keyword: kw, geo, language: langId },
            },
            create: {
              keyword: kw,
              geo,
              language: langId,
              avgMonthlySearches: data.avgMonthlySearches,
              competition: data.competition,
              competitionIndex: data.competitionIndex,
              lowTopOfPageBidMicros: data.lowTopOfPageBidMicros,
              highTopOfPageBidMicros: data.highTopOfPageBidMicros,
              fetchedAt: new Date(),
            },
            update: {
              avgMonthlySearches: data.avgMonthlySearches,
              competition: data.competition,
              competitionIndex: data.competitionIndex,
              lowTopOfPageBidMicros: data.lowTopOfPageBidMicros,
              highTopOfPageBidMicros: data.highTopOfPageBidMicros,
              fetchedAt: new Date(),
            },
          })
        );
        cachedMap.set(kw, {
          keyword: kw,
          avgMonthlySearches: data.avgMonthlySearches,
          competition: data.competition,
          competitionIndex: data.competitionIndex,
        });
      }

      // Run upserts in parallel (MongoDB supports this)
      await Promise.all(upsertOps);

      // Also update the Keyword records with real search volume (and CPC
      // when the source provides it - DataForSEO does, Google Ads doesn't)
      for (const [kw, data] of freshData) {
        await prisma.keyword.updateMany({
          where: { siteId, keyword: { equals: kw, mode: 'insensitive' } },
          data: {
            searchVolume: data.avgMonthlySearches,
            ...(typeof data.cpc === 'number' ? { cpc: data.cpc } : {}),
          },
        });
      }
      invalidateKeywords(siteId);
    }

    // Build response
    const results = {};
    for (const kw of uniqueKeywords) {
      const entry = cachedMap.get(kw);
      results[kw] = entry
        ? {
            avgMonthlySearches: entry.avgMonthlySearches,
            competition: entry.competition,
            competitionIndex: entry.competitionIndex,
          }
        : null;
    }

    return NextResponse.json({
      results,
      fromCache: cached.length,
      fetched: missingKeywords.length,
      googleAdsConfigured: isGoogleAdsConfigured(),
      volumeFallbackAvailable: isDataForSEOConfigured(),
    });
  } catch (error) {
    console.error('Search volume API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch search volume' },
      { status: 500 }
    );
  }
}
