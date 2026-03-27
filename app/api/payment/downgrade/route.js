import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
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
 * POST /api/payment/downgrade
 *
 * Handles plan downgrade where there's a surplus (unused credit > new plan cost).
 * No refund is given - the user acknowledged forfeiting the difference.
 *
 * Body:
 *  - planSlug: string (required)
 *  - planId: string (required)
 *  - unusedCredit: number - amount being forfeited (for record-keeping)
 */
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { planSlug, planId, unusedCredit = 0 } = body;

    if (!planSlug || !planId) {
      return NextResponse.json({ error: 'Plan slug and ID are required' }, { status: 400 });
    }

    // Verify plan exists
    const newPlan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!newPlan || !newPlan.isActive) {
      return NextResponse.json({ error: 'Plan not found or inactive' }, { status: 404 });
    }

    // Get user account + current subscription
    const membership = await prisma.accountMember.findFirst({
      where: { userId: user.id, status: 'ACTIVE' },
      include: {
        account: {
          include: {
            subscription: { include: { plan: true } },
          },
        },
      },
    });

    if (!membership?.account) {
      return NextResponse.json({ error: 'No active account' }, { status: 400 });
    }

    const account = membership.account;
    const subscription = account.subscription;

    if (!subscription) {
      return NextResponse.json({ error: 'No active subscription' }, { status: 400 });
    }

    // Verify this is actually a downgrade (new plan costs less)
    const currentPlan = subscription.plan;
    if (currentPlan.id === newPlan.id) {
      return NextResponse.json({ error: 'Already on this plan' }, { status: 400 });
    }
    if (newPlan.price >= currentPlan.price) {
      return NextResponse.json({ error: 'This is not a downgrade' }, { status: 400 });
    }

    const now = new Date();
    const nextFirst = getNextFirstOfMonth(now);

    // Record the $0 downgrade payment for audit trail
    await prisma.payment.create({
      data: {
        accountId: account.id,
        subscriptionId: subscription.id,
        amount: 0,
        currency: newPlan.currency || 'ILS',
        status: 'COMPLETED',
        paymentMethod: 'DOWNGRADE',
        transactionId: `downgrade_${currentPlan.slug}_to_${newPlan.slug}_${Date.now()}`,
        metadata: {
          action: {
            type: 'plan_downgrade',
            fromPlan: currentPlan.slug,
            toPlan: newPlan.slug,
            unusedCreditForfeited: unusedCredit,
            fromPrice: currentPlan.price,
            toPrice: newPlan.price,
          },
          completedAt: now.toISOString(),
        },
      },
    });

    // Apply plan change
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        planId: newPlan.id,
        currentPeriodStart: now,
        currentPeriodEnd: nextFirst,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Plan downgraded successfully',
      actionResult: {
        type: 'plan_downgrade',
        planName: newPlan.name,
        planSlug: newPlan.slug,
        nextBillingDate: nextFirst.toISOString(),
      },
    });
  } catch (error) {
    console.error('Downgrade error:', error);
    return NextResponse.json(
      { error: 'Failed to downgrade plan' },
      { status: 500 }
    );
  }
}
