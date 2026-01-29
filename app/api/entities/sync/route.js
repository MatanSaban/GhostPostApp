import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

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

// Fetch entities from WordPress REST API
async function fetchWordPressEntities(siteUrl, apiEndpoint) {
  const entities = [];

  if (!apiEndpoint) return entities;

  try {
    // Normalize site URL
    const baseUrl = siteUrl.replace(/\/$/, '');
    const apiUrl = `${baseUrl}/wp-json/wp/v2/${apiEndpoint}?per_page=100&status=publish,draft`;
    
    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.log(`WordPress API not available for ${apiEndpoint}: ${response.status}`);
      return entities;
    }

    const data = await response.json();
    
    for (const item of data) {
      entities.push({
        externalId: String(item.id),
        title: item.title?.rendered || item.title || 'Untitled',
        slug: item.slug,
        url: item.link,
        excerpt: item.excerpt?.rendered?.replace(/<[^>]*>/g, '') || null,
        content: item.content?.rendered || null,
        status: item.status === 'publish' ? 'PUBLISHED' : 'DRAFT',
        featuredImage: item._embedded?.['wp:featuredmedia']?.[0]?.source_url || null,
        publishedAt: item.date ? new Date(item.date) : null,
      });
    }
  } catch (error) {
    console.error(`Failed to fetch ${apiEndpoint} from WordPress:`, error);
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

    // Verify the user has access to this site
    const site = await prisma.site.findFirst({
      where: {
        id: siteId,
        accountId: { in: accountIds },
      },
    });

    if (!site) {
      return NextResponse.json(
        { error: 'Site not found' },
        { status: 404 }
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
      // Fetch entities from the website using the configured API endpoint
      const fetchedEntities = await fetchWordPressEntities(site.url, entityType.apiEndpoint);
      
      // Upsert each entity
      for (const entity of fetchedEntities) {
        await prisma.siteEntity.upsert({
          where: {
            siteId_entityTypeId_slug: {
              siteId: site.id,
              entityTypeId: entityType.id,
              slug: entity.slug,
            },
          },
          update: {
            title: entity.title,
            url: entity.url,
            excerpt: entity.excerpt,
            content: entity.content,
            status: entity.status,
            featuredImage: entity.featuredImage,
            externalId: entity.externalId,
            publishedAt: entity.publishedAt,
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
