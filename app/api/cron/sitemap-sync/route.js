import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  fetchAndParseSitemap,
  diffSitemapAgainstDb,
  enqueueForScraping,
} from '@/lib/sitemap-delta-sync';

// ─── Security ────────────────────────────────────────────────────────
function verifyAuth(request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // dev mode
  return authHeader === `Bearer ${cronSecret}`;
}

/**
 * GET /api/cron/sitemap-sync
 * 
 * Daily cron job that performs sitemap delta sync for non-plugin sites.
 * 
 * For each active site WITHOUT a WordPress plugin connection:
 * 1. Fetches & parses all sitemaps recursively
 * 2. Diffs sitemap URLs/lastmod against existing DB entities
 * 3. Enqueues new/updated URLs into ScrapeQueue (no synchronous crawling)
 */
export async function GET(request) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[CronSitemapSync] Starting daily sitemap delta sync...');

  try {
    // Find active sites that do NOT have a working plugin connection.
    // Plugin-connected sites use real-time webhook push via sync-entities cron.
    const sites = await prisma.site.findMany({
      where: {
        isActive: true,
        entityTypes: { some: { isEnabled: true } },
        OR: [
          { connectionStatus: { not: 'CONNECTED' } },
          { siteKey: null },
        ],
      },
      select: {
        id: true,
        url: true,
        name: true,
        entityTypes: {
          where: { isEnabled: true },
          select: { id: true, slug: true, sitemaps: true },
        },
      },
    });

    console.log(`[CronSitemapSync] Found ${sites.length} non-plugin site(s) to sync.`);

    const results = [];

    for (const site of sites) {
      try {
        console.log(`[CronSitemapSync] Processing ${site.url}...`);

        // 1. Fetch & parse all sitemaps
        const sitemapEntries = await fetchAndParseSitemap(site.url);
        if (sitemapEntries.length === 0) {
          results.push({ siteId: site.id, url: site.url, status: 'no_sitemap', queued: 0 });
          continue;
        }

        // 2. Diff against existing entities
        const { newUrls, updatedUrls } = await diffSitemapAgainstDb(site.id, sitemapEntries);

        if (newUrls.length === 0 && updatedUrls.length === 0) {
          results.push({ siteId: site.id, url: site.url, status: 'up_to_date', queued: 0 });
          console.log(`[CronSitemapSync] ${site.url}: up to date (${sitemapEntries.length} URLs checked)`);
          continue;
        }

        // 3. Determine entity type for new URLs (use first enabled type as default)
        const defaultEntityTypeId = site.entityTypes[0]?.id || null;

        // 4. Enqueue for async scraping
        const { queued, skipped } = await enqueueForScraping(
          site.id,
          newUrls,
          updatedUrls,
          defaultEntityTypeId,
        );

        results.push({
          siteId: site.id,
          url: site.url,
          status: 'queued',
          sitemapUrls: sitemapEntries.length,
          new: newUrls.length,
          updated: updatedUrls.length,
          queued,
          skipped,
        });

        console.log(
          `[CronSitemapSync] ${site.url}: ${newUrls.length} new, ${updatedUrls.length} updated, ${queued} queued`,
        );
      } catch (err) {
        console.error(`[CronSitemapSync] Error processing ${site.url}:`, err.message);
        results.push({ siteId: site.id, url: site.url, status: 'error', error: err.message });
      }
    }

    console.log(`[CronSitemapSync] Completed. ${results.length} site(s) processed.`);

    return NextResponse.json({
      success: true,
      sitesProcessed: results.length,
      results,
    });
  } catch (error) {
    console.error('[CronSitemapSync] Fatal error:', error);
    return NextResponse.json(
      { error: 'Failed to run sitemap sync cron' },
      { status: 500 },
    );
  }
}
