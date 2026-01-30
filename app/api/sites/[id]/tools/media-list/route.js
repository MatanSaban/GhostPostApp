import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { makePluginRequest } from '@/lib/wp-api-client';

/**
 * GET /api/sites/[id]/tools/media-list
 * 
 * Get list of media items for AI optimization
 */
export async function GET(req, { params }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

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

    // If site is not connected, return empty list
    if (!site.siteKey || !site.siteSecret) {
      return NextResponse.json({ items: [] });
    }

    try {
      // Get media items from WordPress
      const result = await makePluginRequest(
        site, 
        `/media?per_page=${limit}&mime_type=image`, 
        'GET'
      );

      // Format items for the UI
      const items = (result.items || []).map(item => ({
        id: item.id,
        title: item.title || '',
        thumbnail: item.sizes?.thumbnail?.url || item.url,
        url: item.url,
        alt: item.alt || '',
        mimeType: item.mime_type || item.mimeType,
      }));

      return NextResponse.json({ items });
    } catch (pluginError) {
      console.warn('Media list not available:', pluginError.message);
      return NextResponse.json({ items: [] });
    }
  } catch (error) {
    console.error('Error fetching media list:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch media list' },
      { status: 500 }
    );
  }
}
