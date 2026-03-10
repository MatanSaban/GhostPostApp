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
 * Sync entities for a single entity type from WordPress.
 * Returns { total, created, updated } stats.
 */
export async function syncEntitiesForType(site, entityType) {
  const stats = { total: 0, created: 0, updated: 0 };
  const postTypeSlug = entityType.slug;

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
          const entityData = {
            title: post.title || 'Untitled',
            slug: post.slug,
            url: post.permalink || post.link,
            excerpt: post.excerpt || null,
            content: post.content || null,
            status: mapPostStatus(post.status),
            featuredImage: post.featured_image || null,
            publishedAt: post.date_gmt
              ? new Date(String(post.date_gmt).replace(' ', 'T') + 'Z')
              : (post.date ? new Date(String(post.date).replace(' ', 'T')) : null),
            scheduledAt: post.status === 'future' && post.date_gmt
              ? new Date(String(post.date_gmt).replace(' ', 'T') + 'Z')
              : (post.status === 'future' && post.date ? new Date(String(post.date).replace(' ', 'T')) : null),
            externalId: String(post.id),
            metadata: {
              author: post.author_name || null,
              authorId: post.author,
              categories: post.categories || [],
              tags: post.tags || [],
              modified: post.modified,
              template: post.template || null,
              menuOrder: post.menu_order || 0,
              parent: post.parent || null,
              taxonomies: post.taxonomies || {},
              meta: post.meta || {},
            },
            seoData: post.seo || null,
            acfData: post.acf || null,
          };

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
            await prisma.siteEntity.update({
              where: { id: existing.id },
              data: entityData,
            });
            stats.updated++;
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

  const entityData = {
    title: postData.title || 'Untitled',
    slug: postData.slug,
    url: postData.permalink || postData.link || postData.url,
    excerpt: postData.excerpt || null,
    content: postData.content || null,
    status: mapPostStatus(postData.status),
    featuredImage: postData.featured_image || null,
    publishedAt: postData.date_gmt
      ? new Date(String(postData.date_gmt).replace(' ', 'T') + 'Z')
      : (postData.date ? new Date(String(postData.date).replace(' ', 'T')) : null),
    scheduledAt: postData.status === 'future' && postData.date_gmt
      ? new Date(String(postData.date_gmt).replace(' ', 'T') + 'Z')
      : null,
    externalId: String(postData.id),
    metadata: {
      author: postData.author_name || null,
      authorId: postData.author,
      categories: postData.categories || [],
      tags: postData.tags || [],
      modified: postData.modified,
      template: postData.template || null,
      menuOrder: postData.menu_order || 0,
      parent: postData.parent || null,
      taxonomies: postData.taxonomies || {},
      meta: postData.meta || {},
    },
    seoData: postData.seo || null,
    acfData: postData.acf || null,
  };

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
  const existing = await prisma.siteEntity.findFirst({
    where: { siteId: site.id, externalId: String(postData.id) },
  });

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

  const stats = { entityTypes: 0, total: 0, created: 0, updated: 0 };
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
        console.log(`[EntitySync] ${entityType.slug}: ${result.total} total (${result.created} new, ${result.updated} updated)`);
      } catch (e) {
        console.error(`[EntitySync] Error syncing ${entityType.slug}:`, e.message);
        errors.push({ slug: entityType.slug, error: e.message });
      }

      typeIndex++;
    }

    // Notify account members
    if (notify && (stats.created > 0 || stats.updated > 0)) {
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
export async function notifyEntityWebhookUpdate(site, entityInfo, action) {
  try {
    const siteName = site.name || site.url;

    await notifyAccountMembers(site.accountId, {
      type: 'entity_webhook_update',
      title: 'notifications.entityWebhook.title',
      message: 'notifications.entityWebhook.message',
      link: '/dashboard/entities',
      data: {
        siteId: site.id,
        siteName,
        action,
        entityTitle: entityInfo.title,
        entitySlug: entityInfo.slug,
      },
    });
  } catch (err) {
    console.warn('[EntitySync] Failed to send webhook notification:', err.message);
  }
}
