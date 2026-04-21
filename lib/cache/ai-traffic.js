/**
 * Cached reader for AI-referred traffic stats from Google Analytics / GSC.
 *
 * This endpoint hits external Google APIs which are slow and rate-limited.
 * Caching gives the biggest UX win per byte cached.
 *
 * Cache key includes the date range - each range is a separate cache entry.
 * Invalidated rarely: only when the Google integration is disconnected or
 * reconnected (`invalidateAiTraffic(siteId)`). TTL of 1 hour keeps data
 * reasonably fresh for a dashboard that's usually viewed live.
 */

import { unstable_cache } from 'next/cache';
import { tagsFor } from './tags.js';

const TTL = 3600; // 1 hour - GA data is daily-granular anyway.

/**
 * Caches the expensive Google API fetch.
 *
 * @param {object} params
 * @param {string} params.siteId
 * @param {string} params.accountId
 * @param {string} params.rangeKey         - canonicalized date-range string, used in cache key
 * @param {() => Promise<any>} loader      - closure that does the actual Google API calls
 */
export async function getCachedAiTraffic({ siteId, accountId, rangeKey }, loader) {
  const cached = unstable_cache(
    loader,
    ['ai-traffic', siteId, rangeKey],
    {
      tags: tagsFor('siteAiTraffic', { siteId, accountId }),
      revalidate: TTL,
    }
  );

  return cached();
}
