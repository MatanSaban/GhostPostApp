import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import {
  checkKeywordRank,
  isDataForSEOConfigured,
  resolveGeo,
} from '@/lib/dataforseo/serp';
import { invalidateKeywords } from '@/lib/cache/invalidate.js';

const SESSION_COOKIE = 'user_session';

const CACHE_TTL_HOURS = 24;
// Every stale keyword is one paid live SERP request — keep batches bounded.
const MAX_CHECKS_PER_REQUEST = 100;
const CONCURRENCY = 5;

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
 * POST /api/keywords/serp-position
 *
 * Body: { siteId: string, keywords?: string[], forceRefresh?: boolean }
 *
 * Checks where the site's domain ranks in Google organic results for each
 * tracked keyword via the DataForSEO SERP API. Results are persisted on the
 * Keyword rows (serpPosition / serpUrl / serpCheckedAt) and reused for
 * CACHE_TTL_HOURS unless forceRefresh is set.
 */
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    // `forceRefresh` is intentionally not honored: the 24h floor below is the
    // rate limit, so a button press can't trigger repeat paid lookups within
    // the window. Kept out of the destructure to make that explicit.
    const { siteId, keywords } = body;

    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
    }

    // Verify user has access to this site
    const site = await prisma.site.findFirst({
      where: user.isSuperAdmin
        ? { id: siteId }
        : { id: siteId, account: { members: { some: { userId: user.id } } } },
      select: { id: true, url: true, contentLanguage: true, targetLocations: true },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found or no access' }, { status: 404 });
    }

    const rows = await prisma.keyword.findMany({
      where: {
        siteId,
        ...(Array.isArray(keywords) && keywords.length > 0
          ? { keyword: { in: keywords } }
          : {}),
      },
      select: {
        id: true,
        keyword: true,
        serpPosition: true,
        serpUrl: true,
        serpCheckedAt: true,
      },
    });

    // Which Google market to check: site-profile target location → domain
    // ccTLD → content language. See resolveGeo for the full priority order.
    const geo = resolveGeo({
      targetLocations: site.targetLocations,
      contentLanguage: site.contentLanguage,
      siteUrl: site.url,
    });

    // 24h floor is absolute: a keyword is only re-checked once its last check
    // is older than CACHE_TTL_HOURS. This is the cache AND the rate limit -
    // `forceRefresh` cannot bypass it, so the buttons can't trigger repeat
    // paid lookups within the window.
    const staleDate = new Date(Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000);
    const isFresh = (row) => row.serpCheckedAt && new Date(row.serpCheckedAt) >= staleDate;
    const staleRows = rows
      .filter((row) => !isFresh(row))
      .slice(0, MAX_CHECKS_PER_REQUEST);

    let checked = 0;
    let failed = 0;
    let billingError = false;

    if (staleRows.length > 0 && isDataForSEOConfigured()) {
      const checkedAt = new Date();
      const queue = [...staleRows];

      const worker = async () => {
        let row;
        while ((row = queue.shift())) {
          // Once the account is out of balance every further call fails the
          // same way — stop draining the queue instead of logging 100 errors.
          if (billingError) return;
          try {
            const rank = await checkKeywordRank({
              keyword: row.keyword,
              siteUrl: site.url,
              locationCode: geo.locationCode,
              languageCode: geo.languageCode,
            });
            await prisma.keyword.update({
              where: { id: row.id },
              data: {
                serpPosition: rank.position,
                serpUrl: rank.url,
                serpCheckedAt: checkedAt,
              },
            });
            // Append a history point so we can show period-over-period change.
            // DataForSEO has no past data, so this only accrues going forward.
            await prisma.keywordSerpSnapshot.create({
              data: {
                keywordId: row.id,
                siteId,
                position: rank.position,
                url: rank.url,
                locationCode: geo.locationCode,
                languageCode: geo.languageCode,
                checkedAt,
              },
            }).catch((e) => console.error('[SERP Position] snapshot write failed:', e.message));
            row.serpPosition = rank.position;
            row.serpUrl = rank.url;
            row.serpCheckedAt = checkedAt;
            checked++;
          } catch (err) {
            if (err?.isBilling) {
              billingError = true;
              console.error('[SERP Position] DataForSEO account out of balance — aborting batch.');
              return;
            }
            // One bad keyword (or a transient API error) shouldn't sink the
            // whole batch — keep the previous cached value for this row.
            console.error(`[SERP Position] check failed for "${row.keyword}":`, err.message);
            failed++;
          }
        }
      };

      await Promise.all(Array.from({ length: CONCURRENCY }, worker));

      if (checked > 0) invalidateKeywords(siteId);
    }

    const results = {};
    for (const row of rows) {
      results[row.keyword.toLowerCase().trim()] = row.serpCheckedAt
        ? {
            position: row.serpPosition,
            url: row.serpUrl,
            checkedAt: row.serpCheckedAt,
            // When this row becomes eligible for another check.
            nextRefreshAt: new Date(new Date(row.serpCheckedAt).getTime() + CACHE_TTL_HOURS * 60 * 60 * 1000),
          }
        : null;
    }

    return NextResponse.json({
      results,
      // What market the check ran against, so the UI can show it and the user
      // can confirm it matches where they actually compete.
      geo: {
        countryCode: geo.countryCode,
        label: geo.label,
        languageCode: geo.languageCode,
        source: geo.source,
      },
      checked,
      failed,
      billingError,
      cooldownHours: CACHE_TTL_HOURS,
      // How many requested keywords were on cooldown (skipped, served cached).
      onCooldown: rows.length - staleRows.length,
      fromCache: rows.length - staleRows.length,
      rankCheckAvailable: isDataForSEOConfigured(),
    });
  } catch (error) {
    console.error('SERP position API error:', error);
    return NextResponse.json(
      { error: 'Failed to check keyword rankings' },
      { status: 500 }
    );
  }
}
