import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { makePluginRequest } from '@/lib/wp-api-client';

/**
 * POST /api/sites/[id]/tools/ai-optimize-image
 * AI optimize a single image (filename and alt text)
 */
export async function POST(req, { params }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const { 
      imageId, 
      applyFilename = false, 
      applyAltText = false,
      pageContext = '',
      language = 'en',
    } = body;

    if (!imageId) {
      return NextResponse.json(
        { error: 'Image ID is required' },
        { status: 400 }
      );
    }

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

    const result = await makePluginRequest(site, '/media/ai-optimize', 'POST', {
      image_id: imageId,
      apply_filename: applyFilename,
      apply_alt_text: applyAltText,
      page_context: pageContext,
      language,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('AI optimize image error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to optimize image' },
      { status: 500 }
    );
  }
}
