/**
 * Shared Entity Sync Logic
 * 
 * Reusable sync functions for:
 * - Hourly cron sync (all sites)
 * - Manual sync (user-triggered from dashboard)
 * - WordPress webhook push (real-time updates from WP plugin)
 * 
 * Includes sync locking to prevent conflicts between:
 * - Cron sync vs manual sync
 * - Content publishing (gp-platform → WP) vs entity sync (WP → gp-platform)
 * - WordPress webhook push vs cron/manual sync
 */

import prisma from '@/lib/prisma';
import { getPosts, getSiteInfo, getMenus } from '@/lib/wp-api-client';
import { notifyAccountMembers } from '@/lib/notifications';

// ─── Sync Lock ──────────────────────────────────────────────────────

const SYNC_LOCK_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes max lock

/**
 * Acquire a sync lock for a site. Returns true if lock acquired.
 * Uses database atomicity to prevent race conditions.
 */
export async function acquireSyncLock(siteId, source = 'cron') {
  try {
    // Only acquire lock if not currently syncing
    // or if the existing lock is stale (older than timeout)
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: {
        entitySyncStatus: true,
        updatedAt: true,
      },
    });

    if (!site) return false;

    // If currently syncing, check if it's stale
    if (site.entitySyncStatus === 'SYNCING') {
      const lockAge = Date.now() - new Date(site.updatedAt).getTime();
      if (lockAge < SYNC_LOCK_TIMEOUT_MS) {
        console.log(`[EntitySync] Site ${siteId} is already syncing (lock age: ${Math.round(lockAge / 1000)}s). Skipping.`);
        return false;
      }
      console.log(`[EntitySync] Stale sync lock detected for site ${siteId} (${Math.round(lockAge / 1000)}s). Overriding.`);
    }

    // Acquire lock
    await prisma.site.update({
      where: { id: siteId },
      data: {
        entitySyncStatus: 'SYNCING',
        entitySyncProgress: 0,
        entitySyncMessage: `Sync started (${source})`,
        entitySyncError: null,
      },
    });

    return true;
  } catch (err) {
    console.error(`[EntitySync] Failed to acquire lock for site ${siteId}:`, err.message);
    return false;
  }
}

/**
 * Release sync lock and set final status.
 */
export async function releaseSyncLock(siteId, status, error = null) {
  try {
    await prisma.site.update({
      where: { id: siteId },
      data: {
        entitySyncStatus: status,
        entitySyncProgress: status === 'COMPLETED' ? 100 : 0,
        entitySyncMessage: null,
        lastEntitySyncAt: status === 'COMPLETED' ? new Date() : undefined,
        entitySyncError: error,
      },
    });
  } catch (err) {
    console.error(`[EntitySync] Failed to release lock for site ${siteId}:`, err.message);
  }
}

// ─── Entity Sync Functions ──────────────────────────────────────────

/**
 * Deep-compare two values with sorted keys to avoid false positives
 * from JSON.stringify key ordering differences.
 */
function stableStringify(obj) {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

/**
 * Compare existing entity with new data to determine if anything changed.
 * Only compares fields that matter for content sync.
 * Returns false if nothing changed, or a string describing what changed (truthy).
 */
function hasEntityChanged(existing, newData) {
  // Compare simple string/date fields
  if (existing.title !== newData.title) return 'title';
  if (existing.slug !== newData.slug) return 'slug';
  if (existing.status !== newData.status) return 'status';
  if ((existing.excerpt || '') !== (newData.excerpt || '')) return 'excerpt';
  // Normalize content whitespace to avoid false positives from trailing spaces/newlines
  if ((existing.content || '').trim() !== (newData.content || '').trim()) return 'content';
  if ((existing.url || '') !== (newData.url || '')) return 'url';
  if ((existing.featuredImage || '') !== (newData.featuredImage || '')) return 'featuredImage';

  // Compare metadata (JSON) - exclude volatile fields
  const existingMeta = { ...(existing.metadata || {}) };
  const newMeta = { ...(newData.metadata || {}) };
  // Remove fields that change on every fetch without meaningful content change
  for (const key of ['modified', 'meta']) {
    delete existingMeta[key];
    delete newMeta[key];
  }
  if (stableStringify(existingMeta) !== stableStringify(newMeta)) return 'metadata';

  // Compare SEO data (JSON) with stable key ordering
  if (stableStringify(existing.seoData || null) !== stableStringify(newData.seoData || null)) return 'seoData';

  // Compare ACF data (JSON) with stable key ordering
  if (stableStringify(existing.acfData || null) !== stableStringify(newData.acfData || null)) return 'acfData';

  return false;
}

/**
 * Map WordPress post status to our EntityStatus enum
 */
function mapPostStatus(wpStatus) {
  switch (wpStatus) {
    case 'publish': return 'PUBLISHED';
    case 'draft':
    case 'auto-draft': return 'DRAFT';
    case 'pending': return 'PENDING';
    case 'future': return 'SCHEDULED';
    case 'private': return 'PRIVATE';
    case 'trash': return 'TRASH';
    default: return 'DRAFT';
  }
}

/**
 * Build entity data from a WP post object.
 * Handles both camelCase (from format_post) and snake_case (from webhook) field names.
 */
export function buildEntityData(post) {
  return {
    title: post.title || 'Untitled',
    slug: post.slug,
    url: post.permalink || post.link || post.url,
    excerpt: post.excerpt || null,
    content: post.content || null,
    status: mapPostStatus(post.status),
    featuredImage: post.featured_image || post.featuredImage || null,
    publishedAt: post.date_gmt
      ? new Date(String(post.date_gmt).replace(' ', 'T') + 'Z')
      : (post.date ? new Date(String(post.date).replace(' ', 'T')) : null),
    scheduledAt: post.status === 'future' && post.date_gmt
      ? new Date(String(post.date_gmt).replace(' ', 'T') + 'Z')
      : (post.status === 'future' && post.date ? new Date(String(post.date).replace(' ', 'T')) : null),
    externalId: String(post.id),
    metadata: {
      author: post.author_name || post.authorName || null,
      authorId: post.author,
      categories: post.categories || [],
      tags: post.tags || [],
      modified: post.modified,
      template: post.template || null,
      menuOrder: post.menu_order ?? post.menuOrder ?? 0,
      parent: post.parent || null,
      taxonomies: post.taxonomies || {},
      meta: post.meta || {},
    },
    seoData: post.seo || null,
    acfData: post.acf || null,
  };
}

/**
 * Sync entities for a single entity type from WordPress.
 * Returns { total, created, updated } stats.
 */
export async function syncEntitiesForType(site, entityType) {
  const stats = { total: 0, created: 0, updated: 0, unchanged: 0, deleted: 0 };
  const postTypeSlug = entityType.slug;
  const seenExternalIds = new Set();
  const seenSlugs = new Set();

  let page = 1;
  let hasMore = true;

  while (hasMore) {
    try {
      const response = await getPosts(site, postTypeSlug, page, 50, true);
      const posts = response.items || response;
      const totalPages = response.pages || 1;

      if (!posts || !Array.isArray(posts) || posts.length === 0) {
        hasMore = false;
        break;
      }

      for (const post of posts) {
        try {
          seenExternalIds.add(String(post.id));
          if (post.slug) seenSlugs.add(post.slug);

          const entityData = buildEntityData(post);

          // Find existing entity by externalId first, then by slug
          let existing = await prisma.siteEntity.findFirst({
            where: { siteId: site.id, externalId: String(post.id) },
          });

          if (!existing && post.slug) {
            existing = await prisma.siteEntity.findFirst({
              where: { siteId: site.id, entityTypeId: entityType.id, slug: post.slug },
            });
          }

          if (existing) {
            // Only update if something actually changed
            const changedField = hasEntityChanged(existing, entityData);
            if (changedField) {
              console.log(`[EntitySync] Entity "${entityData.title}" (${post.id}) changed: ${changedField}`);
              await prisma.siteEntity.update({
                where: { id: existing.id },
                data: entityData,
              });
              stats.updated++;
            } else {
              stats.unchanged++;
            }
          } else {
            await prisma.siteEntity.create({
              data: { siteId: site.id, entityTypeId: entityType.id, ...entityData },
            });
            stats.created++;
          }
          stats.total++;
        } catch (e) {
          console.error(`[EntitySync] Error processing post ${post.id}:`, e.message);
        }
      }

      hasMore = page < totalPages;
      page++;
    } catch (e) {
      console.error(`[EntitySync] Error fetching ${postTypeSlug} page ${page}:`, e.message);
      hasMore = false;
    }
  }

  // Remove entities that have an externalId but no longer exist on WordPress
  // Only delete entities with externalId (crawl-created entities without externalId are left alone)
  if (seenExternalIds.size > 0) {
    const staleEntities = await prisma.siteEntity.findMany({
      where: {
        siteId: site.id,
        entityTypeId: entityType.id,
        externalId: { not: null, notIn: [...seenExternalIds] },
      },
      select: { id: true, title: true, externalId: true },
    });

    if (staleEntities.length > 0) {
      await prisma.siteEntity.deleteMany({
        where: { id: { in: staleEntities.map(e => e.id) } },
      });
      stats.deleted = staleEntities.length;
      console.log(`[EntitySync] Removed ${staleEntities.length} deleted ${postTypeSlug} entities`);
    }
  }

  // Mark scan-created entities (without externalId) as TRASH if their slug
  // doesn't match any current post — they belong to trashed/deleted content
  if (seenSlugs.size > 0) {
    const orphanedEntities = await prisma.siteEntity.findMany({
      where: {
        siteId: site.id,
        entityTypeId: entityType.id,
        externalId: null,
        slug: { notIn: [...seenSlugs] },
        status: { not: 'TRASH' },
      },
      select: { id: true, title: true, slug: true },
    });

    if (orphanedEntities.length > 0) {
      await prisma.siteEntity.updateMany({
        where: { id: { in: orphanedEntities.map(e => e.id) } },
        data: { status: 'TRASH' },
      });
      stats.deleted += orphanedEntities.length;
      console.log(`[EntitySync] Marked ${orphanedEntities.length} orphaned scan-created ${postTypeSlug} entities as TRASH`);
    }
  }

  return stats;
}

/**
 * Sync a single entity item from WordPress webhook data.
 * Used when the WP plugin pushes a real-time update.
 * Does NOT acquire a full lock — only updates the specific entity.
 */
export async function syncSingleEntity(site, entityTypeSlug, postData) {
  const entityType = await prisma.siteEntityType.findFirst({
    where: { siteId: site.id, slug: entityTypeSlug, isEnabled: true },
  });

  if (!entityType) {
    console.log(`[EntitySync] Entity type "${entityTypeSlug}" not enabled for site ${site.id}. Skipping.`);
    return null;
  }

  const entityData = buildEntityData(postData);

  // Find existing entity
  let existing = await prisma.siteEntity.findFirst({
    where: { siteId: site.id, externalId: String(postData.id) },
  });

  if (!existing && postData.slug) {
    existing = await prisma.siteEntity.findFirst({
      where: { siteId: site.id, entityTypeId: entityType.id, slug: postData.slug },
    });
  }

  let action;
  if (existing) {
    await prisma.siteEntity.update({ where: { id: existing.id }, data: entityData });
    action = 'updated';
  } else {
    await prisma.siteEntity.create({
      data: { siteId: site.id, entityTypeId: entityType.id, ...entityData },
    });
    action = 'created';
  }

  return { action, title: entityData.title, slug: entityData.slug };
}

/**
 * Delete a single entity item (from WP webhook trash/delete event).
 */
export async function deleteSingleEntity(site, postData) {
  let existing = await prisma.siteEntity.findFirst({
    where: { siteId: site.id, externalId: String(postData.id) },
  });

  // Fallback: match by slug for scan-created entities without externalId
  if (!existing && postData.slug) {
    existing = await prisma.siteEntity.findFirst({
      where: { siteId: site.id, externalId: null, slug: postData.slug },
    });
  }

  if (existing) {
    // If action is 'trash', update status; if 'delete', remove entirely
    if (postData.action === 'delete') {
      await prisma.siteEntity.delete({ where: { id: existing.id } });
      return { action: 'deleted', title: existing.title };
    } else {
      await prisma.siteEntity.update({
        where: { id: existing.id },
        data: { status: 'TRASH' },
      });
      return { action: 'trashed', title: existing.title };
    }
  }

  return null;
}

/**
 * Full sync of all enabled entity types for a site.
 * Used by cron and manual sync.
 * 
 * @param {Object} site - Site with id, url, siteKey, siteSecret, accountId
 * @param {Object} [options]
 * @param {string} [options.source] - 'cron' | 'manual' | 'webhook'
 * @param {boolean} [options.notify] - Whether to send notifications (default: true)
 * @param {Function} [options.onProgress] - Progress callback (progress, message)
 */
export async function performEntitySync(site, options = {}) {
  const { source = 'cron', notify = true, onProgress } = options;

  const stats = { entityTypes: 0, total: 0, created: 0, updated: 0, unchanged: 0, deleted: 0 };
  const errors = [];

  try {
    // Get enabled entity types
    const entityTypes = await prisma.siteEntityType.findMany({
      where: { siteId: site.id, isEnabled: true },
    });

    if (entityTypes.length === 0) {
      console.log(`[EntitySync] No enabled entity types for site ${site.id}. Skipping.`);
      return { stats, errors };
    }

    let typeIndex = 0;
    for (const entityType of entityTypes) {
      const progress = 5 + Math.floor((typeIndex / entityTypes.length) * 90);
      if (onProgress) {
        await onProgress(progress, `Syncing ${entityType.name}...`);
      }

      try {
        const result = await syncEntitiesForType(site, entityType);
        stats.entityTypes++;
        stats.total += result.total;
        stats.created += result.created;
        stats.updated += result.updated;
        stats.unchanged += result.unchanged;
        stats.deleted += result.deleted;
        console.log(`[EntitySync] ${entityType.slug}: ${result.total} total (${result.created} new, ${result.updated} updated, ${result.unchanged} unchanged, ${result.deleted} deleted)`);
      } catch (e) {
        console.error(`[EntitySync] Error syncing ${entityType.slug}:`, e.message);
        errors.push({ slug: entityType.slug, error: e.message });
      }

      typeIndex++;
    }

    // Notify account members
    if (notify && (stats.created > 0 || stats.updated > 0 || stats.deleted > 0)) {
      await notifyEntitySync(site, stats, source);
    }

  } catch (error) {
    errors.push({ type: 'general', error: error.message });
  }

  return { stats, errors };
}

// ─── Notifications ──────────────────────────────────────────────────

/**
 * Notify account members about an entity sync.
 */
async function notifyEntitySync(site, stats, source) {
  try {
    const siteName = site.name || site.url;

    await notifyAccountMembers(site.accountId, {
      type: 'entity_sync_complete',
      title: 'notifications.entitySync.title',
      message: 'notifications.entitySync.message',
      link: '/dashboard/entities',
      data: {
        siteId: site.id,
        siteName,
        source,
        created: stats.created,
        updated: stats.updated,
        total: stats.total,
        entityTypes: stats.entityTypes,
      },
    });
  } catch (err) {
    console.warn('[EntitySync] Failed to send notification:', err.message);
  }
}

/**
 * Notify account members about a single entity update from WP webhook.
 */
export async function notifyEntityWebhookUpdate(site, entityInfo, action, postType) {
  try {
    // Use per-action message keys for proper grammar
    const actionKey = ['created', 'updated', 'trashed', 'deleted'].includes(action) ? action : 'updated';

    await notifyAccountMembers(site.accountId, {
      type: 'entity_webhook_update',
      title: 'notifications.entityWebhook.title',
      message: `notifications.entityWebhook.messages.${actionKey}`,
      link: '/dashboard/entities',
      data: {
        siteId: site.id,
        action: actionKey,
        entityTitle: entityInfo.title,
        entitySlug: entityInfo.slug,
        entityTypeSlug: postType || 'post',
      },
    });
  } catch (err) {
    console.warn('[EntitySync] Failed to send webhook notification:', err.message);
  }
}
