import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { getAccountUsage } from '@/lib/account-limits';

const SESSION_COOKIE = 'user_session';

/**
 * GET /api/credits/balance
 * Lightweight endpoint that returns the credit balance for the current account.
 * Uses the unified getAccountUsage calculation which properly handles:
 * - Period-based usage (resets each billing cycle)
 * - Plan base credits + recurring addon bonus
 * - One-time addon credits (persist until consumed)
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
          select: { accountId: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    const memberships = user.accountMemberships || [];
    const accountId = user.lastSelectedAccountId
      || memberships[0]?.accountId;

    if (!accountId) {
      return NextResponse.json({ used: 0, limit: 0, remaining: 0 });
    }

    const usage = await getAccountUsage(accountId, 'aiCredits');

    return NextResponse.json({
      used: usage.used,
      limit: usage.limit === null ? -1 : (usage.limit || 0), // -1 = unlimited
      remaining: usage.remaining,
    });
  } catch (error) {
    console.error('[API/credits/balance] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch balance' }, { status: 500 });
  }
}
