import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { canPurchaseAddOn, addAiCredits } from '@/lib/account-utils';

const SESSION_COOKIE = 'user_session';

// Get authenticated user
async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { 
        id: true, 
        email: true,
      },
    });

    return user;
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

/**
 * POST /api/subscription/addons/purchase
 * Purchase an add-on for the current account's subscription
 */
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { addOnId, quantity = 1 } = body;

    if (!addOnId) {
      return NextResponse.json(
        { error: 'Add-on ID is required' },
        { status: 400 }
      );
    }

    // Get user's current account membership
    const membership = await prisma.accountMember.findFirst({
      where: {
        userId: user.id,
        status: 'ACTIVE',
      },
      include: {
        account: {
          include: {
            subscription: true,
          },
        },
        role: true,
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: 'No active account membership' },
        { status: 400 }
      );
    }

    // Check if user has permission to manage subscription
    const hasPermission = membership.isOwner || 
      membership.role.permissions.includes('ACCOUNT_BILLING_MANAGE');

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions to purchase add-ons' },
        { status: 403 }
      );
    }

    const subscription = membership.account.subscription;
    if (!subscription || subscription.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'No active subscription found' },
        { status: 400 }
      );
    }

    // Get the add-on
    const addOn = await prisma.addOn.findUnique({
      where: { id: addOnId },
    });

    if (!addOn || !addOn.isActive) {
      return NextResponse.json(
        { error: 'Add-on not found or not available' },
        { status: 404 }
      );
    }

    // Check if account can purchase this add-on type
    const canPurchase = await canPurchaseAddOn(
      membership.account.id,
      addOn.type,
      quantity
    );

    if (!canPurchase.allowed) {
      return NextResponse.json(
        { error: canPurchase.reason },
        { status: 400 }
      );
    }

    // Create the add-on purchase
    const purchase = await prisma.addOnPurchase.create({
      data: {
        subscriptionId: subscription.id,
        addOnId: addOn.id,
        quantity,
        status: 'ACTIVE',
        // For one-time AI credits, track remaining credits
        creditsRemaining: addOn.type === 'AI_CREDITS' && addOn.billingType === 'ONE_TIME'
          ? (addOn.quantity || 0) * quantity
          : null,
        // For recurring add-ons, set expiration to match subscription
        expiresAt: addOn.billingType === 'RECURRING' 
          ? subscription.currentPeriodEnd 
          : null,
      },
      include: {
        addOn: true,
      },
    });

    // If AI credits add-on, add credits to account balance
    if (addOn.type === 'AI_CREDITS') {
      const creditsToAdd = (addOn.quantity || 0) * quantity;
      await addAiCredits(membership.account.id, creditsToAdd, {
        source: 'addon_purchase',
        sourceId: purchase.id,
        description: `Purchased ${addOn.name} x${quantity}`,
      });
    }

    // TODO: Create payment record and process payment
    // For now, we're just creating the purchase record

    return NextResponse.json({
      success: true,
      purchase,
      message: `Successfully purchased ${addOn.name}${quantity > 1 ? ` x${quantity}` : ''}`,
    });
  } catch (error) {
    console.error('Error purchasing add-on:', error);
    return NextResponse.json(
      { error: 'Failed to purchase add-on' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/subscription/addons/purchase
 * Get current account's active add-on purchases
 */
export async function GET(request) {
  try {
    const user = await verifyAuth();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's current account
    const membership = await prisma.accountMember.findFirst({
      where: {
        userId: user.id,
        status: 'ACTIVE',
      },
      include: {
        account: {
          include: {
            subscription: {
              include: {
                addOnPurchases: {
                  where: { status: 'ACTIVE' },
                  include: {
                    addOn: {
                      include: {
                        translations: true,
                      },
                    },
                  },
                  orderBy: { purchasedAt: 'desc' },
                },
              },
            },
          },
        },
      },
    });

    if (!membership?.account?.subscription) {
      return NextResponse.json({ purchases: [] });
    }

    return NextResponse.json({
      purchases: membership.account.subscription.addOnPurchases,
    });
  } catch (error) {
    console.error('Error fetching add-on purchases:', error);
    return NextResponse.json(
      { error: 'Failed to fetch add-on purchases' },
      { status: 500 }
    );
  }
}
