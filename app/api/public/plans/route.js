import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getExchangeRate } from '@/lib/currency';
import { formatPlanForClient } from '@/lib/plan-format';

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

    const formattedPlans = plans.map((plan, index) => {
      const isPopular = plan.slug === 'pro' || (plans.length === 3 && index === 1);
      return formatPlanForClient(plan, { lang, usdToIlsRate, isPopular });
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
