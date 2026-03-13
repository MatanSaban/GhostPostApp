import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) return null;
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        lastSelectedAccountId: true,
        accountMemberships: { select: { accountId: true } },
      },
    });
  } catch {
    return null;
  }
}

/**
 * POST /api/agent/entity-lookup
 * Look up SiteEntity records matching a list of URLs for a given site.
 * Returns a map of URL → { entityId, entityTypeSlug, title }
 */
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { siteId, urls } = await request.json();
    if (!siteId || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ error: 'siteId and urls[] required' }, { status: 400 });
    }

    // Limit to prevent abuse
    const lookupUrls = urls.slice(0, 50);

    // Extract pathnames for fallback matching
    const urlPatterns = lookupUrls.map(u => {
      try {
        return new URL(u).pathname.replace(/\/$/, '') || '/';
      } catch {
        return u;
      }
    });

    // Find entities by exact URL match
    const entities = await prisma.siteEntity.findMany({
      where: {
        siteId,
        url: { in: lookupUrls },
      },
      select: {
        id: true,
        title: true,
        url: true,
        slug: true,
        entityType: { select: { slug: true, name: true } },
      },
    });

    // Build URL → entity map
    const urlMap = {};
    for (const entity of entities) {
      if (entity.url) {
        urlMap[entity.url] = {
          entityId: entity.id,
          entityTypeSlug: entity.entityType?.slug,
          entityTypeName: entity.entityType?.name,
          title: entity.title,
        };
      }
    }

    // For unmatched URLs, try slug-based matching
    const unmatchedUrls = lookupUrls.filter(u => !urlMap[u]);
    if (unmatchedUrls.length > 0) {
      const slugsToMatch = unmatchedUrls.map(u => {
        try {
          const path = new URL(u).pathname.replace(/\/$/, '');
          return path.split('/').pop() || '';
        } catch {
          return '';
        }
      }).filter(Boolean);

      if (slugsToMatch.length > 0) {
        const slugEntities = await prisma.siteEntity.findMany({
          where: {
            siteId,
            slug: { in: slugsToMatch },
          },
          select: {
            id: true,
            title: true,
            url: true,
            slug: true,
            entityType: { select: { slug: true, name: true } },
          },
        });

        // Map by slug
        const slugMap = {};
        for (const e of slugEntities) {
          slugMap[e.slug] = e;
        }

        for (const url of unmatchedUrls) {
          try {
            const path = new URL(url).pathname.replace(/\/$/, '');
            const slug = path.split('/').pop() || '';
            if (slugMap[slug]) {
              const e = slugMap[slug];
              urlMap[url] = {
                entityId: e.id,
                entityTypeSlug: e.entityType?.slug,
                entityTypeName: e.entityType?.name,
                title: e.title,
              };
            }
          } catch {}
        }
      }
    }

    return NextResponse.json({ urlMap });
  } catch (error) {
    console.error('[Agent Entity Lookup] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
