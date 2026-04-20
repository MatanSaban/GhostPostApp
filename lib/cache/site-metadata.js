/**
 * Cached reader for site metadata (url, name, accountId, connection status, etc.).
 *
 * Hit on most requests that operate on a site — good target for caching.
 *
 * IMPORTANT: This does NOT bypass authorization. Callers must still verify
 * the user has access to the returned site (typically by checking `accountId`
 * against the user's account memberships).
 *
 * Tagged with site-scope only (no account ancestor). Account-wide invalidation
 * is rare; site tag is sufficient and keeps this cache self-contained (callers
 * don't need to know accountId ahead of time).
 */

import { unstable_cache } from 'next/cache';
import prisma from '@/lib/prisma.js';
import { tagFor } from './tags.js';

const TTL = 600; // 10 min — metadata changes rarely; tag invalidation handles edits.

/**
 * Fetch a site by id. Cached by site id.
 * Returns null if the site doesn't exist.
 */
export async function getCachedSite(siteId) {
  if (!siteId) return null;

  const cached = unstable_cache(
    async () => {
      return prisma.site.findUnique({
        where: { id: siteId },
        select: {
          id: true,
          accountId: true,
          name: true,
          url: true,
          platform: true,
          isActive: true,
          contentLanguage: true,
          wpTimezone: true,
          wpLocale: true,
          pluginLanguage: true,
          pluginVersion: true,
          connectionStatus: true,
          createdAt: true,
        },
      });
    },
    ['site-metadata', siteId],
    {
      tags: [tagFor.siteMetadata(siteId), tagFor.site(siteId)],
      revalidate: TTL,
    }
  );

  return cached();
}
