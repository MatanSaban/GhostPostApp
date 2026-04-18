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

export async function GET(request, { params }) {
  const admin = await verifySuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Account ID required' }, { status: 400 });
  }

  try {
    const url = new URL(request.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const minCost = parseFloat(url.searchParams.get('minCost')) || 0;
    const maxCost = parseFloat(url.searchParams.get('maxCost')) || Infinity;
    const minTokens = parseInt(url.searchParams.get('minTokens')) || 0;
    const maxTokens = parseInt(url.searchParams.get('maxTokens')) || Infinity;
    const minCredits = parseInt(url.searchParams.get('minCredits')) || 0;
    const maxCredits = parseInt(url.searchParams.get('maxCredits')) || Infinity;

    const dateFilter = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      dateFilter.lte = toDate;
    }
    if (!from && !to) {
      // Default: last 30 days
      dateFilter.gte = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    const [account, logs] = await Promise.all([
      prisma.account.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          slug: true,
          aiCreditsBalance: true,
          aiCreditsUsedTotal: true,
          subscription: {
            select: {
              status: true,
              billingInterval: true,
              plan: { select: { name: true, price: true, yearlyPrice: true } },
              addOnPurchases: {
                where: { status: 'ACTIVE' },
                select: {
                  addOn: { select: { name: true, price: true, type: true } },
                },
              },
            },
          },
        },
      }),
      prisma.aiCreditsLog.findMany({
        where: {
          accountId: id,
          type: 'DEBIT',
          createdAt: Object.keys(dateFilter).length > 0 ? dateFilter : undefined,
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          userId: true,
          amount: true,
          source: true,
          description: true,
          metadata: true,
          createdAt: true,
        },
      }),
    ]);

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Fetch user names for logs
    const userIds = [...new Set(logs.map(l => l.userId).filter(Boolean))];
    const users = userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const userMap = {};
    for (const u of users) {
      userMap[u.id] = u;
    }

    // Calculate profitability
    const sub = account.subscription;
    let monthlyRevenue = 0;
    let addOnRevenue = 0;
    if (sub) {
      monthlyRevenue = sub.billingInterval === 'YEARLY'
        ? (sub.plan.yearlyPrice || sub.plan.price * 12) / 12
        : sub.plan.price;
      addOnRevenue = sub.addOnPurchases.reduce((sum, p) => sum + (p.addOn?.price || 0), 0);
    }
    const totalRevenue = monthlyRevenue + addOnRevenue;

    // Process logs with cost calculation and filtering
    let totalAICost = 0;
    const usageData = [];

    for (const log of logs) {
      const meta = log.metadata || {};
      const inputTokens = meta.inputTokens || 0;
      const outputTokens = meta.outputTokens || 0;
      const model = meta.model || 'pro';
      const cost = calculateTokenCost(inputTokens, outputTokens, model);
      const totalTokensForLog = inputTokens + outputTokens;

      // Apply filters
      if (cost < minCost || (maxCost !== Infinity && cost > maxCost)) continue;
      if (totalTokensForLog < minTokens || (maxTokens !== Infinity && totalTokensForLog > maxTokens)) continue;
      if (log.amount < minCredits || (maxCredits !== Infinity && log.amount > maxCredits)) continue;

      totalAICost += cost;
      const user = log.userId ? userMap[log.userId] : null;
      usageData.push({
        id: log.id,
        date: log.createdAt,
        userName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : 'System',
        userId: log.userId,
        actionType: meta.operationName || log.description || log.source,
        model: meta.model || 'gemini-2.5-pro',
        inputTokens,
        outputTokens,
        credits: log.amount,
        cost: Math.round(cost * 1000000) / 1000000,
      });
    }

    const netProfit = totalRevenue - totalAICost;
    const margin = totalRevenue > 0 ? (netProfit / totalRevenue * 100) : 0;

    return NextResponse.json({
      account: {
        id: account.id,
        name: account.name,
        slug: account.slug,
        creditsBalance: account.aiCreditsBalance,
        creditsUsedTotal: account.aiCreditsUsedTotal,
        planName: sub?.plan?.name || 'No Plan',
        subscriptionStatus: sub?.status || 'NONE',
      },
      profitability: {
        planRevenue: Math.round(monthlyRevenue * 100) / 100,
        addOnRevenue: Math.round(addOnRevenue * 100) / 100,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalAICost: Math.round(totalAICost * 100) / 100,
        netProfit: Math.round(netProfit * 100) / 100,
        margin: Math.round(margin * 10) / 10,
      },
      usageData,
    });
  } catch (error) {
    console.error('[Admin Account Analytics] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
