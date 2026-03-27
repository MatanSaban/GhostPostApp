import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { makePluginRequest } from '@/lib/wp-api-client';

/**
 * POST /api/sites/[id]/tools/convert-image-format
 * Convert images to specified formats (WebP/AVIF) on the WordPress site.
 * Accepts per-image format specification for AI-driven conversions.
 *
 * Body: { conversions: [{ id, format }], keepBackups?, flushCache?, replaceUrls? }
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

    const requestBody = {
      conversions: body.conversions ?? [],
      keep_backups: body.keepBackups ?? true,
      flush_cache: body.flushCache ?? true,
      replace_urls: body.replaceUrls ?? true,
    };

    const result = await makePluginRequest(site, '/media/convert-image-format', 'POST', requestBody);

    return NextResponse.json({
      total: result.total ?? 0,
      converted: result.converted ?? 0,
      failed: result.failed ?? 0,
      errors: result.errors ?? [],
      results: result.results ?? [],
    });
  } catch (error) {
    console.error('Error converting image format:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to convert images' },
      { status: 500 }
    );
  }
}
