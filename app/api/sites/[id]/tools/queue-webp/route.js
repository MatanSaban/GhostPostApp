import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { makePluginRequest } from '@/lib/wp-api-client';

/**
 * POST /api/sites/[id]/tools/queue-webp
 * Add images to the WebP conversion queue
 */
export async function POST(req, { params }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const site = await prisma.site.findUnique({
      where: { id },
      select: { id: true, url: true, siteKey: true, siteSecret: true },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // ids: array of image IDs to queue
    // keep_backups: whether to keep backups (default: true)
    // flush_cache: whether to flush cache after conversion (default: true)
    // replace_urls: whether to replace old URLs in content (default: true)
    const { ids, keepBackups = true, flushCache = true, replaceUrls = true } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'No image IDs provided' },
        { status: 400 }
      );
    }

    const result = await makePluginRequest(site, '/media/queue-webp', 'POST', {
      ids,
      keep_backups: keepBackups,
      flush_cache: flushCache,
      replace_urls: replaceUrls,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Queue WebP error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to queue images for conversion' },
      { status: 500 }
    );
  }
}
