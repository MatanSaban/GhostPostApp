import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { makePluginRequest } from '@/lib/wp-api-client';

/**
 * POST /api/sites/[id]/tools/process-queue-item
 * Process the next pending item in the WebP conversion queue.
 * Called repeatedly by the platform to drive queue processing
 * (replaces unreliable WP-Cron dependency).
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

    if (!site.siteKey || !site.siteSecret) {
      return NextResponse.json({ error: 'Site is not connected' }, { status: 400 });
    }

    const result = await makePluginRequest(site, '/media/process-queue-item', 'POST');

    return NextResponse.json(result);
  } catch (error) {
    console.error('Process queue item error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process queue item' },
      { status: 500 }
    );
  }
}
