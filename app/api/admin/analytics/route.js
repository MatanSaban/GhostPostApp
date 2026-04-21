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

function monthlyPriceFor(sub) {
  if (!sub?.plan) return 0;
  const base = sub.billingInterval === 'YEARLY'
    ? (sub.plan.yearlyPrice || sub.plan.price * 12) / 12
    : sub.plan.price;
  const addOns = (sub.addOnPurchases || []).reduce((s, p) => s + (p.addOn?.price || 0), 0);
  return base + addOns;
}

export async function GET() {
  const admin = await verifySuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      accounts,
      debitLogs,
      activeSubs,
      totalAccounts,
      newAccounts30d,
      totalUsers,
      newUsers30d,
      totalSites,
      contentPublished30d,
      contentPublishedToday,
      contentFailed7d,
      supportTicketsOpen,
      paymentsFailed30d,
      backgroundJobsFailed24h,
      activeImpersonations,
      recentSignups,
      recentFailedPublishes,
      openTicketsList,
      publishedPerDay,
      signupsPerDay,
    ] = await Promise.all([
      prisma.account.findMany({
        select: {
          id: true, name: true, slug: true, createdAt: true,
          subscription: {
            select: {
              status: true, billingInterval: true,
              plan: { select: { id: true, name: true, price: true, yearlyPrice: true } },
              addOnPurchases: {
                where: { status: 'ACTIVE' },
                select: { addOn: { select: { price: true } } },
              },
            },
          },
        },
      }),
      prisma.aiCreditsLog.findMany({
        where: { type: 'DEBIT', createdAt: { gte: thirtyDaysAgo } },
        select: { accountId: true, amount: true, metadata: true, createdAt: true },
      }),
      prisma.subscription.findMany({
        where: { status: { in: ['ACTIVE', 'TRIALING'] } },
        select: {
          status: true, billingInterval: true,
          plan: { select: { price: true, yearlyPrice: true } },
          addOnPurchases: {
            where: { status: 'ACTIVE' },
            select: { addOn: { select: { price: true } } },
          },
        },
      }),
      prisma.account.count(),
      prisma.account.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.site.count(),
      prisma.content.count({ where: { status: 'PUBLISHED', publishedAt: { gte: thirtyDaysAgo } } }),
      prisma.content.count({ where: { status: 'PUBLISHED', publishedAt: { gte: startOfToday } } }),
      prisma.content.count({ where: { status: 'FAILED', updatedAt: { gte: sevenDaysAgo } } }),
      prisma.supportTicket.count({ where: { status: { in: ['OPEN', 'PENDING_ADMIN'] } } }),
      prisma.payment.count({ where: { status: 'FAILED', createdAt: { gte: thirtyDaysAgo } } }),
      prisma.backgroundJob.count({ where: { status: 'FAILED', updatedAt: { gte: oneDayAgo } } }),
      prisma.impersonationSession.count({ where: { endedAt: null, expiresAt: { gt: now } } }),
      prisma.user.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, firstName: true, lastName: true, email: true, createdAt: true },
      }),
      prisma.content.findMany({
        where: { status: 'FAILED', updatedAt: { gte: sevenDaysAgo } },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: {
          id: true, title: true, errorMessage: true, updatedAt: true,
          site: { select: { id: true, name: true, url: true, accountId: true, account: { select: { name: true } } } },
        },
      }),
      prisma.supportTicket.findMany({
        where: { status: { in: ['OPEN', 'PENDING_ADMIN'] } },
        orderBy: { lastMessageAt: 'desc' },
        take: 10,
        select: {
          id: true, ticketNumber: true, subject: true, priority: true, status: true,
          lastMessageAt: true,
          account: { select: { id: true, name: true } },
          createdBy: { select: { firstName: true, lastName: true, email: true } },
        },
      }),
      prisma.content.findMany({
        where: { status: 'PUBLISHED', publishedAt: { gte: thirtyDaysAgo } },
        select: { publishedAt: true },
      }),
      prisma.user.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: { createdAt: true },
      }),
    ]);

    // ===== MRR =====
    let totalMRR = 0;
    for (const sub of activeSubs) totalMRR += monthlyPriceFor(sub);

    // ===== AI cost + daily chart =====
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCreditsConsumed = 0;
    let totalAICost = 0;
    const accountCostMap = {};
    const dailyMap = {};

    for (const log of debitLogs) {
      const meta = log.metadata || {};
      const inputTokens = meta.inputTokens || 0;
      const outputTokens = meta.outputTokens || 0;
      const model = meta.model || 'pro';
      const imageCount = meta.imageCount || 0;
      const imageTier = meta.imageTier || undefined;
      const cost = calculateTokenCost(inputTokens, outputTokens, model, { imageCount, imageTier });

      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;
      totalCreditsConsumed += log.amount || 0;
      totalAICost += cost;

      if (!accountCostMap[log.accountId]) {
        accountCostMap[log.accountId] = { cost: 0, credits: 0, inputTokens: 0, outputTokens: 0 };
      }
      accountCostMap[log.accountId].cost += cost;
      accountCostMap[log.accountId].credits += log.amount || 0;
      accountCostMap[log.accountId].inputTokens += inputTokens;
      accountCostMap[log.accountId].outputTokens += outputTokens;

      const dateKey = log.createdAt.toISOString().slice(0, 10);
      if (!dailyMap[dateKey]) dailyMap[dateKey] = { date: dateKey, cost: 0, revenue: 0, signups: 0, published: 0 };
      dailyMap[dateKey].cost += cost;
    }

    // Fill 30-day skeleton + daily revenue spread
    const dailyRevenue = totalMRR / 30;
    for (let i = 0; i < 30; i++) {
      const d = new Date(thirtyDaysAgo.getTime() + i * 24 * 60 * 60 * 1000);
      const dateKey = d.toISOString().slice(0, 10);
      if (!dailyMap[dateKey]) dailyMap[dateKey] = { date: dateKey, cost: 0, revenue: 0, signups: 0, published: 0 };
      dailyMap[dateKey].revenue = dailyRevenue;
    }
    for (const u of signupsPerDay) {
      const k = u.createdAt.toISOString().slice(0, 10);
      if (dailyMap[k]) dailyMap[k].signups++;
    }
    for (const c of publishedPerDay) {
      if (!c.publishedAt) continue;
      const k = c.publishedAt.toISOString().slice(0, 10);
      if (dailyMap[k]) dailyMap[k].published++;
    }
    const dailyChart = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

    // ===== Account breakdowns =====
    const accountMap = Object.fromEntries(accounts.map(a => [a.id, a]));
    const enriched = Object.entries(accountCostMap)
      .map(([accountId, data]) => {
        const acc = accountMap[accountId];
        if (!acc) return null;
        const monthlyRevenue = monthlyPriceFor(acc.subscription);
        return {
          id: accountId,
          name: acc.name,
          slug: acc.slug,
          planName: acc.subscription?.plan?.name || 'No Plan',
          monthlyRevenue,
          aiCost: data.cost,
          credits: data.credits,
          costExceedsRevenue: data.cost > monthlyRevenue,
        };
      })
      .filter(Boolean);

    const topAccounts = [...enriched].sort((a, b) => b.aiCost - a.aiCost).slice(0, 5);
    const costExceedsRevenueAccounts = enriched
      .filter(a => a.costExceedsRevenue)
      .sort((a, b) => (b.aiCost - b.monthlyRevenue) - (a.aiCost - a.monthlyRevenue))
      .slice(0, 10);

    // ===== Subscription status breakdown =====
    const subsByStatus = activeSubs.reduce((m, s) => {
      m[s.status] = (m[s.status] || 0) + 1;
      return m;
    }, {});

    // ===== Final shape =====
    const profitMargin = totalMRR > 0 ? ((totalMRR - totalAICost) / totalMRR * 100) : 0;
    const netProfit = totalMRR - totalAICost;

    return NextResponse.json({
      financials: {
        totalMRR: Math.round(totalMRR * 100) / 100,
        totalARR: Math.round(totalMRR * 12 * 100) / 100,
        totalAICost: Math.round(totalAICost * 100) / 100,
        netProfit: Math.round(netProfit * 100) / 100,
        profitMargin: Math.round(profitMargin * 10) / 10,
        avgRevenuePerAccount: totalAccounts > 0 ? Math.round((totalMRR / totalAccounts) * 100) / 100 : 0,
      },
      usage: {
        totalCredits: totalCreditsConsumed,
        totalInputTokens,
        totalOutputTokens,
        totalTokens: totalInputTokens + totalOutputTokens,
      },
      platform: {
        totalAccounts,
        newAccounts30d,
        totalUsers,
        newUsers30d,
        activeSubscriptions: activeSubs.length,
        subsByStatus,
        totalSites,
        contentPublished30d,
        contentPublishedToday,
      },
      health: {
        contentFailed7d,
        supportTicketsOpen,
        paymentsFailed30d,
        backgroundJobsFailed24h,
        activeImpersonations,
      },
      topAccounts,
      costExceedsRevenueAccounts,
      recentSignups: recentSignups.map(u => ({
        id: u.id,
        name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email,
        email: u.email,
        createdAt: u.createdAt,
      })),
      recentFailedPublishes: recentFailedPublishes.map(c => ({
        id: c.id,
        title: c.title,
        errorMessage: c.errorMessage,
        updatedAt: c.updatedAt,
        siteDomain: c.site?.url || c.site?.name || null,
        accountName: c.site?.account?.name || null,
        accountId: c.site?.accountId || null,
      })),
      openSupportTickets: openTicketsList.map(t => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        subject: t.subject,
        priority: t.priority,
        status: t.status,
        lastMessageAt: t.lastMessageAt,
        accountName: t.account?.name || null,
        accountId: t.account?.id || null,
        createdByName: t.createdBy ? ([t.createdBy.firstName, t.createdBy.lastName].filter(Boolean).join(' ') || t.createdBy.email) : null,
      })),
      dailyChart,
    });
  } catch (error) {
    console.error('[Admin Analytics] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
