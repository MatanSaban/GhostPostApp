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

    // Build URL variants for flexible matching (http↔https, trailing slash)
    const allVariants = new Set(lookupUrls);
    for (const u of lookupUrls) {
      try {
        const parsed = new URL(u);
        const withSlash = parsed.href.endsWith('/') ? parsed.href : parsed.href + '/';
        const withoutSlash = parsed.href.endsWith('/') ? parsed.href.slice(0, -1) : parsed.href;
        allVariants.add(withSlash);
        allVariants.add(withoutSlash);
        if (parsed.protocol === 'https:') {
          const http = new URL(u);
          http.protocol = 'http:';
          allVariants.add(http.href);
          allVariants.add(http.href.endsWith('/') ? http.href.slice(0, -1) : http.href + '/');
        } else if (parsed.protocol === 'http:') {
          const https = new URL(u);
          https.protocol = 'https:';
          allVariants.add(https.href);
          allVariants.add(https.href.endsWith('/') ? https.href.slice(0, -1) : https.href + '/');
        }
      } catch {}
    }

    // Find entities by URL match (including variants) - enabled types only so
    // the agent never resolves a URL to an entity the user has toggled off.
    const entities = await prisma.siteEntity.findMany({
      where: {
        siteId,
        url: { in: [...allVariants] },
        entityType: { isEnabled: true },
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
    // Map entities back to original lookup URLs using normalized comparison
    const urlMap = {};
    const normalize = (u) => {
      try { const p = new URL(u); return p.hostname + p.pathname.replace(/\/$/, ''); } catch { return u; }
    };
    const entityByNorm = {};
    for (const entity of entities) {
      if (entity.url) {
        const norm = normalize(entity.url);
        entityByNorm[norm] = entity;
      }
    }
    for (const lookupUrl of lookupUrls) {
      const norm = normalize(lookupUrl);
      const entity = entityByNorm[norm];
      if (entity) {
        urlMap[lookupUrl] = {
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
            entityType: { isEnabled: true },
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
