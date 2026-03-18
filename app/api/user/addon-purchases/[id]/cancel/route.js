import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

/**
 * POST /api/user/addon-purchases/[id]/cancel
 * Cancel a recurring addon purchase. The addon stays active until the next
 * subscription renewal, at which point it won't be renewed.
 */
export async function POST(request, { params }) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id: purchaseId } = await params;

    if (!purchaseId) {
      return NextResponse.json({ error: 'Purchase ID is required' }, { status: 400 });
    }

    // Verify the user owns this purchase through their account
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        lastSelectedAccountId: true,
        accountMemberships: {
          where: { status: 'ACTIVE' },
          select: {
            accountId: true,
            account: {
              select: {
                subscription: {
                  select: { id: true },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const accountMemberships = user.accountMemberships || [];
    const currentMembership = user.lastSelectedAccountId
      ? accountMemberships.find(m => m.accountId === user.lastSelectedAccountId)
      : accountMemberships[0];

    const subscriptionId = currentMembership?.account?.subscription?.id;

    if (!subscriptionId) {
      return NextResponse.json({ error: 'No active subscription' }, { status: 400 });
    }

    // Find the purchase and ensure it belongs to this subscription
    const purchase = await prisma.addOnPurchase.findUnique({
      where: { id: purchaseId },
      include: {
        addOn: { select: { billingType: true, name: true } },
      },
    });

    if (!purchase) {
      return NextResponse.json({ error: 'Purchase not found' }, { status: 404 });
    }

    if (purchase.subscriptionId !== subscriptionId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    if (purchase.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Only active purchases can be canceled' }, { status: 400 });
    }

    if (purchase.canceledAt) {
      return NextResponse.json({ error: 'This purchase is already pending cancellation' }, { status: 400 });
    }

    if (purchase.addOn.billingType !== 'RECURRING') {
      return NextResponse.json({ error: 'Only recurring add-ons can be canceled' }, { status: 400 });
    }

    // Set canceledAt — the addon remains active until the next billing period
    await prisma.addOnPurchase.update({
      where: { id: purchaseId },
      data: { canceledAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      message: 'Add-on will be canceled at the next billing period renewal.',
    });
  } catch (error) {
    console.error('Error canceling addon purchase:', error);
    return NextResponse.json(
      { error: 'Failed to cancel addon purchase' },
      { status: 500 }
    );
  }
}
