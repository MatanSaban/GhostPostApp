import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import {
  chargeWithToken,
  buildDocument,
  isPaymentMethodEligible,
} from '@/lib/cardcom';
import { canPurchaseAddOn, addAiCredits, getOwnedAccount } from '@/lib/account-utils';
import { getNextFirstOfMonth } from '@/lib/proration';

const SESSION_COOKIE = 'user_session';

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!userId) return null;
  return await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, firstName: true, lastName: true, phoneNumber: true },
  });
}

/**
 * POST /api/payment/charge-saved-card
 *
 * One-click charge using a saved PaymentMethod token. Bypasses the iframe
 * entirely — no card data entry by the user. Used by the dashboard addon
 * popup's "use saved card" path.
 *
 * Body:
 *   - paymentMethodId: string (required)
 *   - amount: number (required, USD pre-converted)
 *   - currency: 'USD'|'ILS'|... (default 'USD')
 *   - productName: string (required)
 *   - language: 'he'|'en' (default 'he')
 *   - action: { type: 'addon_purchase'|'plan_upgrade', ... } (required)
 *
 * Gift cards are blocked at this endpoint regardless of caller intent.
 * Debit cards are allowed (consistent with the addon path's spec).
 */
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      paymentMethodId,
      amount,
      currency = 'USD',
      productName,
      language = 'he',
      action,
    } = body;

    if (!paymentMethodId) {
      return NextResponse.json({ error: 'paymentMethodId is required' }, { status: 400 });
    }
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }
    if (!productName) {
      return NextResponse.json({ error: 'Product name is required' }, { status: 400 });
    }
    if (!action?.type) {
      return NextResponse.json({ error: 'Action type is required' }, { status: 400 });
    }

    const account = await getOwnedAccount(user.id);
    if (!account) {
      return NextResponse.json({ error: 'No active account' }, { status: 400 });
    }

    const paymentMethod = await prisma.paymentMethod.findUnique({ where: { id: paymentMethodId } });
    if (!paymentMethod || paymentMethod.accountId !== account.id) {
      return NextResponse.json({ error: 'Payment method not found' }, { status: 404 });
    }

    // Gift cards always blocked. Debit allowed because this is a one-shot
    // charge — same rule as the dashboard "new card" path.
    if (!isPaymentMethodEligible(paymentMethod, { allowDebit: true })) {
      return NextResponse.json({
        error: 'This card type is not accepted',
        code: 'INELIGIBLE_PAYMENT_METHOD',
      }, { status: 400 });
    }

    // Create the Payment row UP-FRONT so we have a stable id we can use for
    // ExternalUniqTranId — this also gives us idempotency: a duplicate
    // request for the same Payment row won't double-charge.
    const payment = await prisma.payment.create({
      data: {
        accountId: account.id,
        subscriptionId: account.subscription?.id || null,
        amount,
        currency,
        status: 'PENDING',
        paymentMethod: 'CARDCOM',
        transactionId: '',
        metadata: {
          action,
          productName,
          paymentMethodId,
          userId: user.id,
          language,
        },
      },
    });

    const customerName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
    const document = buildDocument({
      customerName: paymentMethod.ownerName || customerName,
      customerEmail: paymentMethod.ownerEmail || user.email,
      customerPhone: paymentMethod.ownerPhone || user.phoneNumber || '',
      language,
      products: [{
        productId: action.itemId || '',
        description: productName,
        quantity: action.quantity || 1,
        unitCost: amount / (action.quantity || 1),
      }],
    });

    const mm = String(paymentMethod.cardMonth ?? '').padStart(2, '0');
    const yy = String(paymentMethod.cardYear ?? '').slice(-2).padStart(2, '0');
    const cardExpirationMMYY = `${mm}${yy}`;

    let chargeResult;
    try {
      chargeResult = await chargeWithToken({
        token: paymentMethod.token,
        cardExpirationMMYY,
        amount,
        currency,
        // Stable across retries of this same Payment row.
        externalUniqTranId: `pmt-${payment.id}`.slice(0, 25),
        cardOwnerInformation: {
          Phone: paymentMethod.ownerPhone || user.phoneNumber || '',
          FullName: paymentMethod.ownerName || customerName,
          IdentityNumber: paymentMethod.ownerTaxId || '000000000',
          CardOwnerEmail: paymentMethod.ownerEmail || user.email,
        },
        document,
      });
    } catch (err) {
      console.error('CardCom DoTransaction failed (saved-card):', err);
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', metadata: { ...payment.metadata, failedAt: new Date().toISOString() } },
      });
      return NextResponse.json({ error: 'Failed to charge the card' }, { status: 502 });
    }

    const chargeOk = chargeResult?.ResponseCode === 0 || chargeResult?.ResponseCode === 608;
    if (!chargeOk) {
      console.warn('Saved-card charge failed:', { chargeResult });
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
      return NextResponse.json({
        error: chargeResult?.Description || 'Card charge failed',
      }, { status: 400 });
    }

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'COMPLETED',
        transactionId: String(chargeResult?.TranzactionId || `tok-${payment.id}`),
        metadata: {
          ...payment.metadata,
          cardcomResult: chargeResult,
          tranzactionId: chargeResult?.TranzactionId || null,
          confirmedAt: new Date().toISOString(),
        },
      },
    });

    // Execute the action.
    const accountWithSub = await prisma.account.findUnique({
      where: { id: account.id },
      include: { subscription: true },
    });
    const paymentForAction = { ...payment, account: accountWithSub, accountId: account.id };

    let actionResult = null;
    if (action.type === 'addon_purchase') {
      actionResult = await handleAddonPurchase(paymentForAction, action);
    } else if (action.type === 'plan_upgrade') {
      actionResult = await handlePlanUpgrade(paymentForAction, action);
    }

    return NextResponse.json({
      success: true,
      message: 'Payment confirmed successfully',
      paymentId: payment.id,
      actionResult,
    });
  } catch (error) {
    console.error('Saved-card charge error:', error);
    return NextResponse.json({ error: 'Failed to charge saved card' }, { status: 500 });
  }
}

async function handleAddonPurchase(payment, action) {
  const { addOnId, quantity = 1 } = action;
  const addOn = await prisma.addOn.findUnique({ where: { id: addOnId } });
  if (!addOn || !addOn.isActive) throw new Error('Add-on not found or inactive');

  const subscription = payment.account?.subscription;
  if (!subscription) throw new Error('No active subscription');

  const canPurchase = await canPurchaseAddOn(payment.accountId, addOn.type, quantity);
  if (!canPurchase.allowed) throw new Error(canPurchase.reason);

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

  return { type: 'addon_purchase', purchaseId: purchase.id, addOnName: addOn.name };
}

async function handlePlanUpgrade(payment, action) {
  const { planSlug } = action;
  const plan = await prisma.plan.findFirst({ where: { slug: planSlug, isActive: true } });
  if (!plan) throw new Error('Plan not found or inactive');

  const subscription = payment.account?.subscription;
  if (!subscription) throw new Error('No active subscription');
  if (subscription.planId === plan.id) throw new Error('Already on this plan');

  const now = new Date();
  const nextFirst = getNextFirstOfMonth(now);

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      planId: plan.id,
      currentPeriodStart: now,
      currentPeriodEnd: nextFirst,
    },
  });

  return {
    type: 'plan_upgrade',
    planName: plan.name,
    planSlug: plan.slug,
    nextBillingDate: nextFirst.toISOString(),
    proration: action.proration || null,
  };
}
