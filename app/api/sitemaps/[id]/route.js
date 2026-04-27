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
    if (!user.isSuperAdmin && !accountIds.includes(sitemap.site.accountId)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Parse URLs from stored content, or fetch live if no content stored
    let urls = [];
    let content = sitemap.content;
    
    if (!content) {
      // Content not stored - fetch live from the sitemap URL
      try {
        const response = await fetch(sitemap.url, {
          headers: { 'User-Agent': 'GhostSEO-Platform/1.0' },
          signal: AbortSignal.timeout(20000),
          cache: 'no-store',
        });
        if (response.ok) {
          content = await response.text();
          // Save the fetched content for future use
          await prisma.siteSitemap.update({
            where: { id },
            data: { content },
          });
        }
      } catch (fetchErr) {
        console.error('Error fetching sitemap content live:', fetchErr.message);
      }
    }
    
    if (content) {
      urls = parseUrlsFromSitemap(content, sitemap.isIndex);
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
    const sitemapRegex = /<sitemap>([\s\S]*?)<\/sitemap>/gi;
    let match;
    while ((match = sitemapRegex.exec(content)) !== null) {
      const block = match[1];
      const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1] || null;
      const lastmod = block.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] || null;
      if (loc) {
        urls.push({ loc, lastmod, type: 'sitemap' });
      }
    }
  } else {
    // Parse regular sitemap - extract page URLs with all available metadata
    const urlRegex = /<url>([\s\S]*?)<\/url>/gi;
    let match;
    while ((match = urlRegex.exec(content)) !== null) {
      const block = match[1];
      const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1] || null;
      if (!loc) continue;
      
      const lastmod = block.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] || null;
      const changefreq = block.match(/<changefreq>([^<]+)<\/changefreq>/)?.[1] || null;
      const priority = block.match(/<priority>([^<]+)<\/priority>/)?.[1] || null;
      
      // Extract image data if present
      const imageMatch = block.match(/<image:loc>([^<]+)<\/image:loc>/);
      const imageTitleMatch = block.match(/<image:title>([^<]+)<\/image:title>/);
      
      urls.push({
        loc,
        lastmod,
        changefreq,
        priority,
        image: imageMatch?.[1] || null,
        imageTitle: imageTitleMatch?.[1] || null,
      });
    }
  }
  
  return urls;
}
