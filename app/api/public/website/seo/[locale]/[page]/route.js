import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * GET /api/public/website/seo/[locale]/[page]
 * Fetch SEO metadata for a specific page and locale
 * No authentication required
 * 
 * Query params:
 * - draft=true: Return draft SEO if available (for preview)
 */
export async function GET(request, { params }) {
  try {
    const { locale, page } = await params;
    const { searchParams } = new URL(request.url);
    const useDraft = searchParams.get('draft') === 'true';
    
    // Validate locale
    const validLocales = ['en', 'he', 'fr'];
    if (!validLocales.includes(locale)) {
      return NextResponse.json(
        { error: 'Invalid locale' },
        { status: 400 }
      );
    }

    // Fetch locale data with SEO
    const localeData = await prisma.websiteLocale.findUnique({
      where: {
        websiteId_locale: {
          websiteId: 'gp-ws',
          locale
        }
      },
      select: {
        seo: true,
        seoDraft: true
      }
    });

    if (!localeData) {
      return NextResponse.json(
        { error: 'Locale not found' },
        { status: 404 }
      );
    }

    // Get the appropriate SEO data
    const seoData = (useDraft && localeData.seoDraft) 
      ? localeData.seoDraft 
      : localeData.seo;

    const headers = useDraft
      ? { 'Cache-Control': 'no-store' }
      : { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' };

    if (!seoData || !seoData[page]) {
      return NextResponse.json(
        {
          title: 'Ghost Post',
          description: 'AI-Powered SEO Automation',
          canonical: `/${page}`,
          ogTitle: 'Ghost Post',
          ogDescription: 'AI-Powered SEO Automation',
          ogImage: '/og/default.png',
          ogType: 'website',
          twitterCard: 'summary_large_image',
          robots: 'index, follow',
          jsonLd: null
        },
        { headers }
      );
    }

    return NextResponse.json(seoData[page], { headers });
  } catch (error) {
    console.error('Error fetching page SEO:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SEO' },
      { status: 500 }
    );
  }
}
