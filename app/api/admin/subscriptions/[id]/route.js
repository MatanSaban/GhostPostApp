import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

// Verify super admin access
async function verifySuperAdmin() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isSuperAdmin: true },
    });

    if (!user || !user.isSuperAdmin) {
      return null;
    }

    return user;
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

// GET - Get a single subscription
export async function GET(request, { params }) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const subscription = await prisma.subscription.findUnique({
      where: { id },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            slug: true,
            billingEmail: true,
          },
        },
        plan: {
          select: {
            id: true,
            name: true,
            slug: true,
            price: true,
            interval: true,
            features: true,
          },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            amount: true,
            currency: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    if (!subscription) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    return NextResponse.json({ subscription });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    return NextResponse.json({ error: 'Failed to fetch subscription' }, { status: 500 });
  }
}

// PATCH - Update a subscription (change plan, cancel, reactivate)
export async function PATCH(request, { params }) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { action, planId } = body;

    const subscription = await prisma.subscription.findUnique({
      where: { id },
      include: { plan: true },
    });

    if (!subscription) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    let updateData = {};

    switch (action) {
      case 'cancel':
        // Cancel the subscription immediately and delete the subscription record
        // This resets the account's plan selection
        await prisma.subscription.delete({
          where: { id },
        });
        
        return NextResponse.json({
          success: true,
          message: 'Subscription canceled and removed successfully',
        });

      case 'cancel_immediately':
        // Cancel immediately (legacy - same as cancel now)
        await prisma.subscription.delete({
          where: { id },
        });
        
        return NextResponse.json({
          success: true,
          message: 'Subscription canceled and removed successfully',
        });

      case 'reactivate':
        // Reactivate a canceled subscription
        if (subscription.status !== 'CANCELED' && !subscription.cancelAtPeriodEnd) {
          return NextResponse.json(
            { error: 'Subscription is not canceled' },
            { status: 400 }
          );
        }
        
        // Calculate new billing period from now
        const now = new Date();
        const newPeriodEnd = new Date(now);
        newPeriodEnd.setMonth(newPeriodEnd.getMonth() + (subscription.plan.interval === 'YEARLY' ? 12 : 1));
        
        updateData = {
          status: 'ACTIVE',
          cancelAtPeriodEnd: false,
          canceledAt: null,
          currentPeriodStart: now,
          currentPeriodEnd: newPeriodEnd,
        };
        break;

      case 'change_plan':
        // Change subscription plan
        if (!planId) {
          return NextResponse.json({ error: 'Plan ID required' }, { status: 400 });
        }

        const newPlan = await prisma.plan.findUnique({
          where: { id: planId },
        });

        if (!newPlan) {
          return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
        }

        // Calculate new billing period based on new plan interval
        const changeNow = new Date();
        const changePeriodEnd = new Date(changeNow);
        changePeriodEnd.setMonth(changePeriodEnd.getMonth() + (newPlan.interval === 'YEARLY' ? 12 : 1));

        updateData = {
          planId: planId,
          currentPeriodStart: changeNow,
          currentPeriodEnd: changePeriodEnd,
          // If it was scheduled to cancel, clear that
          cancelAtPeriodEnd: false,
          canceledAt: null,
          status: 'ACTIVE',
        };
        break;

      case 'extend':
        // Extend the subscription period by 1 month/year
        const extendPeriodEnd = new Date(subscription.currentPeriodEnd);
        extendPeriodEnd.setMonth(
          extendPeriodEnd.getMonth() + (subscription.plan.interval === 'YEARLY' ? 12 : 1)
        );
        updateData = {
          currentPeriodEnd: extendPeriodEnd,
        };
        break;

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const updatedSubscription = await prisma.subscription.update({
      where: { id },
      data: updateData,
      include: {
        account: { select: { name: true, slug: true } },
        plan: { select: { name: true, price: true, interval: true } },
      },
    });

    return NextResponse.json({
      success: true,
      subscription: updatedSubscription,
      message: `Subscription ${action.replace('_', ' ')} successful`,
    });
  } catch (error) {
    console.error('Error updating subscription:', error);
    return NextResponse.json({ error: 'Failed to update subscription' }, { status: 500 });
  }
}
