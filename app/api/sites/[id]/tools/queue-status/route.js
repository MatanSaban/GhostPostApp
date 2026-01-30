import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { makePluginRequest } from '@/lib/wp-api-client';

/**
 * GET /api/sites/[id]/tools/queue-status
 * Get the current WebP conversion queue status
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

    // If site is not connected, return empty queue status
    if (!site.siteKey || !site.siteSecret) {
      return NextResponse.json({
        pending: 0,
        completed: 0,
        failed: 0,
        total: 0,
        is_processing: false,
      });
    }

    try {
      const result = await makePluginRequest(site, '/media/queue-status', 'GET');
      return NextResponse.json(result);
    } catch (pluginError) {
      console.warn('Queue status not available:', pluginError.message);
      return NextResponse.json({
        pending: 0,
        completed: 0,
        failed: 0,
        total: 0,
        is_processing: false,
      });
    }
  } catch (error) {
    console.error('Queue status error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get queue status' },
      { status: 500 }
    );
  }
}
