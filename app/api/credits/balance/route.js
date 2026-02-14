import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { getLimitFromPlan } from '@/lib/account-utils';

const SESSION_COOKIE = 'user_session';

/**
 * GET /api/credits/balance
 * Lightweight endpoint that returns only the credit balance for the current account.
 * Used for background polling to keep credits in sync across users/tabs.
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        lastSelectedAccountId: true,
        accountMemberships: {
          where: { status: 'ACTIVE' },
          select: {
            accountId: true,
            account: {
              select: {
                id: true,
                aiCreditsUsedTotal: true,
                subscription: {
                  select: {
                    plan: {
                      select: { limitations: true },
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
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    const memberships = user.accountMemberships || [];
    const current = user.lastSelectedAccountId
      ? memberships.find((m) => m.accountId === user.lastSelectedAccountId)
      : memberships[0];

    const account = current?.account;
    if (!account) {
      return NextResponse.json({ used: 0, limit: 0 });
    }

    const planLimitations = account.subscription?.plan?.limitations || [];
    const limit = getLimitFromPlan(planLimitations, 'aiCredits', 0);

    return NextResponse.json({
      used: account.aiCreditsUsedTotal || 0,
      limit: limit === null ? -1 : (limit || 0), // -1 = unlimited
    });
  } catch (error) {
    console.error('[API/credits/balance] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch balance' }, { status: 500 });
  }
}
