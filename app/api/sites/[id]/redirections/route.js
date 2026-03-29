import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRedirects, createRedirect as wpCreateRedirect, bulkSyncRedirects, importRedirects, getDetectedRedirectPlugins } from '@/lib/wp-api-client';

/**
 * GET /api/sites/[id]/redirections
 * Get all redirections for a site (from database).
 * Optionally sync with WordPress plugin.
 */
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    
    const site = await prisma.site.findUnique({
      where: { id },
      select: {
        id: true,
        url: true,
        siteKey: true,
        siteSecret: true,
        platform: true,
      },
    });
    
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
    
    // Check for detected WordPress redirect plugins if site is connected
    let detectedPlugins = [];
    let wpRedirects = [];
    if (site.siteKey && site.siteSecret && site.platform === 'wordpress') {
      try {
        const pluginData = await getDetectedRedirectPlugins(site);
        detectedPlugins = pluginData.plugins || [];
      } catch {
        // Plugin endpoint not available - that's fine
      }
    }
    
    return NextResponse.json({
      redirections,
      stats,
      detectedPlugins,
      isConnected: !!(site.siteKey && site.siteSecret),
      isWordPress: site.platform === 'wordpress',
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
    
    const site = await prisma.site.findUnique({
      where: { id },
      select: { id: true, url: true, siteKey: true, siteSecret: true, platform: true },
    });
    
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }
    
    // Normalize source URL - ensure it starts with / and strip trailing slash
    let normalizedSource = sourceUrl.startsWith('/') ? sourceUrl : `/${sourceUrl}`;
    if (normalizedSource.length > 1 && normalizedSource.endsWith('/')) {
      normalizedSource = normalizedSource.slice(0, -1);
    }
    
    // Map type string to enum
    const typeMap = { '301': 'PERMANENT', '302': 'TEMPORARY', '307': 'FOUND', 'PERMANENT': 'PERMANENT', 'TEMPORARY': 'TEMPORARY', 'FOUND': 'FOUND' };
    const redirectType = typeMap[String(type)] || 'PERMANENT';
    
    // Create in database
    const redirection = await prisma.redirection.create({
      data: {
        siteId: id,
        sourceUrl: normalizedSource,
        targetUrl,
        type: redirectType,
      },
    });
    
    // Sync to WordPress if connected
    if (site.siteKey && site.siteSecret && site.platform === 'wordpress') {
      try {
        const typeCodeMap = { PERMANENT: 301, TEMPORARY: 302, FOUND: 307 };
        await wpCreateRedirect(site, {
          source: normalizedSource,
          target: targetUrl,
          type: typeCodeMap[redirectType] || 301,
        });
      } catch (err) {
        console.warn('Failed to sync redirect to WordPress:', err.message);
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
