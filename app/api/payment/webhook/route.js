import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { addAiCredits } from '@/lib/account-utils';

/**
 * POST /api/payment/webhook
 * 
 * CardCom webhook handler - receives payment result notifications.
 * This is a backup verification mechanism; the primary flow uses /api/payment/confirm.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    
    console.log('CardCom webhook received:', JSON.stringify(body, null, 2));

    const lowProfileId = body.LowProfileId || body.lowProfileId;
    
    if (!lowProfileId) {
      return NextResponse.json({ error: 'Missing LowProfileId' }, { status: 400 });
    }

    // Find the payment by transaction ID
    const payment = await prisma.payment.findFirst({
      where: { transactionId: lowProfileId },
      include: {
        account: { include: { subscription: true } },
      },
    });

    if (!payment) {
      console.warn('Webhook: Payment not found for LowProfileId:', lowProfileId);
      return NextResponse.json({ received: true, warning: 'Payment not found' });
    }

    // Skip if already completed
    if (payment.status === 'COMPLETED') {
      return NextResponse.json({ received: true, message: 'Already completed' });
    }

    const isSuccess = body.IsSuccess === true || body.IsSuccess === 'true';

    // Update payment status
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: isSuccess ? 'COMPLETED' : 'FAILED',
        metadata: {
          ...((payment.metadata || {})),
          webhookData: body,
          webhookReceivedAt: new Date().toISOString(),
        },
      },
    });

    // If successful and not yet processed, execute the action
    if (isSuccess) {
      const action = payment.metadata?.action;
      
      if (action?.type === 'addon_purchase') {
        try {
          const addOn = await prisma.addOn.findUnique({ where: { id: action.addOnId } });
          if (addOn && payment.account?.subscription) {
            const existingPurchase = await prisma.addOnPurchase.findFirst({
              where: {
                subscriptionId: payment.account.subscription.id,
                addOnId: addOn.id,
                createdAt: { gte: new Date(Date.now() - 60000) }, // Within last minute
              },
            });

            if (!existingPurchase) {
              const purchase = await prisma.addOnPurchase.create({
                data: {
                  subscriptionId: payment.account.subscription.id,
                  addOnId: addOn.id,
                  quantity: action.quantity || 1,
                  status: 'ACTIVE',
                  creditsRemaining: addOn.type === 'AI_CREDITS' && addOn.billingType === 'ONE_TIME'
                    ? (addOn.quantity || 0) * (action.quantity || 1)
                    : null,
                },
              });

              if (addOn.type === 'AI_CREDITS') {
                const creditsToAdd = (addOn.quantity || 0) * (action.quantity || 1);
                await addAiCredits(payment.accountId, creditsToAdd, {
                  source: 'addon_purchase_webhook',
                  sourceId: purchase.id,
                  description: `Purchased ${addOn.name} (via webhook)`,
                });
              }
            }
          }
        } catch (err) {
          console.error('Webhook addon purchase error:', err);
        }
      }
    }

    return NextResponse.json({ received: true, status: isSuccess ? 'completed' : 'failed' });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing error' }, { status: 500 });
  }
}

// CardCom may also send GET requests for verification
export async function GET() {
  return NextResponse.json({ status: 'ok' });
}
