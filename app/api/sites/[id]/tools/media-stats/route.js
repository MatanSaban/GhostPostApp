import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { makePluginRequest } from '@/lib/wp-api-client';

/**
 * GET /api/sites/[id]/tools/media-stats
 * Get media statistics from the WordPress site
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
      },
    });
    
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }
    
    if (!site.siteKey || !site.siteSecret) {
      return NextResponse.json(
        { error: 'Site is not connected. Please install and activate the plugin.' },
        { status: 400 }
      );
    }
    
    // Fetch media stats from WordPress plugin
    const result = await makePluginRequest(site, '/media/stats', 'GET');
    
    return NextResponse.json({
      total: result.total ?? 0,
      webp: result.webp ?? 0,
      nonWebp: result.nonWebp ?? 0,
    });
  } catch (error) {
    console.error('Error fetching media stats:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch media stats' },
      { status: 500 }
    );
  }
}
