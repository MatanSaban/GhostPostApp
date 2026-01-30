import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { makePluginRequest } from '@/lib/wp-api-client';

/**
 * POST /api/sites/[id]/tools/convert-to-webp
 * Convert images to WebP format on the WordPress site
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    
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
    
    // Send conversion request to WordPress plugin
    const requestBody = {
      all: body.all ?? false,
      ids: body.ids ?? [],
    };
    
    const result = await makePluginRequest(site, '/media/convert-to-webp', 'POST', requestBody);
    
    return NextResponse.json({
      total: result.total ?? 0,
      converted: result.converted ?? 0,
      failed: result.failed ?? 0,
      errors: result.errors ?? [],
    });
  } catch (error) {
    console.error('Error converting to WebP:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to convert images' },
      { status: 500 }
    );
  }
}
