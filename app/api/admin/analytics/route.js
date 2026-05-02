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

// Parse a `YYYY-MM-DD` (or ISO) param into a Date. Returns null if missing/invalid.
function parseDate(value, { endOfDay = false } = {}) {
  if (!value) return null;
  // Accept either YYYY-MM-DD or full ISO string
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const d = isDateOnly
    ? new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`)
    : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function rangeFor(searchParams, prefix, defaultDays) {
  const now = new Date();
  const from = parseDate(searchParams.get(`${prefix}From`)) ||
    new Date(now.getTime() - defaultDays * 24 * 60 * 60 * 1000);
  const to = parseDate(searchParams.get(`${prefix}To`), { endOfDay: true }) || now;
  return { from, to };
}

function daysBetween(from, to) {
  return Math.max(1, Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)));
}

export async function GET(request) {
  const admin = await verifySuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Per-section date ranges (each defaults to last 30 days).
    const finRange = rangeFor(searchParams, 'fin', 30);
    const platRange = rangeFor(searchParams, 'plat', 30);
    const healthRange = rangeFor(searchParams, 'health', 30);
    const chartRange = rangeFor(searchParams, 'chart', 30);
    const accountsRange = rangeFor(searchParams, 'accounts', 30);
    const signupsRange = rangeFor(searchParams, 'signups', 30);
    const failedRange = rangeFor(searchParams, 'failed', 7);
    const ticketsRange = rangeFor(searchParams, 'tickets', 30);

    const [
      // Snapshot data (no date filter)
      accounts,
      activeSubs,
      totalAccounts,
      totalUsers,
      totalSites,
      contentPublishedToday,
      activeImpersonations,
      supportTicketsOpen,
      // Financial section
      finDebitLogs,
      // Platform section
      newAccountsRange,
      newUsersRange,
      contentPublishedRange,
      // Health section
      contentFailedRange,
      paymentsFailedRange,
      backgroundJobsFailedRange,
      // Charts (daily)
      chartDebitLogs,
      chartPublishedPerDay,
      chartSignupsPerDay,
      // Top accounts
      accountsDebitLogs,
      // Recent signups list
      recentSignups,
      // Failed publishes list
      recentFailedPublishes,
      // Open tickets list
      openTicketsList,
    ] = await Promise.all([
      // Snapshot queries
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
      prisma.user.count(),
      prisma.site.count(),
      prisma.content.count({ where: { status: 'PUBLISHED', publishedAt: { gte: startOfToday } } }),
      prisma.impersonationSession.count({ where: { endedAt: null, expiresAt: { gt: now } } }),
      prisma.supportTicket.count({ where: { status: { in: ['OPEN', 'PENDING_ADMIN'] } } }),

      // Financial section: debit logs in financial range (for AI cost / credits / tokens)
      prisma.aiCreditsLog.findMany({
        where: { type: 'DEBIT', createdAt: { gte: finRange.from, lte: finRange.to } },
        select: { accountId: true, amount: true, metadata: true, createdAt: true },
      }),

      // Platform section
      prisma.account.count({ where: { createdAt: { gte: platRange.from, lte: platRange.to } } }),
      prisma.user.count({ where: { createdAt: { gte: platRange.from, lte: platRange.to } } }),
      prisma.content.count({ where: { status: 'PUBLISHED', publishedAt: { gte: platRange.from, lte: platRange.to } } }),

      // Health section
      prisma.content.count({ where: { status: 'FAILED', updatedAt: { gte: healthRange.from, lte: healthRange.to } } }),
      prisma.payment.count({ where: { status: 'FAILED', createdAt: { gte: healthRange.from, lte: healthRange.to } } }),
      prisma.backgroundJob.count({ where: { status: 'FAILED', updatedAt: { gte: healthRange.from, lte: healthRange.to } } }),

      // Charts: per-day debit logs / signups / publishes within chart range
      prisma.aiCreditsLog.findMany({
        where: { type: 'DEBIT', createdAt: { gte: chartRange.from, lte: chartRange.to } },
        select: { amount: true, metadata: true, createdAt: true },
      }),
      prisma.content.findMany({
        where: { status: 'PUBLISHED', publishedAt: { gte: chartRange.from, lte: chartRange.to } },
        select: { publishedAt: true },
      }),
      prisma.user.findMany({
        where: { createdAt: { gte: chartRange.from, lte: chartRange.to } },
        select: { createdAt: true },
      }),

      // Accounts section: per-account debit aggregation in accounts range
      prisma.aiCreditsLog.findMany({
        where: { type: 'DEBIT', createdAt: { gte: accountsRange.from, lte: accountsRange.to } },
        select: { accountId: true, amount: true, metadata: true },
      }),

      // Recent signups list
      prisma.user.findMany({
        where: { createdAt: { gte: signupsRange.from, lte: signupsRange.to } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, firstName: true, lastName: true, email: true, createdAt: true },
      }),

      // Failed publishes list
      prisma.content.findMany({
        where: { status: 'FAILED', updatedAt: { gte: failedRange.from, lte: failedRange.to } },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: {
          id: true, title: true, errorMessage: true, updatedAt: true,
          site: { select: { id: true, name: true, url: true, accountId: true, account: { select: { name: true } } } },
        },
      }),

      // Open tickets list
      prisma.supportTicket.findMany({
        where: {
          status: { in: ['OPEN', 'PENDING_ADMIN'] },
          lastMessageAt: { gte: ticketsRange.from, lte: ticketsRange.to },
        },
        orderBy: { lastMessageAt: 'desc' },
        take: 10,
        select: {
          id: true, ticketNumber: true, subject: true, priority: true, status: true,
          lastMessageAt: true,
          account: { select: { id: true, name: true } },
          createdBy: { select: { firstName: true, lastName: true, email: true } },
        },
      }),
    ]);

    // ===== MRR (snapshot) =====
    let totalMRR = 0;
    for (const sub of activeSubs) totalMRR += monthlyPriceFor(sub);

    // ===== Financial: AI cost / credits / tokens within finRange =====
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCreditsConsumed = 0;
    let totalAICost = 0;

    for (const log of finDebitLogs) {
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
    }

    // ===== Charts: daily aggregation across chartRange =====
    const dailyMap = {};
    for (const log of chartDebitLogs) {
      const meta = log.metadata || {};
      const inputTokens = meta.inputTokens || 0;
      const outputTokens = meta.outputTokens || 0;
      const model = meta.model || 'pro';
      const imageCount = meta.imageCount || 0;
      const imageTier = meta.imageTier || undefined;
      const cost = calculateTokenCost(inputTokens, outputTokens, model, { imageCount, imageTier });
      const dateKey = log.createdAt.toISOString().slice(0, 10);
      if (!dailyMap[dateKey]) dailyMap[dateKey] = { date: dateKey, cost: 0, revenue: 0, signups: 0, published: 0 };
      dailyMap[dateKey].cost += cost;
    }

    // Skeleton: every day in chartRange (inclusive of start, up to today)
    const chartDays = daysBetween(chartRange.from, chartRange.to);
    const dailyRevenue = totalMRR / 30;
    for (let i = 0; i < chartDays; i++) {
      const d = new Date(chartRange.from.getTime() + i * 24 * 60 * 60 * 1000);
      if (d.getTime() > chartRange.to.getTime()) break;
      const dateKey = d.toISOString().slice(0, 10);
      if (!dailyMap[dateKey]) dailyMap[dateKey] = { date: dateKey, cost: 0, revenue: 0, signups: 0, published: 0 };
      dailyMap[dateKey].revenue = dailyRevenue;
    }
    for (const u of chartSignupsPerDay) {
      const k = u.createdAt.toISOString().slice(0, 10);
      if (dailyMap[k]) dailyMap[k].signups++;
    }
    for (const c of chartPublishedPerDay) {
      if (!c.publishedAt) continue;
      const k = c.publishedAt.toISOString().slice(0, 10);
      if (dailyMap[k]) dailyMap[k].published++;
    }
    const dailyChart = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

    // ===== Top accounts + Cost-over-revenue (uses accountsRange) =====
    const accountCostMap = {};
    for (const log of accountsDebitLogs) {
      const meta = log.metadata || {};
      const inputTokens = meta.inputTokens || 0;
      const outputTokens = meta.outputTokens || 0;
      const model = meta.model || 'pro';
      const imageCount = meta.imageCount || 0;
      const imageTier = meta.imageTier || undefined;
      const cost = calculateTokenCost(inputTokens, outputTokens, model, { imageCount, imageTier });
      if (!accountCostMap[log.accountId]) {
        accountCostMap[log.accountId] = { cost: 0, credits: 0, inputTokens: 0, outputTokens: 0 };
      }
      accountCostMap[log.accountId].cost += cost;
      accountCostMap[log.accountId].credits += log.amount || 0;
      accountCostMap[log.accountId].inputTokens += inputTokens;
      accountCostMap[log.accountId].outputTokens += outputTokens;
    }

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

    // ===== Subscription status breakdown (snapshot) =====
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
        newAccounts: newAccountsRange,
        totalUsers,
        newUsers: newUsersRange,
        activeSubscriptions: activeSubs.length,
        subsByStatus,
        totalSites,
        contentPublished: contentPublishedRange,
        contentPublishedToday,
      },
      health: {
        contentFailed: contentFailedRange,
        supportTicketsOpen,
        paymentsFailed: paymentsFailedRange,
        backgroundJobsFailed: backgroundJobsFailedRange,
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
