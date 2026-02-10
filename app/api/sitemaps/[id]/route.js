import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

/**
 * GET /api/sitemaps/[id] - Get single sitemap with parsed URLs
 */
export async function GET(request, { params }) {
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

    // Fetch sitemap with user info
    const sitemap = await prisma.siteSitemap.findUnique({
      where: { id },
      include: {
        scannedByUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        site: {
          select: {
            accountId: true,
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

    // Parse URLs from stored content
    let urls = [];
    if (sitemap.content) {
      urls = parseUrlsFromSitemap(sitemap.content, sitemap.isIndex);
    }

    // Remove site from response
    const { site, ...sitemapData } = sitemap;

    return NextResponse.json({ 
      sitemap: sitemapData,
      urls: urls.slice(0, 500), // Limit to 500 URLs for performance
    });
  } catch (error) {
    console.error('Error fetching sitemap:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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
