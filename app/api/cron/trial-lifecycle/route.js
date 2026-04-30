import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendEmail, emailTemplates } from '@/lib/mailer';
import { downgradeToFreeFallback } from '@/lib/billing-engine';

const MAX_RUN_BATCH = 200;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function verifyAuth(request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  return authHeader === `Bearer ${cronSecret}`;
}

/**
 * POST /api/cron/trial-lifecycle
 *
 * Runs once a day. Three buckets, processed in order:
 *
 *   1. T-2 reminder (subtle): TRIALING + trialEndAt within 2 days +
 *      trialReminderStage < 1 → send `trialEnding2Days`, advance stage to 1.
 *
 *   2. T-1 reminder (urgent): TRIALING + trialEndAt within 1 day +
 *      trialReminderStage < 2 → send `trialEnding1Day`, advance stage to 2.
 *
 *   3. Expiry / downgrade: TRIALING + trialEndAt <= now → switch the
 *      subscription to whichever Plan is flagged isFreeFallback (status
 *      ACTIVE, currentPeriod realigned to the next monthly boundary). If
 *      no fallback is configured, log a warning and leave the subscription
 *      untouched — the admin must designate one before the cron can drain
 *      the queue. We deliberately do NOT mark such subscriptions EXPIRED
 *      so a brief misconfiguration is recoverable.
 *
 * State tracking: `Subscription.trialReminderStage` advances monotonically
 * within the trial window, so re-running the cron in the same day cannot
 * double-send. The stage resets to 0 on downgrade.
 */
export async function POST(request) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const t2 = new Date(now.getTime() + 2 * MS_PER_DAY);
  const t1 = new Date(now.getTime() + 1 * MS_PER_DAY);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '';
  const addPaymentUrl = `${baseUrl}/dashboard/settings?tab=payment-methods`;
  const dashboardUrl = `${baseUrl}/dashboard`;

  const results = { remindersT2: 0, remindersT1: 0, downgraded: 0, missingFallback: 0, errors: [] };

  // Resolve a recipient (user) for an account. Prefer the owner's User row
  // (selectedLanguage + email + name); fall back to the account's billing
  // email and defaultLanguage when the owner can't be resolved.
  async function resolveRecipient(accountId, accountFallback) {
    const owner = await prisma.accountMember.findFirst({
      where: { accountId, isOwner: true, status: 'ACTIVE' },
      include: { user: { select: { id: true, email: true, firstName: true, selectedLanguage: true } } },
    });
    const ownerUser = owner?.user;
    return {
      to: ownerUser?.email || accountFallback?.billingEmail || null,
      userName: ownerUser?.firstName || ownerUser?.email || accountFallback?.name || '',
      lang: ownerUser?.selectedLanguage || accountFallback?.defaultLanguage || 'EN',
    };
  }

  // ---- (1) T-2 reminders ------------------------------------------------
  const stage1Candidates = await prisma.subscription.findMany({
    where: {
      status: 'TRIALING',
      trialEndAt: { gt: now, lte: t2 },
      trialReminderStage: { lt: 1 },
    },
    include: {
      account: { select: { id: true, billingEmail: true, defaultLanguage: true, name: true } },
      plan: { select: { name: true } },
    },
    take: MAX_RUN_BATCH,
  });

  for (const sub of stage1Candidates) {
    try {
      const r = await resolveRecipient(sub.accountId, sub.account);
      if (!r.to) {
        await prisma.subscription.update({ where: { id: sub.id }, data: { trialReminderStage: 1 } });
        continue;
      }
      const tpl = emailTemplates.trialEnding2Days({
        userName: r.userName,
        planName: sub.plan.name,
        trialEndAt: sub.trialEndAt,
        addPaymentUrl,
        dashboardUrl,
        lang: r.lang,
      });
      await sendEmail({ to: r.to, ...tpl });
      await prisma.subscription.update({ where: { id: sub.id }, data: { trialReminderStage: 1 } });
      results.remindersT2++;
    } catch (e) {
      console.error('[Trial Cron] T-2 email failed:', sub.id, e);
      results.errors.push({ subscriptionId: sub.id, stage: 'T-2', error: e.message });
    }
  }

  // ---- (2) T-1 reminders ------------------------------------------------
  const stage2Candidates = await prisma.subscription.findMany({
    where: {
      status: 'TRIALING',
      trialEndAt: { gt: now, lte: t1 },
      trialReminderStage: { lt: 2 },
    },
    include: {
      account: { select: { id: true, billingEmail: true, defaultLanguage: true, name: true } },
      plan: { select: { name: true } },
    },
    take: MAX_RUN_BATCH,
  });

  for (const sub of stage2Candidates) {
    try {
      const r = await resolveRecipient(sub.accountId, sub.account);
      if (!r.to) {
        await prisma.subscription.update({ where: { id: sub.id }, data: { trialReminderStage: 2 } });
        continue;
      }
      const tpl = emailTemplates.trialEnding1Day({
        userName: r.userName,
        planName: sub.plan.name,
        trialEndAt: sub.trialEndAt,
        addPaymentUrl,
        dashboardUrl,
        lang: r.lang,
      });
      await sendEmail({ to: r.to, ...tpl });
      await prisma.subscription.update({ where: { id: sub.id }, data: { trialReminderStage: 2 } });
      results.remindersT1++;
    } catch (e) {
      console.error('[Trial Cron] T-1 email failed:', sub.id, e);
      results.errors.push({ subscriptionId: sub.id, stage: 'T-1', error: e.message });
    }
  }

  // ---- (3) Expired trials → downgrade to free fallback ------------------
  // Once a sub leaves TRIALING (cancel, upgrade, or this downgrade) the cron
  // stops touching it — all three buckets above filter on status='TRIALING'.
  const expired = await prisma.subscription.findMany({
    where: {
      status: 'TRIALING',
      trialEndAt: { lte: now },
    },
    select: { id: true, accountId: true },
    take: MAX_RUN_BATCH,
  });

  for (const sub of expired) {
    try {
      const res = await downgradeToFreeFallback(prisma, sub, now);
      if (!res.ok && res.reason === 'no_fallback') {
        // Don't mark anything EXPIRED here — admins must designate a
        // fallback plan before the cron can downgrade. Until then these
        // subscriptions remain TRIALING (with a stale trialEndAt), which
        // is visible and recoverable.
        results.missingFallback++;
        continue;
      }
      results.downgraded++;
    } catch (e) {
      console.error('[Trial Cron] downgrade failed:', sub.id, e);
      results.errors.push({ subscriptionId: sub.id, stage: 'downgrade', error: e.message });
    }
  }
  if (results.missingFallback > 0) {
    console.error(
      `[Trial Cron] No isFreeFallback plan configured — ${results.missingFallback} expired trials could not be downgraded.`,
    );
  }

  console.log('[Trial Cron]', results);
  return NextResponse.json({ success: true, ...results });
}

export const GET = POST;
