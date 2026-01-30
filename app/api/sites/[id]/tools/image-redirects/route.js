import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { makePluginRequest } from '@/lib/wp-api-client';

/**
 * GET /api/sites/[id]/tools/image-redirects
 * 
 * Get list of image redirects created during AI optimization
 */
export async function GET(req, { params }) {
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

    // If site is not connected, return empty redirects
    if (!site.siteKey || !site.siteSecret) {
      return NextResponse.json({ redirects: {}, count: 0 });
    }

    try {
      const result = await makePluginRequest(site, '/media/redirects', 'GET');
      return NextResponse.json(result);
    } catch (pluginError) {
      console.warn('Image redirects not available:', pluginError.message);
      return NextResponse.json({ redirects: {}, count: 0 });
    }
  } catch (error) {
    console.error('Error fetching image redirects:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch image redirects' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/sites/[id]/tools/image-redirects
 * 
 * Clear all image redirects
 */
export async function DELETE(req, { params }) {
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
      return NextResponse.json({ error: 'Site is not connected' }, { status: 400 });
    }

    const result = await makePluginRequest(site, '/media/redirects', 'DELETE');

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error clearing image redirects:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to clear image redirects' },
      { status: 500 }
    );
  }
}
