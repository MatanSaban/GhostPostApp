import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { calculateTokenCost } from '@/lib/ai/pricing';

const SESSION_COOKIE = 'user_session';

async function verifySuperAdmin() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) return null;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isSuperAdmin: true },
    });

    if (!user || !user.isSuperAdmin) return null;
    return user;
  } catch {
    return null;
  }
}

export async function GET() {
  const admin = await verifySuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Fetch all data in parallel
    const [accounts, debitLogs, allSubscriptions] = await Promise.all([
      // All accounts with subscriptions
      prisma.account.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          aiCreditsUsedTotal: true,
          subscription: {
            select: {
              status: true,
              billingInterval: true,
              plan: { select: { id: true, name: true, price: true, yearlyPrice: true } },
              addOnPurchases: {
                where: { status: 'ACTIVE' },
                select: { addOn: { select: { price: true } } },
              },
            },
          },
        },
      }),
      // All DEBIT logs this month
      prisma.aiCreditsLog.findMany({
        where: {
          type: 'DEBIT',
          createdAt: { gte: thirtyDaysAgo },
        },
        select: {
          accountId: true,
          userId: true,
          amount: true,
          source: true,
          metadata: true,
          createdAt: true,
        },
      }),
      // Active subscriptions for MRR
      prisma.subscription.findMany({
        where: { status: { in: ['ACTIVE', 'TRIALING'] } },
        select: {
          billingInterval: true,
          plan: { select: { price: true, yearlyPrice: true } },
          addOnPurchases: {
            where: { status: 'ACTIVE' },
            select: { addOn: { select: { price: true } } },
          },
        },
      }),
    ]);

    // Calculate MRR
    let totalMRR = 0;
    for (const sub of allSubscriptions) {
      const planPrice = sub.billingInterval === 'YEARLY'
        ? (sub.plan.yearlyPrice || sub.plan.price * 12) / 12
        : sub.plan.price;
      const addOnRevenue = sub.addOnPurchases.reduce((sum, p) => sum + (p.addOn?.price || 0), 0);
      totalMRR += planPrice + addOnRevenue;
    }

    // Calculate global token/cost stats
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCreditsConsumed = 0;
    let totalAICost = 0;

    // Per-account cost aggregation
    const accountCostMap = {};
    // Daily cost/revenue for chart
    const dailyMap = {};

    for (const log of debitLogs) {
      const meta = log.metadata || {};
      const inputTokens = meta.inputTokens || 0;
      const outputTokens = meta.outputTokens || 0;
      const model = meta.model || 'pro';
      const cost = calculateTokenCost(inputTokens, outputTokens, model);

      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;
      totalCreditsConsumed += log.amount || 0;
      totalAICost += cost;

      // Per account
      if (!accountCostMap[log.accountId]) {
        accountCostMap[log.accountId] = { cost: 0, credits: 0, inputTokens: 0, outputTokens: 0 };
      }
      accountCostMap[log.accountId].cost += cost;
      accountCostMap[log.accountId].credits += log.amount || 0;
      accountCostMap[log.accountId].inputTokens += inputTokens;
      accountCostMap[log.accountId].outputTokens += outputTokens;

      // Daily aggregation
      const dateKey = log.createdAt.toISOString().slice(0, 10);
      if (!dailyMap[dateKey]) {
        dailyMap[dateKey] = { date: dateKey, cost: 0, revenue: 0 };
      }
      dailyMap[dateKey].cost += cost;
    }

    // Fill daily revenue (spread MRR evenly across days)
    const dailyRevenue = totalMRR / 30;
    for (let i = 0; i < 30; i++) {
      const d = new Date(thirtyDaysAgo.getTime() + i * 24 * 60 * 60 * 1000);
      const dateKey = d.toISOString().slice(0, 10);
      if (!dailyMap[dateKey]) {
        dailyMap[dateKey] = { date: dateKey, cost: 0, revenue: 0 };
      }
      dailyMap[dateKey].revenue = dailyRevenue;
    }
    const dailyChart = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

    // Top 5 accounts by cost
    const accountMap = {};
    for (const acc of accounts) {
      accountMap[acc.id] = acc;
    }

    const topAccounts = Object.entries(accountCostMap)
      .map(([accountId, data]) => {
        const acc = accountMap[accountId];
        if (!acc) return null;
        const sub = acc.subscription;
        let monthlyRevenue = 0;
        if (sub) {
          monthlyRevenue = sub.billingInterval === 'YEARLY'
            ? (sub.plan.yearlyPrice || sub.plan.price * 12) / 12
            : sub.plan.price;
          monthlyRevenue += sub.addOnPurchases.reduce((sum, p) => sum + (p.addOn?.price || 0), 0);
        }
        return {
          id: accountId,
          name: acc.name,
          slug: acc.slug,
          planName: sub?.plan?.name || 'No Plan',
          monthlyRevenue,
          aiCost: data.cost,
          credits: data.credits,
          costExceedsRevenue: data.cost > monthlyRevenue,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.aiCost - a.aiCost)
      .slice(0, 5);

    const profitMargin = totalMRR > 0 ? ((totalMRR - totalAICost) / totalMRR * 100) : 0;

    return NextResponse.json({
      financials: {
        totalMRR: Math.round(totalMRR * 100) / 100,
        totalAICost: Math.round(totalAICost * 100) / 100,
        profitMargin: Math.round(profitMargin * 10) / 10,
      },
      usage: {
        totalCredits: totalCreditsConsumed,
        totalInputTokens,
        totalOutputTokens,
        totalTokens: totalInputTokens + totalOutputTokens,
      },
      topAccounts,
      dailyChart,
    });
  } catch (error) {
    console.error('[Admin Analytics] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
