import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { getLimitFromPlan } from '@/lib/account-utils';

const SESSION_COOKIE = 'user_session';

async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) return null;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        isSuperAdmin: true,
        accountMemberships: {
          select: { accountId: true },
        },
      },
    });
    return user;
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

// GET – Stats for the backlinks page
export async function GET(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId') || null;

    if (!accountId && !user.isSuperAdmin) {
      return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
    }

    if (accountId) {
      const membership = user.accountMemberships.find(m => m.accountId === accountId);
      if (!membership && !user.isSuperAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // Available listings (exclude own if account exists)
    const availableWhere = { status: 'ACTIVE', isActive: true };
    if (accountId) {
      availableWhere.NOT = { publisherAccountId: accountId };
    }
    const totalAvailable = await prisma.backlinkListing.count({ where: availableWhere });

    // Purchases for this account (0 if no account)
    const totalPurchased = accountId
      ? await prisma.backlinkPurchase.count({ where: { buyerAccountId: accountId } })
      : 0;

    // Total spent (direct purchases)
    const directSpent = accountId
      ? await prisma.backlinkPurchase.aggregate({
          where: {
            buyerAccountId: accountId,
            paymentMethod: 'DIRECT',
            status: { not: 'CANCELED' },
          },
          _sum: { amountPaid: true },
        })
      : { _sum: { amountPaid: null } };

    // Plan quota
    let planQuota = { used: 0, limit: 0 };
    if (accountId) {
      const account = await prisma.account.findUnique({
        where: { id: accountId },
        include: {
          subscription: {
            include: { plan: true },
          },
        },
      });

      if (account?.subscription?.plan) {
        const backlinkLimit = getLimitFromPlan(account.subscription.plan, 'backlinks') || 0;
        const periodStart = account.subscription.currentPeriodStart;

        const usedThisPeriod = await prisma.backlinkPurchase.count({
          where: {
            buyerAccountId: accountId,
            paymentMethod: 'PLAN_ALLOCATION',
            createdAt: { gte: periodStart },
            status: { not: 'CANCELED' },
          },
        });

        planQuota = { used: usedThisPeriod, limit: backlinkLimit };
      }
    }

    return NextResponse.json({
      totalAvailable,
      totalPurchased,
      totalSpent: directSpent._sum.amountPaid || 0,
      planQuota,
    });
  } catch (error) {
    console.error('Error fetching backlinks stats:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
