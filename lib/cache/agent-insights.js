/**
 * Cached reader for agent insights list per site, with filter support.
 *
 * The GET /api/agent/insights endpoint supports pagination, category filter,
 * status filter, and type filter. Each distinct filter combination becomes
 * its own cache entry (keyed by siteId + filters). Any mutation to insights
 * for the site invalidates the `site:${siteId}:agent-insights` tag, which
 * drops ALL filter combinations at once.
 *
 * Invalidated by `invalidateAgentInsights(siteId)` — called after:
 *   - agent run completes (lib/agent-analysis.js)
 *   - insight fix applied (/api/agent/insights/[id]/fix)
 *   - insight dismissed/updated/deleted (/api/agent/insights/[id])
 *   - agent/execute creates new insights
 */

import { unstable_cache } from 'next/cache';
import prisma from '@/lib/prisma.js';
import { tagsFor } from './tags.js';

const TTL = 180; // 3 min — insights change often when agent is running; tag invalidation is primary.

/**
 * @param {object} params
 * @param {string} params.siteId
 * @param {string} params.accountId
 * @param {number} params.limit
 * @param {string|null} params.category
 * @param {string|null} params.status        - explicit status filter
 * @param {string|null} params.type
 * @param {boolean} params.includeResolved   - when true, RESOLVED rows are included
 * @param {string|null} params.cursor        - pagination cursor (insight id)
 */
export async function getCachedAgentInsights({
  siteId,
  accountId,
  limit,
  category,
  status,
  type,
  includeResolved,
  cursor,
}) {
  // Build cache key parts from every discriminator. Must be strings.
  const keyParts = [
    'agent-insights',
    siteId,
    String(limit),
    category ?? '',
    status ?? '',
    type ?? '',
    includeResolved ? '1' : '0',
    cursor ?? '',
  ];

  const cached = unstable_cache(
    async () => {
      const where = {
        siteId,
        dismissedAt: { isSet: false },
      };
      if (category) where.category = category;
      if (status) {
        where.status = status;
      } else if (!includeResolved) {
        where.status = { not: 'RESOLVED' };
      }
      if (type) where.type = type;

      const findArgs = {
        where,
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
        take: limit + 1,
      };
      if (cursor) {
        findArgs.skip = 1;
        findArgs.cursor = { id: cursor };
      }

      const [results, totalCount, pendingCount, resolvedCount] = await Promise.all([
        prisma.agentInsight.findMany(findArgs),
        prisma.agentInsight.count({ where }),
        prisma.agentInsight.count({
          where: { siteId, status: 'PENDING', dismissedAt: { isSet: false } },
        }),
        prisma.agentInsight.count({ where: { siteId, status: 'RESOLVED' } }),
      ]);

      const hasMore = results.length > limit;
      const items = hasMore ? results.slice(0, -1) : results;

      return {
        items,
        hasMore,
        totalCount,
        pendingCount,
        resolvedCount,
        nextCursor: hasMore ? items[items.length - 1]?.id : null,
      };
    },
    keyParts,
    {
      tags: tagsFor('siteAgentInsights', { siteId, accountId }),
      revalidate: TTL,
    }
  );

  return cached();
}
