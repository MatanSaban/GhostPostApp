import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getExchangeRate, convertUsdToIlsWithVat } from '@/lib/currency';

/**
 * GET /api/public/plans
 * Fetch all active plans with translations for the public pricing/registration pages
 * No authentication required
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const lang = searchParams.get('lang') || 'he'; // Default to Hebrew

    // Fetch all active plans with translations
    const plans = await prisma.plan.findMany({
      where: {
        isActive: true,
      },
      include: {
        translations: true,
      },
      orderBy: {
        sortOrder: 'asc',
      },
    });

    // Fetch live USD→ILS rate for ILS price annotations
    const usdToIlsRate = await getExchangeRate('USD', 'ILS');

    // Format plans with translations
    const formattedPlans = plans.map((plan, index) => {
      // Find translation for requested language, fallback to Hebrew, then to default plan data
      const translation = plan.translations.find(t => t.language === lang.toUpperCase()) 
        || plan.translations.find(t => t.language === 'HE')
        || null;

      // Determine if this is the "popular" plan (middle plan or first pro-tier plan)
      const isPopular = plan.slug === 'pro' || (plans.length === 3 && index === 1);

      // Get features and limitations - prefer translation, fallback to plan defaults
      const features = translation?.features || plan.features || [];
      const limitations = translation?.limitations || plan.limitations || [];

      // Localized period string
      const periodMap = { he: '/לחודש', fr: '/mois', en: '/month' };
      const period = periodMap[lang] || periodMap.en;

      // Calculate ILS prices including VAT (always convert as USD → ILS)
      const yearlyPrice = plan.yearlyPrice ?? plan.price * 10;
      let ilsMonthlyPrice = null;
      let ilsYearlyPrice = null;
      // Always convert using USD→ILS rate + VAT, regardless of stored currency
      ilsMonthlyPrice = convertUsdToIlsWithVat(plan.price, usdToIlsRate);
      ilsYearlyPrice = convertUsdToIlsWithVat(yearlyPrice, usdToIlsRate);

      return {
        id: plan.id,
        slug: plan.slug,
        name: translation?.name || plan.name,
        description: translation?.description || plan.description || '',
        monthlyPrice: plan.price,
        yearlyPrice,
        currency: plan.currency,
        period,
        features,      // Dynamic features list [{key, label}]
        limitations,   // Dynamic limitations list [{key, label, value?, type?}]
        popular: isPopular,
        ilsMonthlyPrice,  // ILS price including 18% VAT (null if already ILS)
        ilsYearlyPrice,   // ILS yearly price including 18% VAT (null if already ILS)
        usdToIlsRate,     // Live exchange rate used
      };
    });

    return NextResponse.json(
      { plans: formattedPlans },
      {
        headers: {
          // Plans change rarely; safe to serve from CDN for 5 min, SWR for 1 hour.
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching public plans:', error);
    return NextResponse.json(
      { error: 'Failed to fetch plans' },
      { status: 500 }
    );
  }
}
