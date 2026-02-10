import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

/**
 * POST /api/sitemaps/[id]/resync - Resync a sitemap and add new entities
 */
export async function POST(request, { params }) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Sitemap ID is required' }, { status: 400 });
    }

    // Fetch sitemap
    const sitemap = await prisma.siteSitemap.findUnique({
      where: { id },
      include: {
        site: {
          select: {
            id: true,
            accountId: true,
            url: true,
          },
        },
      },
    });

    if (!sitemap) {
      return NextResponse.json({ error: 'Sitemap not found' }, { status: 404 });
    }

    // Verify user has access to this site
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
    if (!accountIds.includes(sitemap.site.accountId)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Update status to scanning
    await prisma.siteSitemap.update({
      where: { id },
      data: {
        scanStatus: 'SCANNING',
        scanError: null,
      },
    });

    try {
      // Fetch fresh sitemap content
      const response = await fetch(sitemap.url, {
        headers: { 'User-Agent': 'GhostPost-Platform/1.0' },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch sitemap: ${response.status}`);
      }

      const content = await response.text();
      
      // Parse URLs from sitemap
      const urls = parseUrlsFromSitemap(content, sitemap.isIndex);
      
      // Get existing entity URLs for this site
      const existingEntities = await prisma.siteEntity.findMany({
        where: { siteId: sitemap.site.id },
        select: { url: true },
      });
      const existingUrls = new Set(existingEntities.map(e => e.url));

      // Find new URLs
      const newUrls = urls.filter(url => !existingUrls.has(url.loc));
      
      let newEntities = 0;
      let updatedEntities = 0;

      // Add new entities if any
      if (newUrls.length > 0) {
        // Get entity types for the site
        const entityTypes = await prisma.siteEntityType.findMany({
          where: { siteId: sitemap.site.id },
        });

        const siteUrl = sitemap.site.url;
        
        for (const urlData of newUrls) {
          const entityInfo = categorizeUrl(urlData.loc, siteUrl);
          
          // Find matching entity type
          const entityType = entityTypes.find(t => t.slug === entityInfo.category);
          
          if (entityType) {
            try {
              await prisma.siteEntity.create({
                data: {
                  siteId: sitemap.site.id,
                  entityTypeId: entityType.id,
                  title: entityInfo.title,
                  slug: entityInfo.slug,
                  url: urlData.loc,
                  status: 'PUBLISHED',
                  metadata: {
                    needsDeepCrawl: true,
                    fromSitemapResync: true,
                    sitemapId: id,
                  },
                },
              });
              newEntities++;
            } catch (e) {
              // Entity might already exist with different externalId
              if (e.code !== 'P2002') {
                console.error('Error creating entity:', e.message);
              }
            }
          }
        }
      }

      // Update sitemap record
      await prisma.siteSitemap.update({
        where: { id },
        data: {
          content,
          urlCount: urls.length,
          lastScannedAt: new Date(),
          lastScannedBy: userId,
          scanStatus: 'COMPLETED',
          scanError: null,
        },
      });

      return NextResponse.json({
        success: true,
        urlsScanned: urls.length,
        newEntities,
        updatedEntities,
      });
    } catch (error) {
      // Update status to error
      await prisma.siteSitemap.update({
        where: { id },
        data: {
          scanStatus: 'ERROR',
          scanError: error.message,
        },
      });
      
      throw error;
    }
  } catch (error) {
    console.error('Error resyncing sitemap:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

/**
 * Parse URLs from sitemap XML content
 */
function parseUrlsFromSitemap(content, isIndex) {
  const urls = [];
  
  if (isIndex) {
    // Parse sitemap index - extract sitemap URLs
    const sitemapRegex = /<sitemap>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/gi;
    let match;
    while ((match = sitemapRegex.exec(content)) !== null) {
      urls.push({
        loc: match[1],
        lastmod: match[2] || null,
        type: 'sitemap',
      });
    }
  } else {
    // Parse regular sitemap - extract page URLs
    const urlRegex = /<url>\s*<loc>([^<]+)<\/loc>(?:[\s\S]*?<lastmod>([^<]+)<\/lastmod>)?/gi;
    let match;
    while ((match = urlRegex.exec(content)) !== null) {
      urls.push({
        loc: match[1],
        lastmod: match[2] || null,
      });
    }
  }
  
  return urls;
}

/**
 * Categorize URL into entity type and extract slug/title
 */
function categorizeUrl(url, siteUrl) {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname.replace(/\/$/, '');
    const segments = path.split('/').filter(Boolean);

    // Default values
    let category = 'pages';
    let slug = segments.length > 0 ? segments[segments.length - 1] : 'homepage';
    let title = slugToTitle(slug);

    if (segments.length === 0) {
      return { category: 'pages', slug: 'homepage', title: 'עמוד הבית' };
    }

    // Content type prefixes
    const contentTypePrefixes = {
      'blog': 'posts',
      'posts': 'posts',
      'news': 'posts',
      'articles': 'posts',
      'products': 'products',
      'product': 'products',
      'shop': 'products',
      'services': 'services',
      'service': 'services',
      'projects': 'projects',
      'project': 'projects',
      'portfolio': 'portfolio',
      'work': 'portfolio',
    };

    if (segments.length >= 2) {
      const firstSegment = segments[0].toLowerCase();
      if (contentTypePrefixes[firstSegment]) {
        category = contentTypePrefixes[firstSegment];
      }
    }

    return { category, slug, title };
  } catch (e) {
    return { category: 'pages', slug: 'unknown', title: 'Unknown' };
  }
}

/**
 * Convert slug to title
 */
function slugToTitle(slug) {
  if (!slug || slug === 'homepage') return 'עמוד הבית';
  return slug
    .replace(/-/g, ' ')
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
