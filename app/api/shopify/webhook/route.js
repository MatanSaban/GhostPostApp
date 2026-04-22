import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyWebhookHmac } from '@/lib/cms/adapters/shopify/oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/shopify/webhook
 *
 * Receives all topics registered in `registerWebhooks()`. Shopify sends:
 *   X-Shopify-Topic              e.g. "products/update"
 *   X-Shopify-Shop-Domain        e.g. "foo.myshopify.com"
 *   X-Shopify-Hmac-Sha256        base64 HMAC of raw body
 *   X-Shopify-Webhook-Id         dedup id
 *   X-Shopify-Triggered-At       ISO timestamp
 *
 * Validation is strict — anything failing HMAC returns 401 silently. Shopify
 * retries 5xx but stops on 4xx, which is what we want for forged requests.
 *
 * Behavior per topic:
 *   products/update, products/create, products/delete       — touch site.lastEntityChangeAt
 *   collections/*                                           — same
 *   shop/update                                             — refresh shopify* fields cache
 *   app/uninstalled                                         — wipe access token, mark DISCONNECTED
 *
 * We deliberately do NOT trigger heavy re-syncs on every webhook — the
 * platform's entity sync is on-demand. Webhooks just stamp recency so the
 * UI knows when stored data is stale.
 */
export async function POST(request) {
  // 1. Read raw body — required for HMAC verification.
  const rawBody = await request.text();
  const hmac = request.headers.get('x-shopify-hmac-sha256');
  const topic = request.headers.get('x-shopify-topic');
  const shopDomain = request.headers.get('x-shopify-shop-domain');
  const webhookId = request.headers.get('x-shopify-webhook-id');

  if (!hmac || !topic || !shopDomain) {
    return NextResponse.json({ error: 'Missing required headers' }, { status: 400 });
  }

  try {
    verifyWebhookHmac(rawBody, hmac);
  } catch (err) {
    console.warn('[shopify/webhook] HMAC failed:', err.message, { topic, shopDomain });
    return NextResponse.json({ error: 'Invalid HMAC' }, { status: 401 });
  }

  // 2. Look up the site by shopify domain.
  const site = await prisma.site.findFirst({
    where: { shopifyDomain: shopDomain },
    select: { id: true, accountId: true },
  });
  if (!site) {
    // Webhook for a shop we don't track — return 200 so Shopify stops retrying.
    return NextResponse.json({ ok: true, ignored: true });
  }

  // 3. Dispatch by topic.
  try {
    if (topic.startsWith('products/') || topic.startsWith('collections/')) {
      // Touch lastPingAt so the freshness UI knows the connection is live;
      // we deliberately don't trigger a re-sync here — entity sync is on
      // demand from the platform side.
      await prisma.site.update({
        where: { id: site.id },
        data: { lastPingAt: new Date() },
      });
    } else if (topic === 'shop/update') {
      // Stash the new shop snapshot — body is JSON.
      try {
        const body = JSON.parse(rawBody);
        await prisma.site.update({
          where: { id: site.id },
          data: {
            shopifyPrimaryLocale: body.primary_locale ?? undefined,
            shopifyCurrency: body.currency ?? undefined,
            shopifyPlanName: body.plan_display_name ?? undefined,
          },
        });
      } catch (e) {
        console.warn('[shopify/webhook] shop/update parse failed:', e.message);
      }
    } else if (topic === 'app/uninstalled') {
      await prisma.site.update({
        where: { id: site.id },
        data: {
          shopifyAccessToken: null,
          shopifyScopes: [],
          shopifyWebhookIds: null,
          connectionStatus: 'DISCONNECTED',
        },
      });
    }
  } catch (err) {
    // Log but still return 2xx — we don't want Shopify retrying because
    // of our internal failure on a verified webhook.
    console.error('[shopify/webhook] handler error:', err.message, { topic });
  }

  return NextResponse.json({ ok: true, topic, webhookId });
}
