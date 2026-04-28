import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { chargeSubscriptionRenewal } from '@/lib/billing-engine';
import { sendEmail } from '@/lib/mailer';
import { chargeRenewalFinalFailed } from '@/lib/billing-emails';

const MAX_RUN_BATCH = 25;
// Retry cadence (per spec): day+1 after initial failure, then +3 days,
// then +5 days. Indexed by current renewalRetryCount BEFORE we attempt:
//   1 → next attempt 1 day after lastRenewalAttemptAt    (becomes attempt #2)
//   2 → next attempt 3 days after last (becomes #3)
//   3 → next attempt 5 days after last (becomes #4 = final)
const RETRY_HOURS = { 1: 24, 2: 72, 3: 120 };
const MAX_ATTEMPTS = 4; // initial + 3 retries

function verifyAuth(request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  return authHeader === `Bearer ${cronSecret}`;
}

function isReadyForRetry(sub, now) {
  const last = sub.lastRenewalAttemptAt;
  if (!last) return true; // shouldn't happen for PAST_DUE but be permissive
  const hoursSince = (now.getTime() - new Date(last).getTime()) / (1000 * 60 * 60);
  const required = RETRY_HOURS[sub.renewalRetryCount] ?? 24;
  return hoursSince >= required;
}

async function cancelSubscriptionAfterFinalFailure(sub) {
  await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      status: 'CANCELED',
      canceledAt: new Date(),
    },
  });

  const account = sub.account;
  const ownerEmail = account?.billingEmail || sub.paymentMethod?.ownerEmail || '';
  const language = account?.defaultLanguage || 'HE';
  const paymentMethod = account?.paymentMethods?.find((pm) => pm.isDefault) || account?.paymentMethods?.[0] || null;

  if (ownerEmail) {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '';
      const tpl = chargeRenewalFinalFailed({
        productName: sub.plan?.name || 'subscription',
        reason: sub.renewalFailureMessage,
        paymentMethod,
        reactivateUrl: `${baseUrl}/dashboard/settings?tab=subscription`,
        lang: language,
      });
      await sendEmail({ to: ownerEmail, ...tpl });
    } catch (e) {
      console.error('[Cron Retry] cancellation email failed:', e);
    }
  }
}

/**
 * POST /api/cron/billing/retry-past-due
 *
 * Daily cron. Picks subscriptions that are PAST_DUE because a previous
 * renewal attempt failed and:
 *   - retryCount is still under MAX_ATTEMPTS, AND
 *   - enough time has passed since the last attempt (per RETRY_HOURS).
 * Re-runs the renewal charge via the same chargeSubscriptionRenewal helper.
 *
 * If the new attempt's retryCount hits MAX_ATTEMPTS and still fails, the
 * subscription is canceled and the user is emailed a "subscription canceled"
 * notice. Otherwise it stays PAST_DUE for the next retry cycle.
 *
 * Auth: Bearer CRON_SECRET.
 */
export async function POST(request) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();

  // Subscriptions still in retry window. We pull those that are eligible
  // (count < MAX_ATTEMPTS) and decide per-row whether the time gate passed.
  const candidates = await prisma.subscription.findMany({
    where: {
      status: 'PAST_DUE',
      renewalRetryCount: { lt: MAX_ATTEMPTS },
    },
    include: {
      plan: true,
      account: { include: { paymentMethods: true } },
    },
    take: MAX_RUN_BATCH,
  });

  const results = [];
  for (const sub of candidates) {
    if (!isReadyForRetry(sub, now)) {
      results.push({ subscriptionId: sub.id, status: 'wait', retryCount: sub.renewalRetryCount });
      continue;
    }

    let result;
    try {
      result = await chargeSubscriptionRenewal(sub, now);
    } catch (err) {
      console.error('[Cron Retry] chargeSubscriptionRenewal threw:', err);
      results.push({ subscriptionId: sub.id, status: 'error', error: err.message });
      continue;
    }

    // If this attempt also failed and we've now hit the max attempts, cancel.
    if (result.status === 'failed' && (result.newRetryCount || 0) >= MAX_ATTEMPTS) {
      try {
        // Re-fetch the sub in its final post-failure state so the
        // cancellation email has the correct reason text.
        const finalSub = await prisma.subscription.findUnique({
          where: { id: sub.id },
          include: {
            plan: true,
            account: { include: { paymentMethods: true } },
          },
        });
        await cancelSubscriptionAfterFinalFailure(finalSub);
        result.status = 'canceled';
      } catch (e) {
        console.error('[Cron Retry] cancellation flow failed:', e);
      }
    }

    results.push(result);
  }

  // Also handle subs that are stuck — already at max retries but haven't
  // been canceled yet (e.g. the cron crashed in the middle of cancellation).
  // Their status would still be PAST_DUE but renewalRetryCount === MAX.
  const stuck = await prisma.subscription.findMany({
    where: {
      status: 'PAST_DUE',
      renewalRetryCount: { gte: MAX_ATTEMPTS },
    },
    include: {
      plan: true,
      account: { include: { paymentMethods: true } },
    },
    take: 10,
  });
  for (const sub of stuck) {
    try {
      await cancelSubscriptionAfterFinalFailure(sub);
      results.push({ subscriptionId: sub.id, status: 'canceled_stuck' });
    } catch (e) {
      console.error('[Cron Retry] stuck-cancel failed:', e);
    }
  }

  console.log('[Cron Retry]', { count: results.length, results });
  return NextResponse.json({ success: true, processed: results.length, results });
}

export const GET = POST;
