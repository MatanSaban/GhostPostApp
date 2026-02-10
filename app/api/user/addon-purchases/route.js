import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

/**
 * GET /api/user/addon-purchases
 * Get current user's active addon purchases
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get user with their account membership
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        lastSelectedAccountId: true,
        accountMemberships: {
          where: { status: 'ACTIVE' },
          select: {
            accountId: true,
            account: {
              select: {
                subscription: {
                  select: {
                    id: true,
                    addOnPurchases: {
                      where: {
                        status: 'ACTIVE',
                      },
                      include: {
                        addOn: {
                          select: {
                            id: true,
                            name: true,
                            slug: true,
                            type: true,
                            price: true,
                            currency: true,
                            billingType: true,
                            quantity: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get the current account (last selected or first available)
    const accountMemberships = user.accountMemberships || [];
    const currentMembership = user.lastSelectedAccountId
      ? accountMemberships.find(m => m.accountId === user.lastSelectedAccountId)
      : accountMemberships[0];

    const subscription = currentMembership?.account?.subscription;
    const purchases = subscription?.addOnPurchases || [];

    // Format response
    const formattedPurchases = purchases.map(purchase => ({
      id: purchase.id,
      addOnId: purchase.addOnId,
      quantity: purchase.quantity,
      status: purchase.status,
      creditsRemaining: purchase.creditsRemaining,
      purchasedAt: purchase.purchasedAt,
      expiresAt: purchase.expiresAt,
      addOn: purchase.addOn,
    }));

    return NextResponse.json({
      purchases: formattedPurchases,
      subscriptionId: subscription?.id || null,
    });
  } catch (error) {
    console.error('Error fetching addon purchases:', error);
    return NextResponse.json(
      { error: 'Failed to fetch addon purchases' },
      { status: 500 }
    );
  }
}
