/**
 * POST /api/account/purchase-addon
 *
 * Server action: purchase an add-on for the account.
 *
 * Handles both:
 *  - RECURRING add-ons (e.g. Extra Seats, Extra Sites) → creates AddOnPurchase
 *  - ONE_TIME add-ons (e.g. AI Credits pack)           → creates AddOnPurchase + credits
 *
 * Body: { addOnId: string, accountId: string }
 */

import { NextResponse } from 'next/server';
import { getCurrentAccountMember } from '@/lib/auth-permissions';
import prisma from '@/lib/prisma';
import { addAiCredits } from '@/lib/account-utils';

export async function POST(request) {
  try {
    const { authorized, member, error: authError } = await getCurrentAccountMember();
    if (!authorized || !member?.accountId) {
      return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
    }

    const { addOnId, accountId } = await request.json();
    const targetAccountId = accountId || member.accountId;

    // Security: ensure user is operating on their own account
    if (targetAccountId !== member.accountId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // ── Permission check ─────────────────────────────────────
    const hasBillingPermission =
      member.isOwner ||
      (member.role?.permissions || []).includes('ACCOUNT_BILLING_MANAGE');

    if (!hasBillingPermission) {
      return NextResponse.json(
        { error: 'You do not have permission to manage billing' },
        { status: 403 }
      );
    }

    // ── Validate add-on exists ────────────────────────────────
    const addOn = await prisma.addOn.findUnique({
      where: { id: addOnId },
    });

    if (!addOn || !addOn.isActive) {
      return NextResponse.json({ error: 'Add-on not found or inactive' }, { status: 404 });
    }

    // ── Get subscription ──────────────────────────────────────
    const subscription = await prisma.subscription.findUnique({
      where: { accountId: targetAccountId },
    });

    if (!subscription || subscription.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'No active subscription found' },
        { status: 400 }
      );
    }

    // ── Process purchase based on billing type ────────────────

    if (addOn.billingType === 'ONE_TIME') {
      // ── One-Time (e.g. AI Credits pack) ─────────────────────
      const purchase = await prisma.addOnPurchase.create({
        data: {
          subscriptionId: subscription.id,
          addOnId: addOn.id,
          quantity: 1,
          status: 'ACTIVE',
          creditsRemaining: addOn.quantity || 0,
          purchasedAt: new Date(),
        },
      });

      // Add credits to account balance immediately
      if (addOn.type === 'AI_CREDITS' && addOn.quantity) {
        await addAiCredits(targetAccountId, addOn.quantity, {
          source: 'addon_purchase',
          sourceId: purchase.id,
          description: `Purchased ${addOn.name} (+${addOn.quantity} credits)`,
        });
      }

      return NextResponse.json({
        success: true,
        message: `Successfully purchased ${addOn.name}`,
        purchase: { id: purchase.id, status: purchase.status },
        creditsAdded: addOn.type === 'AI_CREDITS' ? addOn.quantity : 0,
      });
    } else {
      // ── Recurring (e.g. Extra Seats, Extra Sites) ───────────
      const purchase = await prisma.addOnPurchase.create({
        data: {
          subscriptionId: subscription.id,
          addOnId: addOn.id,
          quantity: 1,
          status: 'ACTIVE',
          purchasedAt: new Date(),
          expiresAt: subscription.currentPeriodEnd, // aligned with sub period
        },
      });

      // TODO: If Stripe is integrated, update the Stripe subscription here
      // e.g. stripe.subscriptionItems.create({ subscription: stripeSub, price: addOn.stripePriceId })

      return NextResponse.json({
        success: true,
        message: `Successfully added ${addOn.name} to your subscription`,
        purchase: { id: purchase.id, status: purchase.status },
      });
    }
  } catch (error) {
    console.error('[API/account/purchase-addon] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
