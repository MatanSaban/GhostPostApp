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
    return NextResponse.json({ error: 'User ID required' }, { status: 400 });
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
      dateFilter.gte = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    const [user, logs] = await Promise.all([
      prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          accountMemberships: {
            where: { status: 'ACTIVE' },
            select: {
              account: {
                select: {
                  id: true,
                  name: true,
                  subscription: {
                    select: {
                      plan: { select: { name: true, price: true, yearlyPrice: true } },
                      billingInterval: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.aiCreditsLog.findMany({
        where: {
          userId: id,
          type: 'DEBIT',
          createdAt: Object.keys(dateFilter).length > 0 ? dateFilter : undefined,
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          accountId: true,
          amount: true,
          source: true,
          description: true,
          metadata: true,
          createdAt: true,
        },
      }),
    ]);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Fetch account names for logs
    const accountIds = [...new Set(logs.map(l => l.accountId).filter(Boolean))];
    const accountsData = accountIds.length > 0
      ? await prisma.account.findMany({
          where: { id: { in: accountIds } },
          select: { id: true, name: true },
        })
      : [];
    const accountMap = {};
    for (const a of accountsData) {
      accountMap[a.id] = a;
    }

    let totalAICost = 0;
    const usageData = [];

    for (const log of logs) {
      const meta = log.metadata || {};
      const inputTokens = meta.inputTokens || 0;
      const outputTokens = meta.outputTokens || 0;
      const model = meta.model || 'pro';
      const cost = calculateTokenCost(inputTokens, outputTokens, model);
      const totalTokensForLog = inputTokens + outputTokens;

      if (cost < minCost || (maxCost !== Infinity && cost > maxCost)) continue;
      if (totalTokensForLog < minTokens || (maxTokens !== Infinity && totalTokensForLog > maxTokens)) continue;
      if (log.amount < minCredits || (maxCredits !== Infinity && log.amount > maxCredits)) continue;

      totalAICost += cost;
      const acc = log.accountId ? accountMap[log.accountId] : null;
      usageData.push({
        id: log.id,
        date: log.createdAt,
        accountName: acc?.name || 'Unknown',
        accountId: log.accountId,
        actionType: meta.operationName || log.description || log.source,
        model: meta.model || 'unknown',
        inputTokens,
        outputTokens,
        credits: log.amount,
        cost: Math.round(cost * 1000000) / 1000000,
      });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
        email: user.email,
        accounts: user.accountMemberships.map(m => ({
          id: m.account.id,
          name: m.account.name,
          planName: m.account.subscription?.plan?.name || 'No Plan',
        })),
      },
      totalAICost: Math.round(totalAICost * 100) / 100,
      usageData,
    });
  } catch (error) {
    console.error('[Admin User Analytics] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
