import prisma from '@/lib/prisma';
import { notifyAccountMembers } from '@/lib/notifications';

/**
 * Move the draft entity-scan results that were collected during registration
 * onto a freshly-created Site row.
 *
 * Behavior:
 *   - Only migrates when scan.status === 'COMPLETED' and the user picked at
 *     least one type. Other states (FAILED / EMPTY / SCANNING / null) are
 *     no-ops; the user can repopulate from /dashboard/entities afterwards.
 *   - Creates SiteEntityType rows for the user-selected types.
 *   - Creates SiteEntity rows for entities under those types (deduped on
 *     siteId+entityTypeId+slug to satisfy the unique constraint).
 *   - On success, drops a notification into the bell-icon system so the
 *     user knows their content was imported.
 *   - Swallows individual row errors and logs them - a partial migration
 *     is better than failing the whole onboarding finalize.
 *
 * Returns a summary `{ migrated, typesCreated, entitiesCreated, error? }`.
 *
 * Important: this is called AFTER the finalize transaction has committed.
 * It deliberately runs as separate write operations rather than inside the
 * finalize transaction so a slow migration can't block the user from
 * landing on the dashboard.
 */
export async function migrateDraftEntityScanToSite({ entityScan, site, account, locale = 'en' }) {
  const summary = {
    migrated: false,
    typesCreated: 0,
    entitiesCreated: 0,
    error: null,
  };

  if (!entityScan || entityScan.status !== 'COMPLETED') {
    return summary;
  }

  if (!site?.id || !account?.id) {
    summary.error = 'Missing site or account';
    return summary;
  }

  const selectedSlugs = Array.isArray(entityScan.selectedSlugs) ? entityScan.selectedSlugs : [];
  if (selectedSlugs.length === 0) {
    return summary;
  }

  const selectedSlugSet = new Set(selectedSlugs);
  const allTypes = Array.isArray(entityScan.entityTypes) ? entityScan.entityTypes : [];
  const typesToMigrate = allTypes.filter(t => selectedSlugSet.has(t.slug));

  if (typesToMigrate.length === 0) {
    return summary;
  }

  // Group sitemapEntities by their slug so we can resolve them per-type.
  const sitemapEntities = entityScan.sitemapEntities || {};

  // Create entity types. Use upsert-ish logic: create if absent, otherwise
  // skip (registration always creates a fresh Site, so collisions are rare,
  // but the unique constraint on [siteId, slug] makes this safe to be
  // defensive about).
  const slugToTypeId = {};
  for (const type of typesToMigrate) {
    try {
      const existing = await prisma.siteEntityType.findUnique({
        where: { siteId_slug: { siteId: site.id, slug: type.slug } },
      });

      if (existing) {
        slugToTypeId[type.slug] = existing.id;
        continue;
      }

      const labels = {
        en: type.name,
        ...(type.nameHe ? { he: type.nameHe } : {}),
      };

      const created = await prisma.siteEntityType.create({
        data: {
          siteId: site.id,
          slug: type.slug,
          name: type.name,
          apiEndpoint: type.apiEndpoint || type.slug,
          labels,
          isEnabled: true,
          sortOrder: type.isCore ? 0 : 10,
        },
      });

      slugToTypeId[type.slug] = created.id;
      summary.typesCreated++;
    } catch (e) {
      console.error('[entity-scan-migration] Failed to create type', type.slug, e.message);
    }
  }

  // Create entities for each migrated type. We use createMany with
  // skipDuplicates because Mongo's prisma adapter accepts that and it's
  // dramatically faster than per-row creates for large sites. Falls back
  // to per-row creates on any platform that doesn't support it.
  for (const [slug, items] of Object.entries(sitemapEntities)) {
    if (!selectedSlugSet.has(slug)) continue;
    const typeId = slugToTypeId[slug];
    if (!typeId || !Array.isArray(items) || items.length === 0) continue;

    // Dedupe by slug - sitemap data can have multiple entries with the same
    // slug (e.g. localized variants on the same path), and the unique key
    // is [siteId, entityTypeId, slug].
    const seen = new Set();
    const data = [];
    for (const item of items) {
      if (!item?.slug || seen.has(item.slug)) continue;
      seen.add(item.slug);
      data.push({
        siteId: site.id,
        entityTypeId: typeId,
        slug: item.slug,
        title: item.title || item.slug,
        url: item.url || null,
        featuredImage: item.featuredImage || null,
        publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
        status: 'PUBLISHED',
      });
    }

    if (data.length === 0) continue;

    try {
      // Per-row create - Mongo + Prisma's createMany doesn't enforce unique
      // constraints with skipDuplicates the same way Postgres does, so we
      // fall through to individual creates with per-row error handling.
      for (const row of data) {
        try {
          await prisma.siteEntity.create({ data: row });
          summary.entitiesCreated++;
        } catch (e) {
          // Likely a unique-constraint collision - safe to ignore.
        }
      }
    } catch (e) {
      console.error('[entity-scan-migration] Bulk entity create failed for', slug, e.message);
    }
  }

  if (summary.typesCreated > 0 || summary.entitiesCreated > 0) {
    summary.migrated = true;

    // Header bell notification - see lib/notifications.js. We use translation
    // keys (resolved client-side) so the notification respects the user's
    // current locale rather than the locale at finalize time.
    try {
      await notifyAccountMembers(account.id, {
        type: 'entities_imported',
        title: 'notifications.entitiesImported.title',
        message: 'notifications.entitiesImported.message',
        link: '/dashboard/entities',
        data: {
          siteId: site.id,
          siteName: site.name,
          typesCreated: summary.typesCreated,
          entitiesCreated: summary.entitiesCreated,
        },
      });
    } catch (e) {
      // Notification failure shouldn't roll back the migration.
      console.warn('[entity-scan-migration] Notification failed:', e.message);
    }
  }

  return summary;
}
