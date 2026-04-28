import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendEmail } from '@/lib/mailer';
import { cardExpiringReminder } from '@/lib/billing-emails';

const MAX_RUN_BATCH = 200;

function verifyAuth(request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  return authHeader === `Bearer ${cronSecret}`;
}

/**
 * Convert CardCom's TokenExDate (YYYYMMDD string) into a JS Date at the
 * end of the indicated month. Returns null on bad/missing input.
 *
 * CardCom uses the card's expiry date which is month-precision, so we treat
 * "20271001" as "expires at the end of October 2027".
 */
function parseTokenExpDate(tokenExpDate) {
  if (!tokenExpDate || typeof tokenExpDate !== 'string') return null;
  const m = /^(\d{4})(\d{2})/.exec(tokenExpDate);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  if (!year || !month || month < 1 || month > 12) return null;
  // Last instant of the month — credit cards typically remain valid through
  // the printed expiry month.
  return new Date(year, month, 0, 23, 59, 59);
}

/**
 * What stage of expiry-warning should this PaymentMethod be in?
 * Returns a stage to ADVANCE TO if appropriate, or null if no email is due.
 *
 *   stage 1 (T-30): card expires in 21..40 days, never sent before.
 *   stage 2 (T-7) : card expires in 0..14 days, T-7 not yet sent.
 *   stage 3 (EXPIRED): card already expired, EXPIRED notice not yet sent.
 *
 * The 21..40 / 0..14 windows give the cron a few-day grace if it misses a
 * run; we won't double-send because expiryReminderStage advances
 * monotonically and we only enter a stage if we haven't past it.
 */
function decideStage(pm, now) {
  const exp = parseTokenExpDate(pm.tokenExpDate);
  if (!exp) return null;

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysUntil = (exp.getTime() - now.getTime()) / msPerDay;
  const stageSent = pm.expiryReminderStage || 0;

  if (daysUntil < 0 && stageSent < 3) {
    return { stage: 3, code: 'EXPIRED', expiryDate: exp };
  }
  if (daysUntil <= 14 && daysUntil >= -0.01 && stageSent < 2) {
    return { stage: 2, code: 'T7', expiryDate: exp };
  }
  if (daysUntil <= 40 && daysUntil > 14 && stageSent < 1) {
    return { stage: 1, code: 'T30', expiryDate: exp };
  }
  return null;
}

/**
 * POST /api/cron/billing/expiring-cards
 *
 * Daily cron. Walks PaymentMethods, sends expiry-reminder emails to the
 * account owner at three urgency levels:
 *   - T-30 (gentle, ~30 days before expiry)
 *   - T-7  (urgent, ~1 week before)
 *   - EXPIRED (blocking — card has expired and the next renewal will fail)
 *
 * Each PaymentMethod tracks `expiryReminderStage` (0..3) so we don't
 * re-send the same reminder. Stage advances monotonically, so missed cron
 * runs catch up on the next pass without spamming.
 *
 * Auth: Bearer CRON_SECRET.
 */
export async function POST(request) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const candidates = await prisma.paymentMethod.findMany({
    where: {
      // Skip cards that have all three reminders already sent.
      expiryReminderStage: { lt: 3 },
    },
    include: {
      account: { select: { id: true, billingEmail: true, defaultLanguage: true, name: true } },
    },
    take: MAX_RUN_BATCH,
  });

  const results = [];
  for (const pm of candidates) {
    const decision = decideStage(pm, now);
    if (!decision) continue;

    const ownerEmail = pm.account?.billingEmail || pm.ownerEmail || '';
    if (!ownerEmail) {
      // Advance stage anyway so we don't keep retrying broken accounts.
      await prisma.paymentMethod.update({
        where: { id: pm.id },
        data: { expiryReminderStage: decision.stage },
      });
      results.push({ paymentMethodId: pm.id, stage: decision.code, status: 'no_email' });
      continue;
    }

    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '';
      const tpl = cardExpiringReminder({
        paymentMethod: pm,
        expiryDate: decision.expiryDate,
        stage: decision.code,
        updateCardUrl: `${baseUrl}/dashboard/settings?tab=payment-methods`,
        lang: pm.account?.defaultLanguage || 'HE',
      });
      await sendEmail({ to: ownerEmail, ...tpl });
      await prisma.paymentMethod.update({
        where: { id: pm.id },
        data: { expiryReminderStage: decision.stage },
      });
      results.push({ paymentMethodId: pm.id, stage: decision.code, status: 'sent' });
    } catch (e) {
      console.error('[Cron Expiring] email failed:', e);
      results.push({ paymentMethodId: pm.id, stage: decision.code, status: 'error', error: e.message });
    }
  }

  console.log('[Cron Expiring]', { count: results.length, results });
  return NextResponse.json({ success: true, processed: results.length, results });
}

export const GET = POST;
