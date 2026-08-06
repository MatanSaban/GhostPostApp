import prisma from '@/lib/prisma';
import { crawlSitemapsForEntities, discoverEntityTypesAndEntities } from '@/lib/entity-discovery';
import { notifyAccountMembers } from '@/lib/notifications';

/**
 * Populate SiteEntity rows for a site's enabled entity types using sitemap
 * data only - no plugin connection, no AI, no credit charge.
 *
 * Sitemap source (in order of preference):
 *   1. The most recently scanned SiteSitemap row with stored XML content
 *      (persisted by the interview's entity scan) → crawlSitemapsForEntities.
 *   2. Fresh discovery via discoverEntityTypesAndEntities (useAI: false).
 *
 * Idempotent: per-row creates with the [siteId, entityTypeId, slug] unique
 * constraint; collisions are silently skipped, so re-running never duplicates.
 *
 * Returns { entitiesCreated, typesMatched, skippedReason }.
 */
export async function populateEntitiesFromSitemaps({ siteId, accountId, selectedSlugs = null, source = 'interview', notify = true }) {
  const result = { entitiesCreated: 0, typesMatched: 0, skippedReason: null };

  try {
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, url: true, name: true, accountId: true },
    });

    if (!site?.url) {
      result.skippedReason = 'site-not-found';
      return result;
    }

    // Resolve the enabled types we should populate
    let types = await prisma.siteEntityType.findMany({
      where: { siteId, isEnabled: true },
    });

    if (Array.isArray(selectedSlugs) && selectedSlugs.length > 0) {
      const selectedSet = new Set(selectedSlugs);
      types = types.filter(t => selectedSet.has(t.slug));
    }

    if (types.length === 0) {
      result.skippedReason = 'no-enabled-types';
      return result;
    }

    // Obtain sitemap entities: prefer the sitemap XML already persisted by
    // the interview's scan, fall back to a fresh no-AI discovery crawl.
    let sitemapEntities = {};

    const sitemapRow = await prisma.siteSitemap.findFirst({
      where: { siteId, parentId: null, content: { not: null } },
      orderBy: { lastScannedAt: 'desc' },
    });

    if (sitemapRow?.content) {
      try {
        sitemapEntities = await crawlSitemapsForEntities(site.url, sitemapRow.content);
      } catch (e) {
        console.error('[entity-populate] Stored sitemap crawl failed:', e.message);
      }
    }

    if (!sitemapEntities || Object.keys(sitemapEntities).length === 0) {
      try {
        const discovery = await discoverEntityTypesAndEntities(site.url, { accountId, siteId, useAI: false });
        sitemapEntities = discovery?.sitemapEntities || {};
      } catch (e) {
        console.error('[entity-populate] Discovery fallback failed:', e.message);
      }
    }

    if (!sitemapEntities || Object.keys(sitemapEntities).length === 0) {
      result.skippedReason = 'no-sitemap-entities';
      return result;
    }

    // Create entities per type - dedupe on slug (unique key is
    // [siteId, entityTypeId, slug]), collisions silently skipped.
    for (const type of types) {
      const variantSlug = type.slug.endsWith('s') ? type.slug.slice(0, -1) : `${type.slug}s`;
      const items = sitemapEntities[type.slug] || sitemapEntities[variantSlug];
      if (!Array.isArray(items) || items.length === 0) continue;

      result.typesMatched++;

      const seen = new Set();
      for (const item of items) {
        if (!item?.slug || seen.has(item.slug)) continue;
        seen.add(item.slug);

        try {
          await prisma.siteEntity.create({
            data: {
              siteId,
              entityTypeId: type.id,
              slug: item.slug,
              title: item.title || item.slug,
              url: item.url || null,
              featuredImage: item.featuredImage || null,
              publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
              status: 'PUBLISHED',
            },
          });
          result.entitiesCreated++;
        } catch (e) {
          // Likely a unique-constraint collision - safe to ignore.
        }
      }
    }

    if (result.entitiesCreated > 0) {
      try {
        await prisma.site.update({
          where: { id: siteId },
          data: {
            lastEntitySyncAt: new Date(),
            entitySyncStatus: 'COMPLETED',
          },
        });
      } catch (e) {
        console.warn('[entity-populate] Site sync-status update failed:', e.message);
      }

      if (notify) {
        try {
          await notifyAccountMembers(accountId || site.accountId, {
            type: 'entities_imported',
            title: 'notifications.entitiesImported.title',
            message: 'notifications.entitiesImported.message',
            link: '/dashboard/entities',
            data: {
              siteId: site.id,
              siteName: site.name,
              typesCreated: 0,
              entitiesCreated: result.entitiesCreated,
            },
          });
        } catch (e) {
          console.warn('[entity-populate] Notification failed:', e.message);
        }
      }
    }

    console.log(`[entity-populate] source=${source} site=${siteId} typesMatched=${result.typesMatched} entitiesCreated=${result.entitiesCreated}`);
    return result;
  } catch (error) {
    console.error('[entity-populate] Failed:', error);
    result.skippedReason = result.skippedReason || 'error';
    return result;
  }
}
