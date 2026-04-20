import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * GET /api/public/website/seo
 * Fetch site-wide SEO configuration for gp-ws
 * No authentication required
 */
export async function GET() {
  try {
    const seo = await prisma.websiteSeo.findUnique({
      where: { websiteId: 'gp-ws' }
    });

    const headers = {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
    };

    if (!seo) {
      return NextResponse.json(
        {
          siteName: { en: 'Ghost Post', he: 'גוסט פוסט', fr: 'Ghost Post' },
          siteUrl: 'https://ghostpost.co.il',
          defaultOgImage: '/og/default.png',
          twitterHandle: '@ghostpost',
          defaultRobots: 'index, follow, max-video-preview:-1, max-image-preview:large, max-snippet:-1'
        },
        { headers }
      );
    }

    return NextResponse.json(
      {
        siteName: seo.siteName,
        siteUrl: seo.siteUrl,
        defaultOgImage: seo.defaultOgImage,
        twitterHandle: seo.twitterHandle,
        defaultRobots: seo.defaultRobots
      },
      { headers }
    );
  } catch (error) {
    console.error('Error fetching website SEO:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SEO configuration' },
      { status: 500 }
    );
  }
}
