import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { syncAllEntities, getSiteInfo, getMenus, getPosts } from '@/lib/wp-api-client';

const SESSION_COOKIE = 'user_session';

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
        entitySyncMessage: 'Starting sync...',
        entitySyncError: null,
      },
    });

    try {
      // Perform the sync
      const result = await performFullSync(site);

      // Update status to completed
      await prisma.site.update({
        where: { id: siteId },
        data: {
          entitySyncStatus: 'COMPLETED',
          entitySyncProgress: 100,
          entitySyncMessage: null,
          lastEntitySyncAt: new Date(),
          entitySyncError: result.errors.length > 0 
            ? `Completed with ${result.errors.length} error(s)` 
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
 */
async function performFullSync(site) {
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
    await updateProgress(5, 'Fetching site information...');
    
    let siteInfo;
    try {
      siteInfo = await getSiteInfo(site);
    } catch (e) {
      errors.push({ type: 'site_info', error: e.message });
      // Continue with fallback
    }

    // Step 2: Create/update entity types from post types
    await updateProgress(10, 'Processing post types...');
    
    // Post types to exclude from syncing (internal/private types)
    const excludedPostTypes = [
      'elementor_library',     // Elementor templates
      'elementor_font',        // Elementor fonts
      'elementor_icons',       // Elementor icons
      'elementor_snippet',     // Elementor snippets
      'e-landing-page',        // Elementor landing pages
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
    
    const postTypes = (siteInfo?.postTypes || []).filter(
      pt => !excludedPostTypes.includes(pt.slug)
    );
    
    for (const pt of postTypes) {
      try {
        await prisma.siteEntityType.upsert({
          where: {
            siteId_slug: {
              siteId: site.id,
              slug: pt.slug,
            },
          },
          create: {
            siteId: site.id,
            slug: pt.slug,
            name: pt.name,
            apiEndpoint: pt.restBase,
            isEnabled: true,
            sortOrder: pt.isBuiltin ? 0 : 10,
          },
          update: {
            name: pt.name,
            apiEndpoint: pt.restBase,
          },
        });
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

    // Step 3: Fetch entities for each post type
    const entityTypes = await prisma.siteEntityType.findMany({
      where: { siteId: site.id, isEnabled: true },
    });

    console.log('Entity types to sync:', entityTypes.map(et => ({ slug: et.slug, name: et.name, isEnabled: et.isEnabled })));

    let typeIndex = 0;
    for (const entityType of entityTypes) {
      const progressBase = 15 + Math.floor((typeIndex / entityTypes.length) * 55);
      await updateProgress(progressBase, `Syncing ${entityType.name}...`);

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
    await updateProgress(75, 'Syncing menus...');
    
    try {
      const menuResult = await syncMenus(site);
      stats.menus = menuResult.count;
    } catch (e) {
      errors.push({ type: 'menus', error: e.message });
    }

    // Step 5: Done
    await updateProgress(100, 'Sync complete!');

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
      // Use the authenticated plugin API
      const response = await getPosts(site, postTypeSlug, page, 50);
      
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
            seoData: post.seo_data || null,
            acfData: post.acf || null,
          };

          // Check if entity exists
          const existing = await prisma.siteEntity.findFirst({
            where: {
              siteId: site.id,
              externalId: String(post.id),
            },
          });

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
    case 'pending':
    case 'auto-draft':
      return 'DRAFT';
    case 'trash':
    case 'private':
      return 'ARCHIVED';
    default:
      return 'DRAFT';
  }
}
