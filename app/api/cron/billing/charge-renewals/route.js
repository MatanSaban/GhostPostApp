import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { chargeSubscriptionRenewal } from '@/lib/billing-engine';

const MAX_RUN_BATCH = 25; // per-invocation cap to stay inside Vercel's 60s timeout

function verifyAuth(request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  return authHeader === `Bearer ${cronSecret}`;
}

/**
 * POST /api/cron/billing/charge-renewals
 *
 * Daily cron. Picks active subscriptions whose currentPeriodEnd has passed
 * and charges them via the saved-token flow. Failures move the sub to
 * PAST_DUE — E2 (/retry-past-due) handles the retry schedule.
 *
 * Auth: Bearer CRON_SECRET (matches the existing cron pattern).
 */
export async function POST(request) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const dueSubs = await prisma.subscription.findMany({
    where: {
      status: 'ACTIVE',
      currentPeriodEnd: { lte: now },
    },
    include: {
      plan: true,
      account: { include: { paymentMethods: true } },
    },
    take: MAX_RUN_BATCH,
  });

  const results = [];
  for (const sub of dueSubs) {
    try {
      const r = await chargeSubscriptionRenewal(sub, now);
      results.push(r);
    } catch (err) {
      console.error('[Cron Renewals] chargeSubscriptionRenewal threw:', err);
      results.push({ subscriptionId: sub.id, status: 'error', error: err.message });
    }
  }

  console.log('[Cron Renewals]', { count: results.length, results });
  return NextResponse.json({ success: true, processed: results.length, results });
}

export const GET = POST;
