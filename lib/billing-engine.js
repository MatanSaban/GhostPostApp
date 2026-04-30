/**
 * Billing engine — shared logic for the recurring-charge crons.
 *
 * Used by:
 *   - /api/cron/billing/charge-renewals  (first attempt at period end)
 *   - /api/cron/billing/retry-past-due   (retries after a failure)
 *
 * Single entry point: chargeSubscriptionRenewal(sub, now) — does everything
 * needed to attempt one renewal charge for a subscription that's already
 * been loaded with `account.paymentMethods`, `plan`. Caller decides who
 * gets called for which subscriptions and handles the post-final-failure
 * cancellation step (only relevant on the retry cron).
 */

import prisma from '@/lib/prisma';
import {
  chargeWithToken,
  buildDocument,
  isPaymentMethodEligible,
} from '@/lib/cardcom';
import { applyCouponToOrder, priceForRecurringCycle } from '@/lib/coupon-pricing';
import { getNextFirstOfMonth } from '@/lib/proration';
import { sendEmail, notifyAdmins, emailTemplates } from '@/lib/mailer';
import { chargeRenewalSucceeded, chargeRenewalFailed } from '@/lib/billing-emails';

const VAT_RATE = 0.18;
const round2 = (n) => Math.round((n || 0) * 100) / 100;

/**
 * Compute the pre-VAT USD charge amount for the given cycle.
 *  - B2 path: a recurringPriceSchedule on the redemption overrides everything.
 *  - B1 path: discountType/discountValue, only while durationMonths is active.
 *  - Fallback: plan price.
 */
function computeRenewalChargeUsd({ plan, redemption, cycleIndex, now }) {
  const planPriceUsd = round2(plan.price);

  if (redemption?.recurringPriceSchedule
      && Array.isArray(redemption.recurringPriceSchedule)
      && redemption.recurringPriceSchedule.length > 0) {
    const r = priceForRecurringCycle(redemption.recurringPriceSchedule, cycleIndex, planPriceUsd);
    return { preVatUsd: r.amountUsd, source: r.source };
  }

  const couponActive = redemption
    && redemption.status === 'ACTIVE'
    && (!redemption.expiresAt || now <= redemption.expiresAt);
  if (couponActive) {
    const result = applyCouponToOrder(planPriceUsd, {
      discountType: redemption.discountType,
      discountValue: redemption.discountValue,
      floorOrderToZero: !!redemption.floorOrderToZero,
    });
    if (result.applies) {
      return { preVatUsd: result.finalUsd, source: 'coupon' };
    }
  }

  return { preVatUsd: planPriceUsd, source: 'plan' };
}

/**
 * Attempt one renewal charge for a subscription.
 *
 * @param {Object} sub       Prisma Subscription with `plan`, `account`, and `account.paymentMethods` loaded.
 * @param {Date}   now       The reference time for this run.
 * @returns {Object} summary {
 *   subscriptionId, accountId,
 *   status: 'charged' | 'failed' | 'free_cycle' | 'skipped',
 *   reason?: string,           // failure reason / skip reason
 *   amountUsd?: number,
 *   priceSource?: 'schedule'|'frozen-last'|'coupon'|'plan',
 *   tranzactionId?: number,
 *   newRetryCount?: number,
 * }
 */
export async function chargeSubscriptionRenewal(sub, now) {
  const summary = { subscriptionId: sub.id, accountId: sub.accountId };

  const paymentMethods = sub.account?.paymentMethods || [];
  const paymentMethod = paymentMethods.find((pm) => pm.isDefault) || paymentMethods[0];
  if (!paymentMethod) {
    summary.status = 'skipped';
    summary.reason = 'no_payment_method';
    return summary;
  }
  // Recurring charges require a credit card. Debit and gift are ineligible
  // even if they sit in the saved-card list (debit cards can be used for
  // one-shot addons via the new-card path, but recurring charges to a
  // debit-card token are unreliable per Israeli network rules).
  if (!isPaymentMethodEligible(paymentMethod, { allowDebit: false })) {
    summary.status = 'skipped';
    summary.reason = 'ineligible_card_for_recurring';
    return summary;
  }

  const redemption = await prisma.couponRedemption.findFirst({
    where: { subscriptionId: sub.id, status: 'ACTIVE' },
    orderBy: { activatedAt: 'desc' },
  });

  const cycleIndex = (sub.recurringCycleIndex || 0) + 1;
  const { preVatUsd, source } = computeRenewalChargeUsd({
    plan: sub.plan, redemption, cycleIndex, now,
  });
  const totalUsd = round2(preVatUsd * (1 + VAT_RATE));

  summary.amountUsd = totalUsd;
  summary.priceSource = source;

  // No charge needed for this cycle — advance and stop.
  if (totalUsd <= 0) {
    const nextEnd = getNextFirstOfMonth(now);
    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        recurringCycleIndex: cycleIndex,
        currentPeriodStart: now,
        currentPeriodEnd: nextEnd,
        lastRenewalAttemptAt: now,
        renewalRetryCount: 0,
        status: 'ACTIVE',
        renewalFailureMessage: null,
      },
    });
    summary.status = 'free_cycle';
    return summary;
  }

  const account = sub.account;
  const language = account.defaultLanguage || 'HE';
  const langLower = language === 'EN' ? 'en' : 'he';
  const ownerEmail = account.billingEmail || paymentMethod.ownerEmail || '';
  const productName = sub.plan.name;

  const document = buildDocument({
    customerName: paymentMethod.ownerName || account.name,
    customerEmail: paymentMethod.ownerEmail || ownerEmail,
    customerPhone: paymentMethod.ownerPhone || '',
    language: langLower,
    products: [{
      productId: sub.planId,
      description: `${productName} — ${langLower === 'he' ? 'מנוי חודשי' : 'Monthly Subscription'}`,
      quantity: 1,
      unitCost: totalUsd,
    }],
  });

  const mm = String(paymentMethod.cardMonth ?? '').padStart(2, '0');
  const yy = String(paymentMethod.cardYear ?? '').slice(-2).padStart(2, '0');
  const cardExpirationMMYY = `${mm}${yy}`;
  // Stable per (sub, cycle, attempt). attempt = renewalRetryCount + 1 means
  // each retry gets its own ExternalUniqTranId so a retry can actually
  // re-charge after a failure (vs being deduped to the original failure
  // response).
  const attempt = (sub.renewalRetryCount || 0) + 1;
  const externalUniqTranId = `sub-${String(sub.id).slice(-12)}-c${cycleIndex}-a${attempt}`.slice(0, 25);

  const payment = await prisma.payment.create({
    data: {
      accountId: account.id,
      subscriptionId: sub.id,
      amount: totalUsd,
      currency: 'USD',
      status: 'PENDING',
      paymentMethod: 'CARDCOM',
      transactionId: '',
      metadata: {
        kind: 'subscription_renewal',
        cycleIndex,
        attempt,
        priceSource: source,
        preVatUsd,
        vatRate: VAT_RATE,
        productName,
      },
    },
  });

  let chargeResult;
  try {
    chargeResult = await chargeWithToken({
      token: paymentMethod.token,
      cardExpirationMMYY,
      amount: totalUsd,
      currency: 'USD',
      externalUniqTranId,
      cardOwnerInformation: {
        Phone: paymentMethod.ownerPhone || '',
        FullName: paymentMethod.ownerName || account.name,
        IdentityNumber: paymentMethod.ownerTaxId || '000000000',
        CardOwnerEmail: paymentMethod.ownerEmail || ownerEmail,
      },
      document,
    });
  } catch (err) {
    console.error('[BillingEngine] DoTransaction threw:', err);
    chargeResult = { ResponseCode: -1, Description: err.message || 'network error' };
  }

  const chargeOk = chargeResult?.ResponseCode === 0 || chargeResult?.ResponseCode === 608;

  if (chargeOk) {
    const nextEnd = getNextFirstOfMonth(now);

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'COMPLETED',
        transactionId: String(chargeResult?.TranzactionId || `tok-${payment.id}`),
        metadata: {
          ...payment.metadata,
          cardcomResult: chargeResult,
          confirmedAt: new Date().toISOString(),
        },
      },
    });

    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        recurringCycleIndex: cycleIndex,
        currentPeriodStart: now,
        currentPeriodEnd: nextEnd,
        lastRenewalAttemptAt: now,
        renewalRetryCount: 0,
        status: 'ACTIVE',
        renewalFailureMessage: null,
      },
    });

    // Plan-level AI credits refresh (addon credits live in AddOnPurchase).
    try {
      const { getLimitFromPlan } = await import('@/lib/account-utils');
      const planAiCredits = getLimitFromPlan(sub.plan.limitations, 'aiCredits', 0) || 0;
      if (planAiCredits > 0) {
        await prisma.account.update({
          where: { id: account.id },
          data: { aiCreditsBalance: planAiCredits },
        });
        await prisma.aiCreditsLog.create({
          data: {
            accountId: account.id,
            type: 'CREDIT',
            amount: planAiCredits,
            balance: planAiCredits,
            source: 'plan_renewal',
            description: `Renewed plan Ai-GCoins (${sub.plan.name})`,
          },
        });
      }
    } catch (e) {
      console.error('[BillingEngine] AI credits refresh failed:', e);
    }

    try {
      notifyAdmins(emailTemplates.adminNewPayment({
        kind: 'recurring_renewal',
        amount: totalUsd,
        currency: 'USD',
        user: { email: ownerEmail || '—' },
        account: { id: account.id, name: account.name },
        productName,
        planName: sub.plan.name,
        transactionId: chargeResult?.TranzactionId || null,
      }));
    } catch (e) {
      console.error('[BillingEngine] admin notification failed:', e);
    }

    if (ownerEmail) {
      try {
        const tpl = chargeRenewalSucceeded({
          amountUsd: totalUsd,
          productName,
          nextBillingDate: nextEnd,
          paymentMethod,
          invoiceUrl: null,
          lang: language,
        });
        await sendEmail({ to: ownerEmail, ...tpl });
      } catch (e) {
        console.error('[BillingEngine] success email failed:', e);
      }
    }

    summary.status = 'charged';
    summary.tranzactionId = chargeResult?.TranzactionId || null;
    return summary;
  }

  // Failure path — bump retry counter, move to PAST_DUE, email the user.
  const newRetryCount = (sub.renewalRetryCount || 0) + 1;
  const reason = chargeResult?.Description || 'Unknown error';

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: 'FAILED',
      metadata: {
        ...payment.metadata,
        cardcomResult: chargeResult,
        failedAt: new Date().toISOString(),
      },
    },
  });

  await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      lastRenewalAttemptAt: now,
      renewalRetryCount: newRetryCount,
      status: 'PAST_DUE',
      renewalFailureMessage: reason,
    },
  });

  if (ownerEmail) {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '';
      const tpl = chargeRenewalFailed({
        amountUsd: totalUsd,
        productName,
        reason,
        attempt: newRetryCount,
        maxAttempts: 4, // initial + 3 retries
        paymentMethod,
        updateCardUrl: `${baseUrl}/dashboard/settings?tab=payment-methods`,
        lang: language,
      });
      await sendEmail({ to: ownerEmail, ...tpl });
    } catch (e) {
      console.error('[BillingEngine] failure email failed:', e);
    }
  }

  summary.status = 'failed';
  summary.reason = reason;
  summary.newRetryCount = newRetryCount;
  return summary;
}

/**
 * Build the update payload for swapping a Subscription onto a different Plan.
 *
 * Pure function — caller does the prisma.subscription.update so the same
 * shape is shared across the four upgrade paths (CardCom iframe, saved-card
 * charge, free-with-coupon, admin change_plan). Avoids drift on what the
 * "upgrade" transition actually means for sub state.
 *
 * Behaviour:
 *   - Always realigns currentPeriod to start now and run to the next monthly
 *     boundary (matching the existing recurring-billing convention).
 *   - When the sub was TRIALING: sets status=ACTIVE, resets
 *     trialReminderStage. trialStartedAt/trialEndAt are preserved as
 *     historical record — never nulled. Account.hasUsedTrial is unaffected
 *     (caller should leave it true; the trial was consumed).
 *   - When the sub had cancelAtPeriodEnd=true: paying again means the user
 *     is staying, so we clear the cancellation flags.
 *
 * @param {object} subscription - current sub (must include status, cancelAtPeriodEnd)
 * @param {object} newPlan - the target Plan (must include id)
 * @param {Date} [now=new Date()]
 * @returns {object} update data ready to drop into prisma.subscription.update({ data })
 */
export function buildUpgradeUpdateData(subscription, newPlan, now = new Date()) {
  const data = {
    planId: newPlan.id,
    currentPeriodStart: now,
    currentPeriodEnd: getNextFirstOfMonth(now),
  };
  if (subscription.status === 'TRIALING') {
    data.status = 'ACTIVE';
    data.trialReminderStage = 0;
  }
  if (subscription.cancelAtPeriodEnd) {
    data.cancelAtPeriodEnd = false;
    data.canceledAt = null;
  }
  return data;
}

/**
 * Switch a TRIALING subscription onto the designated free fallback plan.
 *
 * Called from two places:
 *   - /api/cron/trial-lifecycle when a trial expires without conversion.
 *   - /api/account/subscription/cancel and the admin cancel route when the
 *     user/admin ends a trial early.
 *
 * Behaviour:
 *   - Looks up the active Plan with isFreeFallback=true. If none exists,
 *     returns { ok: false, reason: 'no_fallback' } so the caller can decide
 *     how to surface the misconfiguration. We do NOT mark the subscription
 *     EXPIRED in that case — it stays TRIALING and is recoverable as soon
 *     as an admin designates a fallback.
 *   - Updates the subscription in place: planId → fallback, status → ACTIVE,
 *     currentPeriod realigned to the next monthly boundary, trialReminderStage
 *     reset. trialStartedAt/trialEndAt are preserved as historical record.
 *
 * Accepts a Prisma client OR a transaction client so callers can run it
 * inside a $transaction when they need atomicity with other writes.
 *
 * @param {object} client - prisma OR a tx client
 * @param {object} subscription - must have id and accountId at minimum
 * @param {Date} [now=new Date()] - injected for tests
 * @returns {Promise<{ok: boolean, reason?: string, subscription?: object}>}
 */
export async function downgradeToFreeFallback(client, subscription, now = new Date()) {
  const fallback = await client.plan.findFirst({
    where: { isFreeFallback: true, isActive: true },
  });
  if (!fallback) {
    return { ok: false, reason: 'no_fallback' };
  }

  const updated = await client.subscription.update({
    where: { id: subscription.id },
    data: {
      planId: fallback.id,
      status: 'ACTIVE',
      currentPeriodStart: now,
      currentPeriodEnd: getNextFirstOfMonth(now),
      trialReminderStage: 0,
      // Keep trialStartedAt/trialEndAt as historical record — do NOT null them.
    },
  });

  return { ok: true, subscription: updated };
}
