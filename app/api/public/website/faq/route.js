import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET - Fetch published FAQs for a specific page and locale
// Usage: /api/public/website/faq?page=pricing&locale=en
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = searchParams.get('page') || 'pricing';
    const locale = searchParams.get('locale') || 'en';

    const faqs = await prisma.websiteFaq.findMany({
      where: {
        websiteId: 'gp-ws',
        isActive: true,
        OR: [{ page }, { page: 'both' }],
      },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        content: true,
        category: true,
        page: true,
        order: true,
      },
    });

    // Return FAQ items with locale-specific content, fallback to en
    const localizedFaqs = faqs
      .map((faq) => {
        const content = faq.content || {};
        const localeContent = content[locale] || content.en || {};
        if (!localeContent.question) return null;

        return {
          id: faq.id,
          question: localeContent.question,
          answer: localeContent.answer || '',
          category: faq.category,
        };
      })
      .filter(Boolean);

    return NextResponse.json(
      { faqs: localizedFaqs },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching public FAQs:', error);
    return NextResponse.json({ faqs: [] }, { status: 500 });
  }
}
