/**
 * Cached reader for active competitors per site.
 *
 * Invalidated by `invalidateCompetitors(siteId)` — called from competitor
 * POST, DELETE, compare, scan, and chat-tool-driven additions.
 */

import { unstable_cache } from 'next/cache';
import prisma from '@/lib/prisma.js';
import { tagsFor } from './tags.js';

const TTL = 300;

/**
 * Fetch active competitors for a site. Cached by siteId.
 *
 * @param {string} siteId
 * @param {string} accountId  needed for ancestor tag
 */
export async function getCachedCompetitors(siteId, accountId) {
  const cached = unstable_cache(
    async () => {
      return prisma.competitor.findMany({
        where: { siteId, isActive: true },
        orderBy: { createdAt: 'desc' },
      });
    },
    ['competitors', siteId],
    {
      tags: tagsFor('siteCompetitors', { siteId, accountId }),
      revalidate: TTL,
    }
  );

  return cached();
}
