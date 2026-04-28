import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { encryptCredential } from '@/lib/site-keys';
import {
  exchangeCodeForToken,
  isValidShopDomain,
  registerWebhooks,
  verifyCallbackHmac,
  verifyState,
} from '@/lib/cms/adapters/shopify/oauth';

function redirectToDashboard(siteId, status) {
  const host =
    process.env.SHOPIFY_APP_HOST ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    'https://app.ghostpost.co.il';
  const path = siteId
    ? `/dashboard/my-websites?connected=shopify&siteId=${siteId}&status=${status}`
    : `/dashboard/my-websites?status=${status}`;
  return NextResponse.redirect(`${host.replace(/\/$/, '')}${path}`, {
    status: 302,
  });
}

/**
 * GET /api/shopify/callback
 *
 * OAuth return endpoint. Shopify redirects the merchant here with ?code,
 * ?shop, ?hmac, ?state after they approve the consent screen.
 *
 *   1. Verify Shopify's HMAC on the query string
 *   2. Verify our signed state (binds the flow to a specific Site + Account)
 *   3. Exchange the code for an offline access token
 *   4. Encrypt + persist token, flip Site.connectionStatus → CONNECTED
 *   5. Redirect back to /dashboard/my-websites
 *
 * Webhook registration and initial entity sync are triggered in Phase 4.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = Object.fromEntries(searchParams.entries());
  const { shop, code, state } = query;

  if (!shop || !code || !state) {
    return NextResponse.json(
      { error: 'Missing required callback parameters' },
      { status: 400 },
    );
  }

  if (!isValidShopDomain(shop)) {
    return NextResponse.json({ error: 'Invalid shop domain' }, { status: 400 });
  }

  // 1. Shopify's callback HMAC
  try {
    verifyCallbackHmac(query);
  } catch (err) {
    console.error('[shopify/callback] hmac:', err.message);
    return NextResponse.json({ error: 'Invalid HMAC' }, { status: 401 });
  }

  // 2. Our state token
  let statePayload;
  try {
    statePayload = verifyState(state);
  } catch (err) {
    console.error('[shopify/callback] state:', err.message);
    return NextResponse.json({ error: 'Invalid state' }, { status: 401 });
  }
  if (statePayload.shop !== shop) {
    return NextResponse.json(
      { error: 'Shop mismatch between state and callback' },
      { status: 401 },
    );
  }

  const { siteId, accountId } = statePayload;

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { id: true, accountId: true },
  });
  if (!site || site.accountId !== accountId) {
    return NextResponse.json(
      { error: 'Site not found or account mismatch' },
      { status: 404 },
    );
  }

  // 3. Exchange code for token
  let tokenResult;
  try {
    tokenResult = await exchangeCodeForToken({ shop, code });
  } catch (err) {
    console.error('[shopify/callback] token exchange:', err.message);
    return redirectToDashboard(siteId, 'token_exchange_failed');
  }

  // 4. Persist
  try {
    const encryptedToken = encryptCredential(tokenResult.accessToken);
    await prisma.site.update({
      where: { id: siteId },
      data: {
        platform: 'shopify',
        shopifyDomain: shop,
        shopifyAccessToken: encryptedToken,
        shopifyScopes: tokenResult.scopes,
        shopifyAppInstalledAt: new Date(),
        connectionStatus: 'CONNECTED',
        lastPingAt: new Date(),
      },
    });
  } catch (err) {
    console.error('[shopify/callback] persist:', err);
    return redirectToDashboard(siteId, 'persist_failed');
  }

  // 5. Register webhooks (best-effort - don't block the redirect on failure).
  try {
    const host = (process.env.SHOPIFY_APP_HOST || process.env.NEXT_PUBLIC_BASE_URL || 'https://app.ghostpost.co.il').replace(/\/$/, '');
    const callbackUrl = `${host}/api/shopify/webhook`;
    const webhookIds = await registerWebhooks({
      shop,
      accessToken: tokenResult.accessToken,
      callbackUrl,
    });
    if (Object.keys(webhookIds).length) {
      await prisma.site.update({
        where: { id: siteId },
        data: { shopifyWebhookIds: webhookIds },
      });
    }
  } catch (err) {
    console.warn('[shopify/callback] webhook registration warning:', err.message);
  }

  return redirectToDashboard(siteId, 'connected');
}
