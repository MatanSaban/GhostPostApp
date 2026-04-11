import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { makePluginRequest } from '@/lib/wp-api-client';

/**
 * POST /api/sites/[id]/tools/clear-queue
 * Clear completed/failed items from the WebP conversion queue
 */
export async function POST(req, { params }) {
  try {
    const { id } = await params;

    const site = await prisma.site.findUnique({
      where: { id },
      select: { id: true, url: true, siteKey: true, siteSecret: true },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const result = await makePluginRequest(site, '/media/clear-queue', 'POST');

    return NextResponse.json(result);
  } catch (error) {
    console.error('Clear queue error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to clear queue' },
      { status: 500 }
    );
  }
}
