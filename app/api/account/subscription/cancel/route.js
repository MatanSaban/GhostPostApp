/**
 * POST /api/account/subscription/cancel
 *
 * User-facing subscription cancellation. Behaviour depends on current status:
 *
 *   - TRIALING       → switch to the designated free fallback plan immediately
 *                      via downgradeToFreeFallback (status becomes ACTIVE on
 *                      the Free plan; access is preserved, just at lower
 *                      limits). The user is on the trial-lifecycle cron's
 *                      downgrade path right now anyway — this just lets them
 *                      opt in early.
 *   - ACTIVE / PAST_DUE → set cancelAtPeriodEnd=true + canceledAt=now. User
 *                         keeps access until currentPeriodEnd; recurring
 *                         billing crons skip subs with cancelAtPeriodEnd set
 *                         once their period rolls over.
 *   - CANCELED / EXPIRED → 409, already canceled.
 *
 * Permission gate: account owner or any member with ACCOUNT_BILLING_MANAGE.
 * Body (optional): { accountId } — defaults to the caller's current account;
 * superAdmins may pass any account.
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember } from '@/lib/auth-permissions';
import { downgradeToFreeFallback } from '@/lib/billing-engine';

export async function POST(request) {
  try {
    const { authorized, member, error: authError, isSuperAdmin } = await getCurrentAccountMember();
    if (!authorized) {
      return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
    }

    let body = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is fine — we'll fall back to the caller's account.
    }
    const targetAccountId = body.accountId || member.accountId;

    if (!targetAccountId) {
      return NextResponse.json({ error: 'Account ID is required' }, { status: 400 });
    }

    if (!isSuperAdmin && targetAccountId !== member.accountId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!isSuperAdmin) {
      const hasBillingPermission =
        member.isOwner ||
        (member.role?.permissions || []).includes('ACCOUNT_BILLING_MANAGE');
      if (!hasBillingPermission) {
        return NextResponse.json(
          { error: 'You do not have permission to manage billing' },
          { status: 403 }
        );
      }
    }

    const subscription = await prisma.subscription.findUnique({
      where: { accountId: targetAccountId },
      include: { plan: { select: { id: true, name: true, slug: true } } },
    });

    if (!subscription) {
      return NextResponse.json({ error: 'No subscription found' }, { status: 404 });
    }

    if (subscription.status === 'CANCELED' || subscription.status === 'EXPIRED') {
      return NextResponse.json(
        { error: 'Subscription is already canceled' },
        { status: 409 }
      );
    }

    const now = new Date();

    // --- TRIALING: end now, switch to free fallback ----------------------
    if (subscription.status === 'TRIALING') {
      const result = await downgradeToFreeFallback(prisma, subscription, now);
      if (!result.ok) {
        // No fallback plan configured. Surface the misconfig to the caller
        // rather than silently failing — the user's trial is unchanged.
        return NextResponse.json(
          { error: 'Cannot cancel trial — no free plan configured. Contact support.' },
          { status: 503 }
        );
      }
      return NextResponse.json({
        success: true,
        outcome: 'switched_to_free',
        subscription: {
          id: result.subscription.id,
          status: result.subscription.status,
          planId: result.subscription.planId,
          currentPeriodEnd: result.subscription.currentPeriodEnd.toISOString(),
        },
      });
    }

    // --- ACTIVE / PAST_DUE: cancel at period end -------------------------
    const updated = await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        cancelAtPeriodEnd: true,
        canceledAt: now,
      },
      select: {
        id: true,
        status: true,
        cancelAtPeriodEnd: true,
        canceledAt: true,
        currentPeriodEnd: true,
      },
    });

    return NextResponse.json({
      success: true,
      outcome: 'canceled_at_period_end',
      subscription: {
        id: updated.id,
        status: updated.status,
        cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
        canceledAt: updated.canceledAt?.toISOString() || null,
        currentPeriodEnd: updated.currentPeriodEnd.toISOString(),
      },
    });
  } catch (error) {
    console.error('Subscription cancel error:', error);
    return NextResponse.json(
      { error: 'Failed to cancel subscription' },
      { status: 500 }
    );
  }
}
