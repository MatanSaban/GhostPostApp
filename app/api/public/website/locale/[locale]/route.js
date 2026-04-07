import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * GET /api/public/website/locale/[locale]
 * Fetch content dictionary for a specific locale
 * No authentication required
 * 
 * Query params:
 * - draft=true: Return draft content if available (for preview)
 */
export async function GET(request, { params }) {
  try {
    const { locale } = await params;
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

    const localeData = await prisma.websiteLocale.findUnique({
      where: {
        websiteId_locale: {
          websiteId: 'gp-ws',
          locale
        }
      },
      select: {
        content: true,
        contentDraft: true,
        seo: true,
        seoDraft: true,
        version: true,
        updatedAt: true
      }
    });

    if (!localeData) {
      return NextResponse.json(
        { error: 'Locale not found' },
        { status: 404 }
      );
    }

    // Return draft content if requested and available, otherwise published
    const content = (useDraft && localeData.contentDraft) 
      ? localeData.contentDraft 
      : localeData.content;
    const seo = (useDraft && localeData.seoDraft) 
      ? localeData.seoDraft 
      : localeData.seo;

    return NextResponse.json({
      locale,
      content,
      seo,
      version: localeData.version,
      updatedAt: localeData.updatedAt,
      isDraft: useDraft && !!localeData.contentDraft
    });
  } catch (error) {
    console.error('Error fetching website locale:', error);
    return NextResponse.json(
      { error: 'Failed to fetch content' },
      { status: 500 }
    );
  }
}
