import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { syncAllEntities, getSiteInfo, getMenus, getPosts } from '@/lib/wp-api-client';

const SESSION_COOKIE = 'user_session';
const LOCALE_COOKIE = 'ghost-post-locale';

// Sync progress message translations
const SYNC_MESSAGES = {
  en: {
    starting: 'Starting sync...',
    fetchingSiteInfo: 'Fetching site information...',
    processingPostTypes: 'Processing content types...',
    syncingType: (name) => `Syncing ${name}...`,
    syncingMenus: 'Syncing menus...',
    syncComplete: 'Sync complete!',
    completedWithErrors: (count) => `Completed with ${count} error(s)`,
  },
  he: {
    starting: 'מתחיל סנכרון...',
    fetchingSiteInfo: 'מושך מידע על האתר...',
    processingPostTypes: 'מעבד סוגי תוכן...',
    syncingType: (name) => `מסנכרן ${name}...`,
    syncingMenus: 'מסנכרן תפריטים...',
    syncComplete: 'הסנכרון הושלם!',
    completedWithErrors: (count) => `הושלם עם ${count} שגיאות`,
  },
};

/**
 * POST /api/entities/populate
 * Populate entities from connected WordPress site
 * This is the main sync endpoint that fetches all content
 */
export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get locale for translated messages
    const locale = cookieStore.get(LOCALE_COOKIE)?.value || 'en';
    const messages = SYNC_MESSAGES[locale] || SYNC_MESSAGES.en;

    const body = await request.json();
    const { siteId } = body;

    if (!siteId) {
      return NextResponse.json({ error: 'Site ID is required' }, { status: 400 });
    }

    // Get user's account IDs
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        accountMemberships: {
          select: { accountId: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const accountIds = user.accountMemberships.map(m => m.accountId);

    // Get site with connection details
    const site = await prisma.site.findFirst({
      where: {
        id: siteId,
        accountId: { in: accountIds },
      },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    if (site.connectionStatus !== 'CONNECTED') {
      return NextResponse.json({ 
        error: 'Site is not connected. Please install and activate the WordPress plugin first.',
        errorCode: 'NOT_CONNECTED',
      }, { status: 400 });
    }

    if (!site.siteKey || !site.siteSecret) {
      return NextResponse.json({ 
        error: 'Site connection keys missing. Please reinstall the WordPress plugin.',
        errorCode: 'MISSING_KEYS',
      }, { status: 400 });
    }

    // Start sync - update status
    await prisma.site.update({
      where: { id: siteId },
      data: {
        entitySyncStatus: 'SYNCING',
        entitySyncProgress: 0,
        entitySyncMessage: messages.starting,
        entitySyncError: null,
      },
    });

    try {
      // Perform the sync
      const result = await performFullSync(site, messages);

      // Update status to completed
      await prisma.site.update({
        where: { id: siteId },
        data: {
          entitySyncStatus: 'COMPLETED',
          entitySyncProgress: 100,
          entitySyncMessage: null,
          lastEntitySyncAt: new Date(),
          entitySyncError: result.errors.length > 0 
            ? messages.completedWithErrors(result.errors.length) 
            : null,
        },
      });

      return NextResponse.json({
        success: true,
        stats: result.stats,
        errors: result.errors,
      });

    } catch (syncError) {
      // Update status to error
      await prisma.site.update({
        where: { id: siteId },
        data: {
          entitySyncStatus: 'ERROR',
          entitySyncProgress: 0,
          entitySyncMessage: null,
          entitySyncError: syncError.message,
        },
      });

      throw syncError;
    }

  } catch (error) {
    console.error('Populate entities error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to populate entities' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/entities/populate?siteId=xxx
 * Get sync status for a site
 */
export async function GET(request) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');

    if (!siteId) {
      return NextResponse.json({ error: 'Site ID is required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        accountMemberships: {
          select: { accountId: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const accountIds = user.accountMemberships.map(m => m.accountId);

    const site = await prisma.site.findFirst({
      where: {
        id: siteId,
        accountId: { in: accountIds },
      },
      select: {
        entitySyncStatus: true,
        entitySyncProgress: true,
        entitySyncMessage: true,
        lastEntitySyncAt: true,
        entitySyncError: true,
        _count: {
          select: {
            entities: true,
            entityTypes: true,
            menus: true,
          },
        },
      },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    return NextResponse.json({
      status: site.entitySyncStatus,
      progress: site.entitySyncProgress,
      message: site.entitySyncMessage,
      lastSyncAt: site.lastEntitySyncAt,
      error: site.entitySyncError,
      counts: site._count,
    });

  } catch (error) {
    console.error('Get sync status error:', error);
    return NextResponse.json(
      { error: 'Failed to get sync status' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/entities/populate?siteId=xxx
 * Cancel/stop an ongoing sync
 */
export async function DELETE(request) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');

    if (!siteId) {
      return NextResponse.json({ error: 'Site ID is required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        accountMemberships: {
          select: { accountId: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const accountIds = user.accountMemberships.map(m => m.accountId);

    // Update the site to cancel the sync
    const site = await prisma.site.updateMany({
      where: {
        id: siteId,
        accountId: { in: accountIds },
        entitySyncStatus: 'SYNCING',
      },
      data: {
        entitySyncStatus: 'CANCELLED',
        entitySyncProgress: 0,
        entitySyncMessage: 'Sync cancelled by user',
      },
    });

    if (site.count === 0) {
      return NextResponse.json({ error: 'No active sync to cancel' }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'Sync cancelled' });

  } catch (error) {
    console.error('Cancel sync error:', error);
    return NextResponse.json(
      { error: 'Failed to cancel sync' },
      { status: 500 }
    );
  }
}

/**
 * Perform full sync of all entities from WordPress
 * @param {Object} site - Site object from database
 * @param {Object} messages - Translated messages for progress updates
 */
async function performFullSync(site, messages) {
  const stats = {
    postTypes: 0,
    entities: 0,
    menus: 0,
    updated: 0,
    created: 0,
  };
  const errors = [];

  // Update progress helper
  const updateProgress = async (progress, message) => {
    await prisma.site.update({
      where: { id: site.id },
      data: {
        entitySyncProgress: progress,
        entitySyncMessage: message,
      },
    });
  };

  try {
    // Step 1: Get site info with post types
    await updateProgress(5, messages.fetchingSiteInfo);
    
    let siteInfo;
    try {
      siteInfo = await getSiteInfo(site);
    } catch (e) {
      errors.push({ type: 'site_info', error: e.message });
      // Continue with fallback
    }

    // Step 2: Create/update entity types from post types
    await updateProgress(10, messages.processingPostTypes);
    
    // Post types to exclude from syncing (internal/private types)
    const excludedPostTypes = [
      'elementor_library',     // Elementor templates
      'elementor_font',        // Elementor fonts
      'elementor_icons',       // Elementor icons
      'elementor_snippet',     // Elementor snippets
      'e-landing-page',        // Elementor landing pages
      'e-floating-buttons',    // Elementor floating buttons
      'oembed_cache',          // oEmbed cache
      'wp_global_styles',      // Global styles
      'custom_css',            // Custom CSS
      'customize_changeset',   // Customizer changesets
      'user_request',          // GDPR user requests
      'acf-field-group',       // ACF field groups
      'acf-field',             // ACF fields
      'acf-post-type',         // ACF post types
      'acf-taxonomy',          // ACF taxonomies
      'acf-ui-options-page',   // ACF options pages
    ];
    
    // WordPress REST API uses plural slugs (posts, pages) but post_type names are singular (post, page)
    // We should use the REST API endpoint (plural) as the canonical slug to avoid duplicates
    const seenSlugs = new Set();
    const postTypes = (siteInfo?.postTypes || []).filter(pt => {
      // Exclude internal types
      if (excludedPostTypes.includes(pt.slug)) return false;
      
      // Deduplicate singular/plural versions - prefer the one with restBase
      // WordPress returns both 'post' and 'posts', 'page' and 'pages'
      const singularSlug = pt.slug.replace(/s$/, ''); // Remove trailing 's'
      const pluralSlug = pt.slug.endsWith('s') ? pt.slug : pt.slug + 's';
      
      // If we've already seen the singular or plural version, skip this one
      if (seenSlugs.has(singularSlug) || seenSlugs.has(pluralSlug)) {
        console.log(`Skipping duplicate post type: ${pt.slug} (already have ${singularSlug} or ${pluralSlug})`);
        return false;
      }
      
      // Use the restBase as the canonical slug if available, otherwise use the original slug
      const canonicalSlug = pt.restBase || pt.slug;
      seenSlugs.add(canonicalSlug);
      seenSlugs.add(singularSlug);
      seenSlugs.add(pluralSlug);
      
      return true;
    });
    
    // Get currently enabled entity types BEFORE updating from WordPress
    // This preserves the user's selection
    const existingEnabledTypes = await prisma.siteEntityType.findMany({
      where: { siteId: site.id, isEnabled: true },
      select: { slug: true },
    });
    const enabledSlugs = new Set(existingEnabledTypes.map(t => t.slug));
    
    for (const pt of postTypes) {
      try {
        // Check if this type already exists
        const existing = await prisma.siteEntityType.findUnique({
          where: {
            siteId_slug: {
              siteId: site.id,
              slug: pt.slug,
            },
          },
        });
        
        if (existing) {
          // Update existing type - keep isEnabled as-is
          await prisma.siteEntityType.update({
            where: { id: existing.id },
            data: {
              name: pt.name,
              apiEndpoint: pt.restBase,
            },
          });
        } else {
          // Create new type - disabled by default
          // User must explicitly enable it in the UI
          await prisma.siteEntityType.create({
            data: {
              siteId: site.id,
              slug: pt.slug,
              name: pt.name,
              apiEndpoint: pt.restBase,
              isEnabled: false, // Disabled by default - user must enable
              sortOrder: pt.isBuiltin ? 0 : 10,
            },
          });
        }
        stats.postTypes++;
      } catch (e) {
        errors.push({ type: 'post_type', slug: pt.slug, error: e.message });
      }
    }
    
    // Disable any excluded post types that might already exist
    await prisma.siteEntityType.updateMany({
      where: { 
        siteId: site.id, 
        slug: { in: excludedPostTypes } 
      },
      data: { isEnabled: false },
    });
    
    // Also disable duplicate singular/plural types
    // If both 'post' and 'posts' exist, disable 'post' (keep plural)
    // If both 'page' and 'pages' exist, disable 'page' (keep plural)
    const duplicateSingulars = ['post', 'page'];
    for (const singular of duplicateSingulars) {
      const pluralExists = await prisma.siteEntityType.findFirst({
        where: { siteId: site.id, slug: singular + 's', isEnabled: true },
      });
      if (pluralExists) {
        await prisma.siteEntityType.updateMany({
          where: { siteId: site.id, slug: singular },
          data: { isEnabled: false },
        });
        console.log(`Disabled duplicate singular type: ${singular} (keeping ${singular}s)`);
      }
    }

    // Step 3: Fetch entities for each post type
    const entityTypes = await prisma.siteEntityType.findMany({
      where: { siteId: site.id, isEnabled: true },
    });

    console.log('Entity types to sync:', entityTypes.map(et => ({ slug: et.slug, name: et.name, isEnabled: et.isEnabled })));

    let typeIndex = 0;
    for (const entityType of entityTypes) {
      const progressBase = 15 + Math.floor((typeIndex / entityTypes.length) * 55);
      await updateProgress(progressBase, messages.syncingType(entityType.name));

      try {
        console.log(`Syncing entity type: ${entityType.slug} (${entityType.name})`);
        const entitiesCount = await syncEntitiesForType(site, entityType);
        console.log(`Synced ${entityType.slug}: ${entitiesCount.total} total, ${entitiesCount.created} created, ${entitiesCount.updated} updated`);
        stats.entities += entitiesCount.total;
        stats.created += entitiesCount.created;
        stats.updated += entitiesCount.updated;
      } catch (e) {
        console.error(`Error syncing ${entityType.slug}:`, e.message);
        errors.push({ type: 'entities', slug: entityType.slug, error: e.message });
      }

      typeIndex++;
    }

    // Step 4: Sync menus
    await updateProgress(75, messages.syncingMenus);
    
    try {
      const menuResult = await syncMenus(site);
      stats.menus = menuResult.count;
    } catch (e) {
      errors.push({ type: 'menus', error: e.message });
    }

    // Step 5: Done
    await updateProgress(100, messages.syncComplete);

  } catch (error) {
    errors.push({ type: 'general', error: error.message });
  }

  return { stats, errors };
}

/**
 * Sync entities for a specific entity type using the authenticated plugin API
 */
async function syncEntitiesForType(site, entityType) {
  const stats = { total: 0, created: 0, updated: 0 };
  
  // Determine the post type slug to use with the plugin API
  const postTypeSlug = entityType.slug;
  
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    try {
      // Use the authenticated plugin API with full=true to get all data
      const response = await getPosts(site, postTypeSlug, page, 50, true);
      
      // The plugin returns { items: [...], total, pages, page }
      const posts = response.items || response;
      const totalPages = response.pages || 1;
      
      if (!posts || !Array.isArray(posts) || posts.length === 0) {
        hasMore = false;
        break;
      }

      // Process each post
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
            publishedAt: post.date ? new Date(post.date) : null,
            scheduledAt: post.status === 'future' && post.date ? new Date(post.date) : null,
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
            // SEO data - plugin returns 'seo' not 'seo_data'
            seoData: post.seo || null,
            // ACF data - plugin returns 'acf'
            acfData: post.acf || null,
          };

          // Check if entity exists - first by externalId, then by slug
          let existing = await prisma.siteEntity.findFirst({
            where: {
              siteId: site.id,
              externalId: String(post.id),
            },
          });

          // If not found by externalId, try to find by slug within the same entity type
          // This allows us to update entities that were created via crawl (without externalId)
          if (!existing && post.slug) {
            existing = await prisma.siteEntity.findFirst({
              where: {
                siteId: site.id,
                entityTypeId: entityType.id,
                slug: post.slug,
              },
            });
            
            if (existing) {
              console.log(`[Populate] Found existing entity by slug "${post.slug}" - updating with WordPress data`);
            }
          }

          if (existing) {
            await prisma.siteEntity.update({
              where: { id: existing.id },
              data: entityData,
            });
            stats.updated++;
          } else {
            await prisma.siteEntity.create({
              data: {
                siteId: site.id,
                entityTypeId: entityType.id,
                ...entityData,
              },
            });
            stats.created++;
          }

          stats.total++;
        } catch (e) {
          console.error(`Error processing post ${post.id}:`, e);
        }
      }

      // Check for more pages using the pagination info from response
      hasMore = page < totalPages;
      page++;

    } catch (e) {
      console.error(`Error fetching ${postTypeSlug} page ${page}:`, e);
      hasMore = false;
    }
  }

  return stats;
}

/**
 * Fetch SEO data for a post (Yoast/RankMath)
 */
async function fetchSeoData(baseUrl, postId) {
  try {
    // Try Yoast SEO REST API
    const yoastResponse = await fetch(
      `${baseUrl}/wp-json/yoast/v1/get_head?url=${encodeURIComponent(`${baseUrl}/?p=${postId}`)}`,
      { signal: AbortSignal.timeout(5000) }
    );
    
    if (yoastResponse.ok) {
      const yoastData = await yoastResponse.json();
      return {
        source: 'yoast',
        ...yoastData,
      };
    }
  } catch (e) {
    // Yoast not available
  }

  try {
    // Try RankMath
    const rankMathResponse = await fetch(
      `${baseUrl}/wp-json/rankmath/v1/getHead?url=${encodeURIComponent(`${baseUrl}/?p=${postId}`)}`,
      { signal: AbortSignal.timeout(5000) }
    );
    
    if (rankMathResponse.ok) {
      const rankMathData = await rankMathResponse.json();
      return {
        source: 'rankmath',
        ...rankMathData,
      };
    }
  } catch (e) {
    // RankMath not available
  }

  return null;
}

/**
 * Sync menus from WordPress
 */
async function syncMenus(site) {
  let count = 0;

  try {
    const menusData = await getMenus(site);
    const menus = menusData?.menus || menusData || [];

    for (const menu of menus) {
      try {
        await prisma.siteMenu.upsert({
          where: {
            siteId_slug: {
              siteId: site.id,
              slug: menu.slug || `menu-${menu.id}`,
            },
          },
          create: {
            siteId: site.id,
            name: menu.name,
            slug: menu.slug || `menu-${menu.id}`,
            externalId: String(menu.id),
            location: menu.locations?.[0]?.slug || null,
            items: menu.items || [],
          },
          update: {
            name: menu.name,
            location: menu.locations?.[0]?.slug || null,
            items: menu.items || [],
          },
        });
        count++;
      } catch (e) {
        console.error(`Error syncing menu ${menu.name}:`, e);
      }
    }
  } catch (e) {
    console.error('Error fetching menus:', e);
  }

  return { count };
}

/**
 * Clean HTML entities and tags
 */
function cleanHtml(html) {
  if (!html) return null;
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .trim() || null;
}

/**
 * Map WordPress post status to our status
 */
function mapPostStatus(wpStatus) {
  switch (wpStatus) {
    case 'publish':
      return 'PUBLISHED';
    case 'draft':
    case 'auto-draft':
      return 'DRAFT';
    case 'pending':
      return 'PENDING';
    case 'future':
      return 'SCHEDULED';
    case 'private':
      return 'PRIVATE';
    case 'trash':
      return 'TRASH';
    default:
      return 'DRAFT';
  }
}
