import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { makePluginRequest } from '@/lib/wp-api-client';

/**
 * GET /api/sites/[id]/tools/non-webp-images
 * Get list of non-WebP images from the WordPress site
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
    
    // Fetch non-WebP images from WordPress plugin
    const result = await makePluginRequest(site, '/media/non-webp-images', 'GET');
    
    return NextResponse.json({
      images: result.images ?? [],
      total: result.total ?? 0,
    });
    
  } catch (error) {
    console.error('Error fetching non-WebP images:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
