/**
 * Cached reader for keywords list per site.
 *
 * Invalidated by `invalidateKeywords(siteId)` — called from every keyword
 * CRUD mutation (POST, PATCH, DELETE in /api/keywords and /api/keywords/[id]).
 */

import { unstable_cache } from 'next/cache';
import prisma from '@/lib/prisma.js';
import { tagsFor } from './tags.js';

const TTL = 300; // 5 min fallback; tag-based invalidation is the primary mechanism.

/**
 * Fetch keywords for a site. Cached by siteId.
 *
 * Enrichment (related posts) is NOT cached here — it depends on SiteEntity
 * data which has its own churn. Callers do enrichment in-process after this
 * returns.
 *
 * @param {string} siteId
 * @param {string} accountId  needed for ancestor tag (account-level cascade)
 */
export async function getCachedKeywords(siteId, accountId) {
  const cached = unstable_cache(
    async () => {
      return prisma.keyword.findMany({
        where: { siteId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          keyword: true,
          searchVolume: true,
          difficulty: true,
          cpc: true,
          intents: true,
          position: true,
          url: true,
          status: true,
          tags: true,
          createdAt: true,
        },
      });
    },
    ['keywords', siteId],
    {
      tags: tagsFor('siteKeywords', { siteId, accountId }),
      revalidate: TTL,
    }
  );

  return cached();
}
