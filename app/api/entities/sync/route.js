import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { getPosts } from '@/lib/wp-api-client';

const SESSION_COOKIE = 'user_session';

// Get authenticated user with their account memberships
async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { 
        id: true, 
        email: true, 
        accountMemberships: {
          select: {
            accountId: true,
          },
        },
      },
    });

    return user;
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

// Fetch entities from WordPress using authenticated plugin API
async function fetchWordPressEntities(site, postTypeSlug) {
  const entities = [];

  if (!postTypeSlug) return entities;

  try {
    let page = 1;
    let hasMore = true;
    const perPage = 100;
    
    while (hasMore) {
      // Use authenticated plugin API with full=true (default)
      const response = await getPosts(site, postTypeSlug, page, perPage, true);
      
      // The plugin returns { items: [...], total, pages, page }
      const items = response.items || response;
      const totalPages = response.pages || 1;
      
      if (!Array.isArray(items) || items.length === 0) {
        hasMore = false;
        break;
      }

      for (const item of items) {
        // Map WordPress status to our EntityStatus
        const statusMap = {
          'publish': 'PUBLISHED',
          'draft': 'DRAFT',
          'pending': 'PENDING',
          'future': 'SCHEDULED',
          'private': 'PRIVATE',
          'trash': 'TRASH',
        };
        const mappedStatus = statusMap[item.status] || 'DRAFT';
        
        entities.push({
          externalId: String(item.id),
          title: item.title || 'Untitled',
          slug: item.slug,
          url: item.permalink || item.link,
          excerpt: item.excerpt || null,
          content: item.content || null,
          status: mappedStatus,
          featuredImage: item.featured_image || null,
          publishedAt: item.date ? new Date(item.date) : null,
          scheduledAt: item.status === 'future' && item.date ? new Date(item.date) : null,
          // Additional data - store as objects (Prisma JSON fields)
          metadata: item.meta || null,
          acfData: item.acf || null,
          seoData: item.seo || null,
          // Extra fields
          author: item.author || null,
          categories: item.categories || [],
          tags: item.tags || [],
          taxonomies: item.taxonomies || null,
        });
      }
      
      // Check if there are more pages
      if (page >= totalPages || items.length < perPage) {
        hasMore = false;
      } else {
        page++;
      }
    }
    
    console.log(`Fetched ${entities.length} ${postTypeSlug} from plugin API`);
  } catch (error) {
    console.error(`Failed to fetch ${postTypeSlug} from plugin API:`, error.message);
  }

  return entities;
}

// POST - Sync entities from the website
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { siteId, type } = body; // type is the slug (e.g., 'posts', 'pages')

    if (!siteId) {
      return NextResponse.json(
        { error: 'Site ID is required' },
        { status: 400 }
      );
    }

    // Get user's account IDs
    const accountIds = user.accountMemberships.map(m => m.accountId);

    // Get the site with connection details
    const site = await prisma.site.findFirst({
      where: {
        id: siteId,
        accountId: { in: accountIds },
      },
      select: {
        id: true,
        url: true,
        siteKey: true,
        siteSecret: true,
        connectionStatus: true,
      },
    });

    if (!site) {
      return NextResponse.json(
        { error: 'Site not found' },
        { status: 404 }
      );
    }

    // Check if site is connected
    if (!site.siteKey || !site.siteSecret || site.connectionStatus !== 'CONNECTED') {
      return NextResponse.json(
        { error: 'Site is not connected. Please install and activate the WordPress plugin.' },
        { status: 400 }
      );
    }

    // Get entity types to sync
    const entityTypesQuery = { siteId, isEnabled: true };
    if (type) {
      entityTypesQuery.slug = type;
    }

    const entityTypes = await prisma.siteEntityType.findMany({
      where: entityTypesQuery,
    });

    if (entityTypes.length === 0) {
      return NextResponse.json(
        { error: 'No entity types configured for this site' },
        { status: 400 }
      );
    }

    let totalSynced = 0;
    let totalUpdated = 0;
    let totalCreated = 0;
    
    for (const entityType of entityTypes) {
      // Fetch entities using authenticated plugin API with post type slug
      const fetchedEntities = await fetchWordPressEntities(site, entityType.slug);
      
      // Upsert each entity - try to match by externalId first, then by slug
      for (const entity of fetchedEntities) {
        try {
          // First, try to find existing entity by externalId
          let existingEntity = await prisma.siteEntity.findFirst({
            where: {
              siteId: site.id,
              externalId: entity.externalId,
            },
          });

          // If not found by externalId, try to find by slug within the same entity type
          if (!existingEntity && entity.slug) {
            existingEntity = await prisma.siteEntity.findFirst({
              where: {
                siteId: site.id,
                entityTypeId: entityType.id,
                slug: entity.slug,
              },
            });
            
            if (existingEntity) {
              console.log(`[Sync] Found existing entity by slug "${entity.slug}" - will update with WordPress data`);
            }
          }

          const entityData = {
            entityTypeId: entityType.id,
            title: entity.title,
            slug: entity.slug,
            url: entity.url,
            excerpt: entity.excerpt,
            content: entity.content,
            status: entity.status,
            featuredImage: entity.featuredImage,
            publishedAt: entity.publishedAt,
            metadata: entity.metadata,
            acfData: entity.acfData,
            seoData: entity.seoData,
            externalId: entity.externalId, // Always set externalId from WordPress
            updatedAt: new Date(),
          };

          if (existingEntity) {
            // Update existing entity
            await prisma.siteEntity.update({
              where: { id: existingEntity.id },
              data: entityData,
            });
            totalUpdated++;
          } else {
            // Create new entity
            await prisma.siteEntity.create({
              data: {
                siteId: site.id,
                ...entityData,
              },
            });
            totalCreated++;
          }
          totalSynced++;
        } catch (error) {
          console.error(`[Sync] Error syncing entity ${entity.slug}:`, error.message);
        }
      }
    }

    // Update site's updatedAt to track last sync
    await prisma.site.update({
      where: { id: site.id },
      data: { updatedAt: new Date() },
    });

    console.log(`[Sync] Complete: ${totalSynced} total (${totalUpdated} updated, ${totalCreated} created)`);

    return NextResponse.json({ 
      success: true,
      synced: totalSynced,
      updated: totalUpdated,
      created: totalCreated,
      message: `Synced ${totalSynced} entities (${totalUpdated} updated, ${totalCreated} created)`,
    });
  } catch (error) {
    console.error('Failed to sync entities:', error);
    return NextResponse.json(
      { error: 'Failed to sync entities' },
      { status: 500 }
    );
  }
}
