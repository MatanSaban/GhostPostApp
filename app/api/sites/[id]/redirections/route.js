import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cms, getCapabilities } from '@/lib/cms';

/**
 * GET /api/sites/[id]/redirections
 * Get all redirections for a site (from database).
 * Optionally sync with WordPress plugin.
 */
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    
    const site = await prisma.site.findUnique({ where: { id } });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Get redirections from database
    const redirections = await prisma.redirection.findMany({
      where: { siteId: id },
      orderBy: { createdAt: 'desc' },
    });

    // Get stats
    const stats = {
      total: redirections.length,
      active: redirections.filter(r => r.isActive).length,
      totalHits: redirections.reduce((sum, r) => sum + r.hitCount, 0),
    };

    // Detected redirect backends - WP returns plugin list, Shopify returns
    // a single synthetic "shopify-native" provider.
    const caps = getCapabilities(site);
    const isShopifyConnected = !!site.shopifyAccessToken && !!site.shopifyDomain;
    const isWpConnected = !!site.siteKey && !!site.siteSecret;
    const isConnected = caps.platform === 'shopify' ? isShopifyConnected : isWpConnected;

    let detectedPlugins = [];
    if (isConnected) {
      try {
        const pluginData = await cms.getDetectedRedirectPlugins(site);
        detectedPlugins = pluginData.plugins || pluginData.detected || [];
      } catch {
        // endpoint not available - fine
      }
    }

    return NextResponse.json({
      redirections,
      stats,
      detectedPlugins,
      isConnected,
      isWordPress: caps.platform === 'wordpress',
      platform: caps.platform,
    });
    
  } catch (error) {
    console.error('Error fetching redirections:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sites/[id]/redirections
 * Create a new redirection.
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    const { sourceUrl, targetUrl, type } = body;
    
    if (!sourceUrl || !targetUrl) {
      return NextResponse.json(
        { error: 'sourceUrl and targetUrl are required' },
        { status: 400 }
      );
    }
    
    const site = await prisma.site.findUnique({ where: { id } });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Normalize source URL - ensure it starts with /, decode percent-encoded chars, strip trailing slash
    let normalizedSource = sourceUrl.startsWith('/') ? sourceUrl : `/${sourceUrl}`;
    try { normalizedSource = decodeURIComponent(normalizedSource); } catch {}
    if (normalizedSource.length > 1 && normalizedSource.endsWith('/')) {
      normalizedSource = normalizedSource.slice(0, -1);
    }

    // Decode target URL if percent-encoded
    let normalizedTarget = targetUrl;
    try { normalizedTarget = decodeURIComponent(normalizedTarget); } catch {}

    // Map type string to enum
    const typeMap = { '301': 'PERMANENT', '302': 'TEMPORARY', '307': 'FOUND', 'PERMANENT': 'PERMANENT', 'TEMPORARY': 'TEMPORARY', 'FOUND': 'FOUND' };
    const redirectType = typeMap[String(type)] || 'PERMANENT';

    // Create in database
    const redirection = await prisma.redirection.create({
      data: {
        siteId: id,
        sourceUrl: normalizedSource,
        targetUrl: normalizedTarget,
        type: redirectType,
      },
    });

    // Sync to the connected platform (WP plugin or Shopify native)
    const caps = getCapabilities(site);
    const isShopifyConnected = !!site.shopifyAccessToken && !!site.shopifyDomain;
    const isWpConnected = !!site.siteKey && !!site.siteSecret;
    const isConnected = caps.platform === 'shopify' ? isShopifyConnected : isWpConnected;

    if (isConnected) {
      try {
        const typeCodeMap = { PERMANENT: 301, TEMPORARY: 302, FOUND: 307 };
        await cms.createRedirect(site, {
          source: normalizedSource,
          target: normalizedTarget,
          type: typeCodeMap[redirectType] || 301,
        });
      } catch (err) {
        console.warn(`Failed to sync redirect to ${caps.platform}:`, err.message);
      }
    }
    
    return NextResponse.json(redirection, { status: 201 });
    
  } catch (error) {
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'A redirect for this source URL already exists' },
        { status: 409 }
      );
    }
    console.error('Error creating redirection:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
