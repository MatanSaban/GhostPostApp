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
        entities.push({
          externalId: String(item.id),
          title: item.title || 'Untitled',
          slug: item.slug,
          url: item.permalink || item.link,
          excerpt: item.excerpt || null,
          content: item.content || null,
          status: item.status === 'publish' ? 'PUBLISHED' : 'DRAFT',
          featuredImage: item.featured_image || null,
          publishedAt: item.date ? new Date(item.date) : null,
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
    
    for (const entityType of entityTypes) {
      // Fetch entities using authenticated plugin API with post type slug
      const fetchedEntities = await fetchWordPressEntities(site, entityType.slug);
      
      // Upsert each entity using siteId + externalId as unique identifier
      for (const entity of fetchedEntities) {
        await prisma.siteEntity.upsert({
          where: {
            siteId_externalId: {
              siteId: site.id,
              externalId: entity.externalId,
            },
          },
          update: {
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
            updatedAt: new Date(),
          },
          create: {
            siteId: site.id,
            entityTypeId: entityType.id,
            title: entity.title,
            slug: entity.slug,
            url: entity.url,
            excerpt: entity.excerpt,
            content: entity.content,
            status: entity.status,
            featuredImage: entity.featuredImage,
            externalId: entity.externalId,
            publishedAt: entity.publishedAt,
            metadata: entity.metadata,
            acfData: entity.acfData,
            seoData: entity.seoData,
          },
        });
        totalSynced++;
      }
    }

    // Update site's updatedAt to track last sync
    await prisma.site.update({
      where: { id: site.id },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({ 
      success: true,
      synced: totalSynced,
      message: `Synced ${totalSynced} entities`,
    });
  } catch (error) {
    console.error('Failed to sync entities:', error);
    return NextResponse.json(
      { error: 'Failed to sync entities' },
      { status: 500 }
    );
  }
}
