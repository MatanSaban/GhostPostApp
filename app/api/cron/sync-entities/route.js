import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  acquireSyncLock,
  releaseSyncLock,
  performEntitySync,
} from '@/lib/entity-sync';

// ─── Security ────────────────────────────────────────────────────────
function verifyAuth(request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // dev mode
  return authHeader === `Bearer ${cronSecret}`;
}

/**
 * GET /api/cron/sync-entities
 * 
 * Hourly cron job that syncs entity items for all connected websites
 * with at least one enabled entity type.
 * 
 * - Skips sites that are already syncing (lock mechanism)
 * - Skips WordPress sites with plugin connected (they use real-time webhook push)
 * - Notifies account members after sync
 */
export async function GET(request) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[CronSyncEntities] Starting hourly entity sync...');

  try {
    // Find all connected sites with at least one enabled entity type
    const sites = await prisma.site.findMany({
      where: {
        isActive: true,
        connectionStatus: 'CONNECTED',
        siteKey: { not: null },
        siteSecret: { not: null },
        entityTypes: {
          some: { isEnabled: true },
        },
      },
      select: {
        id: true,
        url: true,
        name: true,
        siteKey: true,
        siteSecret: true,
        accountId: true,
        platform: true,
        entitySyncStatus: true,
        lastEntitySyncAt: true,
      },
    });

    console.log(`[CronSyncEntities] Found ${sites.length} site(s) to sync.`);

    const results = [];

    for (const site of sites) {
      try {
        // Acquire sync lock — skip if already syncing
        const lockAcquired = await acquireSyncLock(site.id, 'cron');
        if (!lockAcquired) {
          results.push({ siteId: site.id, url: site.url, status: 'skipped', reason: 'already_syncing' });
          continue;
        }

        // Perform sync
        const { stats, errors } = await performEntitySync(site, {
          source: 'cron',
          notify: true,
          onProgress: async (progress, message) => {
            await prisma.site.update({
              where: { id: site.id },
              data: { entitySyncProgress: progress, entitySyncMessage: message },
            });
          },
        });

        // Release lock
        const hasErrors = errors.length > 0;
        await releaseSyncLock(
          site.id,
          hasErrors ? 'ERROR' : 'COMPLETED',
          hasErrors ? `${errors.length} error(s) during sync` : null,
        );

        results.push({
          siteId: site.id,
          url: site.url,
          status: 'completed',
          stats,
          errors: errors.length,
        });

        console.log(
          `[CronSyncEntities] ${site.url}: ${stats.total} checked (${stats.created} new, ${stats.updated} updated, ${stats.unchanged} unchanged)`,
        );
      } catch (err) {
        console.error(`[CronSyncEntities] Error syncing site ${site.url}:`, err.message);
        await releaseSyncLock(site.id, 'ERROR', err.message);
        results.push({ siteId: site.id, url: site.url, status: 'error', error: err.message });
      }
    }

    console.log(`[CronSyncEntities] Completed. ${results.length} site(s) processed.`);

    return NextResponse.json({
      success: true,
      sitesProcessed: results.length,
      results,
    });
  } catch (error) {
    console.error('[CronSyncEntities] Fatal error:', error);
    return NextResponse.json(
      { error: 'Failed to run entity sync cron' },
      { status: 500 },
    );
  }
}
