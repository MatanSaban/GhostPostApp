import prisma from '@/lib/prisma';
import { addAiCredits } from '@/lib/account-utils';

// CardCom expects HTTP 200 with body "OK" (or "-1") on its webhook callback.
// Any other status — including the JSON 400/500 we used to return on errors —
// triggers a 7-attempt retry storm: 1m, 2m, 2m, 16m, 60m, 12h, 12h.
// We always ack with `OK` and surface real errors via server logs instead.
const ackOk = () => new Response('OK', {
  status: 200,
  headers: { 'Content-Type': 'text/plain; charset=utf-8' },
});

/**
 * POST /api/payment/webhook
 *
 * CardCom webhook handler — receives payment result notifications.
 * Backup verification path; the primary flow is /api/payment/confirm.
 */
export async function POST(request) {
  try {
    const body = await request.json();

    console.log('CardCom webhook received:', JSON.stringify(body, null, 2));

    const lowProfileId = body.LowProfileId || body.lowProfileId;

    if (!lowProfileId) {
      console.warn('Webhook: missing LowProfileId, payload:', body);
      return ackOk();
    }

    const payment = await prisma.payment.findFirst({
      where: { transactionId: lowProfileId },
      include: {
        account: { include: { subscription: true } },
      },
    });

    if (!payment) {
      console.warn('Webhook: Payment not found for LowProfileId:', lowProfileId);
      return ackOk();
    }

    if (payment.status === 'COMPLETED') {
      return ackOk();
    }

    const isSuccess = body.IsSuccess === true || body.IsSuccess === 'true';

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
                createdAt: { gte: new Date(Date.now() - 60000) },
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

    return ackOk();
  } catch (error) {
    console.error('Webhook error:', error);
    return ackOk();
  }
}

// CardCom probes the URL with GET on setup; ack the same way.
export async function GET() {
  return ackOk();
}
