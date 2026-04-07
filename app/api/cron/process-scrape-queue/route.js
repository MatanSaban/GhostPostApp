import { NextResponse } from 'next/server';
import { processScrapeQueue } from '@/lib/sitemap-delta-sync';

// ─── Security ────────────────────────────────────────────────────────
function verifyAuth(request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // dev mode
  return authHeader === `Bearer ${cronSecret}`;
}

/**
 * GET /api/cron/process-scrape-queue
 * 
 * Runs every 5 minutes to process PENDING items from the ScrapeQueue.
 * Picks up a small batch, fetches each page, and creates/updates entities.
 * Failed items retry up to 3 times before being marked FAILED.
 */
export async function GET(request) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[CronScrapeQueue] Processing scrape queue...');

  try {
    const { processed, failed } = await processScrapeQueue(20);

    console.log(`[CronScrapeQueue] Done. ${processed} processed, ${failed} failed.`);

    return NextResponse.json({
      success: true,
      processed,
      failed,
    });
  } catch (error) {
    console.error('[CronScrapeQueue] Fatal error:', error);
    return NextResponse.json(
      { error: 'Failed to process scrape queue' },
      { status: 500 },
    );
  }
}
