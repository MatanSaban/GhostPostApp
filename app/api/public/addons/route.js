import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * GET /api/public/addons
 * Get available add-ons for purchase (public, for pricing page etc.)
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const lang = searchParams.get('lang') || 'EN';

    const where = {
      isActive: true,
      ...(type && { type }),
    };

    const addOns = await prisma.addOn.findMany({
      where,
      include: {
        translations: {
          where: { language: lang.toUpperCase() },
        },
      },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }],
    });

    // Format response with translated content
    const formattedAddOns = addOns.map((addOn) => {
      const translation = addOn.translations[0];
      return {
        id: addOn.id,
        name: translation?.name || addOn.name,
        slug: addOn.slug,
        description: translation?.description || addOn.description,
        type: addOn.type,
        price: addOn.price,
        currency: addOn.currency,
        billingType: addOn.billingType,
        quantity: addOn.quantity,
      };
    });

    // Group by type for easier frontend consumption
    const grouped = {
      aiCredits: formattedAddOns.filter((a) => a.type === 'AI_CREDITS'),
      seats: formattedAddOns.filter((a) => a.type === 'SEATS'),
      sites: formattedAddOns.filter((a) => a.type === 'SITES'),
      other: formattedAddOns.filter(
        (a) => !['AI_CREDITS', 'SEATS', 'SITES'].includes(a.type)
      ),
    };

    return NextResponse.json({
      addOns: formattedAddOns,
      grouped,
    });
  } catch (error) {
    console.error('Error fetching public add-ons:', error);
    return NextResponse.json(
      { error: 'Failed to fetch add-ons' },
      { status: 500 }
    );
  }
}
