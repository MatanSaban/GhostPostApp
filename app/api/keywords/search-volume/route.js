import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { batchGetSearchVolume, isGoogleAdsConfigured, getLanguageId } from '@/lib/google-ads';

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
      select: { id: true, defaultLanguage: true },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found or no access' }, { status: 404 });
    }

    const langId = language || getLanguageId(site.defaultLanguage?.toLowerCase()) || '1000';
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

    // Fetch missing from Google Ads API
    if (missingKeywords.length > 0 && isGoogleAdsConfigured()) {
      const freshData = await batchGetSearchVolume(missingKeywords, geo, langId);

      if (freshData && freshData.size > 0) {
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

        // Also update the Keyword records with real search volume
        for (const [kw, data] of freshData) {
          await prisma.keyword.updateMany({
            where: { siteId, keyword: { equals: kw, mode: 'insensitive' } },
            data: { searchVolume: data.avgMonthlySearches },
          });
        }
      }
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
    });
  } catch (error) {
    console.error('Search volume API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch search volume' },
      { status: 500 }
    );
  }
}
