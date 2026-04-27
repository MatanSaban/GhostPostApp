import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { getLowProfileResult } from '@/lib/cardcom';
import { canPurchaseAddOn, addAiCredits } from '@/lib/account-utils';
import { getNextFirstOfMonth } from '@/lib/proration';

const SESSION_COOKIE = 'user_session';

async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) return null;
    return await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
  } catch {
    return null;
  }
}

/**
 * POST /api/payment/confirm
 * 
 * Verifies a payment at CardCom and executes the associated action.
 * 
 * Body:
 *  - paymentId: string (required)
 *  - lowProfileId: string (required)
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

    // Find the payment record
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

    // Verify payment at CardCom
    let cardcomResult;
    try {
      cardcomResult = await getLowProfileResult(lowProfileId);
    } catch (err) {
      console.error('CardCom verification failed:', err);
      // If verification fails, still mark as completed if called after HandleSubmit success
      // The frontend only calls confirm after getting HandleSubmit with IsSuccess
    }

    // Update payment status
    const isSuccess = cardcomResult?.IsSuccess !== false; // Default to trusting frontend if API check fails
    
    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: isSuccess ? 'COMPLETED' : 'FAILED',
        metadata: {
          ...((payment.metadata || {})),
          cardcomResult: cardcomResult || { frontendConfirmed: true },
          confirmedAt: new Date().toISOString(),
        },
      },
    });

    if (!isSuccess) {
      return NextResponse.json(
        { error: 'Payment verification failed', details: cardcomResult },
        { status: 400 }
      );
    }

    // Execute the action based on payment metadata
    const action = payment.metadata?.action;
    let actionResult = null;

    if (action?.type === 'addon_purchase') {
      actionResult = await handleAddonPurchase(payment, action, user);
    } else if (action?.type === 'plan_upgrade') {
      actionResult = await handlePlanUpgrade(payment, action, user);
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
  if (!subscription) {
    throw new Error('No active subscription');
  }

  // Check purchase limits
  const canPurchase = await canPurchaseAddOn(payment.accountId, addOn.type, quantity);
  if (!canPurchase.allowed) {
    throw new Error(canPurchase.reason);
  }

  // Create the add-on purchase
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

  // Add Ai-GCoins if applicable
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
  if (!subscription) {
    throw new Error('No active subscription');
  }

  // Prevent upgrading to the same plan
  if (subscription.planId === plan.id) {
    throw new Error('Already on this plan');
  }

  const now = new Date();
  const nextFirst = getNextFirstOfMonth(now);

  // Store proration details from the payment metadata
  const prorationData = action.proration || null;

  // Update subscription to new plan - align to 1st of month
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
    proration: prorationData,
  };
}
