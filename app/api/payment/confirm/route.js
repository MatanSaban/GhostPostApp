import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import {
  getLowProfileResult,
  chargeWithToken,
  buildDocument,
  getBlockedCardReason,
  externalUniqTranIdFromLpId,
} from '@/lib/cardcom';
import { canPurchaseAddOn, addAiCredits } from '@/lib/account-utils';
import { getNextFirstOfMonth } from '@/lib/proration';
import { buildUpgradeUpdateData } from '@/lib/billing-engine';
import { redeemAddOnCouponBestEffort } from '@/lib/coupon-redemption';
import { notifyAdmins, emailTemplates } from '@/lib/mailer';

const SESSION_COOKIE = 'user_session';

async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) return null;
    return await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, firstName: true, lastName: true, phoneNumber: true },
    });
  } catch {
    return null;
  }
}

/**
 * POST /api/payment/confirm
 *
 * Completes a two-step charge for the dashboard addon / plan-upgrade flows:
 *   1. /payment/init created the LP with Operation: CreateTokenOnly + J2 — at
 *      this point CardCom has validated the card and issued a token, no money
 *      has moved.
 *   2. Here we:
 *      a) Pull the J2 result via GetLpResult (server-to-server).
 *      b) Reject gift cards (debit is allowed for one-shot addons per spec).
 *      c) Run DoTransaction with the token + the localized
 *         TaxInvoiceAndReceipt document. ExternalUniqTranId is derived from
 *         the LP id so a duplicate confirm gets CardCom's idempotent
 *         "original response" instead of a re-charge.
 *      d) Upsert the token into PaymentMethod for future reuse.
 *      e) Execute the action (addon_purchase / plan_upgrade).
 *
 * Body:
 *   - paymentId: string (required)
 *   - lowProfileId: string (required)
 */
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { paymentId, lowProfileId } = body;

    if (!paymentId || !lowProfileId) {
      return NextResponse.json(
        { error: 'Payment ID and LowProfile ID are required' },
        { status: 400 }
      );
    }

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        account: { include: { subscription: true } },
      },
    });

    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    if (payment.status === 'COMPLETED') {
      return NextResponse.json({
        success: true,
        message: 'Payment already completed',
        alreadyCompleted: true,
      });
    }

    if (payment.transactionId !== lowProfileId) {
      return NextResponse.json({ error: 'LowProfile ID mismatch' }, { status: 400 });
    }

    // Step a: pull the J2 result.
    let lpResult;
    try {
      lpResult = await getLowProfileResult(lowProfileId);
    } catch (err) {
      console.error('CardCom GetLpResult failed:', err);
      return NextResponse.json(
        { error: 'Could not verify payment session with CardCom' },
        { status: 502 }
      );
    }

    const tranzInfo = lpResult?.TranzactionInfo;
    const tokenInfo = lpResult?.TokenInfo;

    // J2 success codes: 701 (J2 OK) or 0 (already charged — shouldn't happen
    // on a CreateTokenOnly LP but we accept it for forward-compat).
    const lpOk = lpResult?.ResponseCode === 0;
    const validateOk = tranzInfo?.ResponseCode === 701 || tranzInfo?.ResponseCode === 0;

    if (!lpOk || !validateOk) {
      console.warn('Payment validation failed:', { lpResult });
      await prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: 'FAILED',
          metadata: {
            ...((payment.metadata || {})),
            failureReason: 'J2 validation failed',
            cardcomResult: lpResult,
            failedAt: new Date().toISOString(),
          },
        },
      });
      return NextResponse.json({
        error: tranzInfo?.Description || lpResult?.Description || 'Card validation failed',
      }, { status: 400 });
    }

    // Step b: refuse gift cards. Debit cards are allowed on this dashboard
    // path because the user explicitly chose "Use a different card" — debit
    // is fine for a one-shot addon purchase even though it can't be used for
    // recurring subscription billing.
    const blocked = getBlockedCardReason(tranzInfo, { allowDebit: true });
    if (blocked) {
      await prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: 'FAILED',
          metadata: {
            ...((payment.metadata || {})),
            failureReason: blocked.code,
            failedAt: new Date().toISOString(),
          },
        },
      });
      return NextResponse.json({
        error: 'Gift cards are not accepted. Please use a credit or debit card.',
        code: blocked.code,
      }, { status: 400 });
    }

    if (!tokenInfo?.Token) {
      console.error('CardCom did not return a token:', { lpResult });
      return NextResponse.json(
        { error: 'Card was validated but no token was issued' },
        { status: 502 }
      );
    }

    // Step c: build the localized document and run the actual charge.
    const productName = payment.metadata?.productName || 'Purchase';
    const customerName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
    const language = payment.metadata?.language || 'he';

    const document = buildDocument({
      customerName: tranzInfo.CardOwnerName || customerName,
      customerEmail: tranzInfo.CardOwnerEmail || user.email,
      customerPhone: tranzInfo.CardOwnerPhone || user.phoneNumber || '',
      language,
      products: [{
        productId: payment.metadata?.action?.itemId || '',
        description: productName,
        quantity: payment.metadata?.action?.quantity || 1,
        unitCost: payment.amount / (payment.metadata?.action?.quantity || 1),
      }],
    });

    const mm = String(tokenInfo.CardMonth ?? '').padStart(2, '0');
    const yy = String(tokenInfo.CardYear ?? '').slice(-2).padStart(2, '0');
    const cardExpirationMMYY = `${mm}${yy}`;

    let chargeResult;
    try {
      chargeResult = await chargeWithToken({
        token: tokenInfo.Token,
        cardExpirationMMYY,
        amount: payment.amount,
        currency: payment.currency || 'USD',
        externalUniqTranId: externalUniqTranIdFromLpId(lowProfileId),
        cardOwnerInformation: {
          Phone: tranzInfo.CardOwnerPhone || user.phoneNumber || '',
          FullName: tranzInfo.CardOwnerName || customerName,
          IdentityNumber: tranzInfo.CardOwnerIdentityNumber || '000000000',
          CardOwnerEmail: tranzInfo.CardOwnerEmail || user.email,
        },
        document,
      });
    } catch (err) {
      console.error('CardCom DoTransaction failed:', err);
      await prisma.payment.update({
        where: { id: paymentId },
        data: { status: 'FAILED', metadata: { ...((payment.metadata || {})), failedAt: new Date().toISOString() } },
      });
      return NextResponse.json(
        { error: 'Failed to charge the card' },
        { status: 502 }
      );
    }

    const chargeOk = chargeResult?.ResponseCode === 0 || chargeResult?.ResponseCode === 608;
    if (!chargeOk) {
      console.warn('Charge failed:', { chargeResult });
      await prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: 'FAILED',
          metadata: {
            ...((payment.metadata || {})),
            cardcomResult: chargeResult,
            failedAt: new Date().toISOString(),
          },
        },
      });
      return NextResponse.json({
        error: chargeResult?.Description || 'Card charge failed',
      }, { status: 400 });
    }

    // Step d: persist the token. Upsert by (accountId, token) so duplicate
    // confirms don't break the unique constraint.
    try {
      const last4 = tranzInfo.Last4CardDigitsString
        || (tranzInfo.Last4CardDigits != null ? String(tranzInfo.Last4CardDigits).padStart(4, '0') : null);

      // First card on the account becomes the default automatically.
      const existingCount = await prisma.paymentMethod.count({
        where: { accountId: payment.accountId },
      });

      await prisma.paymentMethod.upsert({
        where: {
          accountId_token: { accountId: payment.accountId, token: tokenInfo.Token },
        },
        update: {
          tokenExpDate: tokenInfo.TokenExDate || '',
          cardYear: tokenInfo.CardYear || 0,
          cardMonth: tokenInfo.CardMonth || 0,
          cardLast4: last4,
          cardBrand: tranzInfo.Brand || null,
          cardInfo: tranzInfo.CardInfo || null,
          paymentType: tranzInfo.PaymentType || null,
          ownerName: tranzInfo.CardOwnerName || null,
          ownerPhone: tranzInfo.CardOwnerPhone || null,
          ownerEmail: tranzInfo.CardOwnerEmail || null,
          ownerTaxId: tranzInfo.CardOwnerIdentityNumber || null,
        },
        create: {
          accountId: payment.accountId,
          provider: 'CARDCOM',
          token: tokenInfo.Token,
          tokenExpDate: tokenInfo.TokenExDate || '',
          cardYear: tokenInfo.CardYear || 0,
          cardMonth: tokenInfo.CardMonth || 0,
          cardLast4: last4,
          cardBrand: tranzInfo.Brand || null,
          cardInfo: tranzInfo.CardInfo || null,
          paymentType: tranzInfo.PaymentType || null,
          ownerName: tranzInfo.CardOwnerName || null,
          ownerPhone: tranzInfo.CardOwnerPhone || null,
          ownerEmail: tranzInfo.CardOwnerEmail || null,
          ownerTaxId: tranzInfo.CardOwnerIdentityNumber || null,
          isDefault: existingCount === 0,
        },
      });
    } catch (err) {
      // Charge already succeeded — token-persist failure is a soft error.
      console.error('PaymentMethod persist failed (charge already succeeded):', err);
    }

    // Update payment status to COMPLETED.
    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'COMPLETED',
        metadata: {
          ...((payment.metadata || {})),
          cardcomResult: chargeResult,
          tranzactionId: chargeResult?.TranzactionId || null,
          confirmedAt: new Date().toISOString(),
        },
      },
    });

    // Step e: execute the action.
    const action = payment.metadata?.action;
    let actionResult = null;

    if (action?.type === 'addon_purchase') {
      actionResult = await handleAddonPurchase(payment, action, user);
    } else if (action?.type === 'plan_upgrade') {
      actionResult = await handlePlanUpgrade(payment, action, user);
    }

    try {
      notifyAdmins(emailTemplates.adminNewPayment({
        kind: action?.type || 'addon_purchase',
        amount: payment.amount,
        currency: payment.currency || 'USD',
        user,
        account: { id: payment.accountId, name: payment.account?.name },
        productName: payment.metadata?.productName,
        planName: actionResult?.type === 'plan_upgrade' ? actionResult.planName : null,
        transactionId: chargeResult?.TranzactionId || null,
        couponCode: action?.coupon?.code || null,
      }));
    } catch (e) {
      console.error('[Payment Confirm] admin notification failed:', e);
    }

    return NextResponse.json({
      success: true,
      message: 'Payment confirmed successfully',
      actionResult,
    });
  } catch (error) {
    console.error('Payment confirm error:', error);
    return NextResponse.json(
      { error: 'Failed to confirm payment' },
      { status: 500 }
    );
  }
}

/**
 * Handle add-on purchase after successful payment
 */
async function handleAddonPurchase(payment, action, user) {
  const { addOnId, quantity = 1 } = action;

  const addOn = await prisma.addOn.findUnique({ where: { id: addOnId } });
  if (!addOn || !addOn.isActive) {
    throw new Error('Add-on not found or inactive');
  }

  const subscription = payment.account?.subscription;
  if (!subscription || subscription.status === 'CANCELED' || subscription.status === 'EXPIRED') {
    throw new Error('No active subscription');
  }

  const canPurchase = await canPurchaseAddOn(payment.accountId, addOn.type, quantity);
  if (!canPurchase.allowed) {
    throw new Error(canPurchase.reason);
  }

  const purchase = await prisma.addOnPurchase.create({
    data: {
      subscriptionId: subscription.id,
      addOnId: addOn.id,
      quantity,
      status: 'ACTIVE',
      creditsRemaining: addOn.type === 'AI_CREDITS' && addOn.billingType === 'ONE_TIME'
        ? (addOn.quantity || 0) * quantity
        : null,
      expiresAt: addOn.billingType === 'RECURRING'
        ? subscription.currentPeriodEnd
        : null,
    },
    include: { addOn: true },
  });

  if (addOn.type === 'AI_CREDITS') {
    const creditsToAdd = (addOn.quantity || 0) * quantity;
    await addAiCredits(payment.accountId, creditsToAdd, {
      source: 'addon_purchase',
      sourceId: purchase.id,
      description: `Purchased ${addOn.name} x${quantity}`,
    });
  }

  // Coupon redemption is best-effort: charge already succeeded, so a failed
  // re-validation must NOT block delivery of the add-on. Failures get logged
  // by the helper and rolled into the action result for audit.
  const couponResult = await redeemAddOnCouponBestEffort(prisma, {
    couponCode: action?.coupon?.code,
    addOn: { id: addOn.id, type: addOn.type },
    addOnPurchase: purchase,
    accountId: payment.accountId,
    subscriptionId: subscription.id,
  });

  return {
    type: 'addon_purchase',
    purchaseId: purchase.id,
    addOnName: addOn.name,
    couponApplied: couponResult.coupon ? { code: couponResult.coupon.code } : null,
    couponError: couponResult.error || undefined,
  };
}

/**
 * Handle plan upgrade after successful payment
 */
async function handlePlanUpgrade(payment, action, user) {
  const { planSlug } = action;

  const plan = await prisma.plan.findFirst({ where: { slug: planSlug, isActive: true } });
  if (!plan) {
    throw new Error('Plan not found or inactive');
  }

  const subscription = payment.account?.subscription;
  if (!subscription || subscription.status === 'CANCELED' || subscription.status === 'EXPIRED') {
    throw new Error('No active subscription');
  }

  if (subscription.planId === plan.id) {
    throw new Error('Already on this plan');
  }

  const now = new Date();
  const prorationData = action.proration || null;

  // buildUpgradeUpdateData handles TRIALING → ACTIVE transition (the user
  // upgraded mid-trial, paid, so the trial is consumed and they're now a
  // regular paying customer on the new plan) and clears cancelAtPeriodEnd
  // if it was set.
  const updateData = buildUpgradeUpdateData(subscription, plan, now);

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: updateData,
  });

  return {
    type: 'plan_upgrade',
    planName: plan.name,
    planSlug: plan.slug,
    nextBillingDate: updateData.currentPeriodEnd.toISOString(),
    proration: prorationData,
  };
}
