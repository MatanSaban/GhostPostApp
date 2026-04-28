/**
 * Shopify OAuth
 *
 * Implements the install flow:
 *   1. buildInstallUrl() - where /api/shopify/install redirects to
 *   2. validateCallback() - HMAC + state check on the return trip
 *   3. exchangeCodeForToken() - POST to /admin/oauth/access_token
 *
 * State tokens are self-signed (HMAC-SHA256 with SHOPIFY_APP_SECRET) and
 * include siteId + accountId + nonce + timestamp. No DB round-trip needed
 * to validate on the callback.
 */

import crypto from 'crypto';

/** Minimum OAuth scopes for feature parity with the WordPress connector. */
export const SHOPIFY_APP_SCOPES = [
  'read_products',
  'write_products',
  'read_content',
  'write_content',
  'read_themes',
  'write_themes',
  'read_files',
  'write_files',
  'read_online_store_pages',
  'write_online_store_pages',
  'read_online_store_navigation',
  'write_online_store_navigation',
  'read_translations',
  'write_translations',
  'read_metaobjects',
  'write_metaobjects',
  'read_metaobject_definitions',
  'write_metaobject_definitions',
  'read_shop_locales',
];

const SHOP_DOMAIN_PATTERN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function appSecret() {
  const secret = process.env.SHOPIFY_APP_SECRET;
  if (!secret) throw new Error('SHOPIFY_APP_SECRET is not configured');
  return secret;
}

function appKey() {
  const key = process.env.SHOPIFY_APP_API_KEY;
  if (!key) throw new Error('SHOPIFY_APP_API_KEY is not configured');
  return key;
}

function appHost() {
  const host =
    process.env.SHOPIFY_APP_HOST ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    'https://app.ghostseo.ai';
  return host.replace(/\/$/, '');
}

/**
 * Validate a shop domain against Shopify's canonical pattern.
 * Rejects anything that isn't *.myshopify.com - prevents open-redirect abuse
 * via the install URL.
 */
export function isValidShopDomain(shop) {
  return typeof shop === 'string' && SHOP_DOMAIN_PATTERN.test(shop);
}

/**
 * Sign a state payload. Self-contained so the callback doesn't need DB lookup.
 */
export function signState({ siteId, accountId, shop }) {
  const payload = {
    siteId,
    accountId,
    shop,
    nonce: crypto.randomBytes(16).toString('hex'),
    iat: Date.now(),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto
    .createHmac('sha256', appSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${mac}`;
}

/**
 * Verify a state token from the callback. Returns the payload or throws.
 */
export function verifyState(state) {
  if (typeof state !== 'string' || !state.includes('.')) {
    throw new Error('Invalid state format');
  }
  const [encoded, mac] = state.split('.');
  const expected = crypto
    .createHmac('sha256', appSecret())
    .update(encoded)
    .digest('base64url');
  const macBuf = Buffer.from(mac, 'base64url');
  const expectedBuf = Buffer.from(expected, 'base64url');
  if (
    macBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(macBuf, expectedBuf)
  ) {
    throw new Error('State signature mismatch');
  }
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  if (typeof payload.iat !== 'number' || Date.now() - payload.iat > STATE_TTL_MS) {
    throw new Error('State expired');
  }
  return payload;
}

/**
 * Build the Shopify consent-screen URL.
 */
export function buildInstallUrl({ shop, state, scopes = SHOPIFY_APP_SCOPES }) {
  if (!isValidShopDomain(shop)) throw new Error('Invalid shop domain');
  const params = new URLSearchParams({
    client_id: appKey(),
    scope: scopes.join(','),
    redirect_uri: `${appHost()}/api/shopify/callback`,
    state,
    'grant_options[]': '', // offline token (default when per-user not set)
  });
  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

/**
 * Verify the HMAC Shopify puts on the callback query string.
 * Spec: sort all query params (excluding `hmac` and legacy `signature`),
 * form `key=value&…`, HMAC-SHA256 with app secret, hex-compare timing-safe.
 */
export function verifyCallbackHmac(query) {
  const { hmac, signature: _sig, ...rest } = query;
  if (typeof hmac !== 'string') throw new Error('Missing hmac');
  const sorted = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join('&');
  const expected = crypto
    .createHmac('sha256', appSecret())
    .update(sorted)
    .digest('hex');
  const given = Buffer.from(hmac, 'hex');
  const exp = Buffer.from(expected, 'hex');
  if (given.length !== exp.length || !crypto.timingSafeEqual(given, exp)) {
    throw new Error('Callback HMAC mismatch');
  }
}

/**
 * Verify the HMAC Shopify puts on incoming webhook requests.
 * Header: X-Shopify-Hmac-Sha256 = base64(HMAC-SHA256(rawBody, app_secret))
 *
 * `rawBody` MUST be the exact bytes Shopify sent - do NOT parse JSON first.
 */
export function verifyWebhookHmac(rawBody, hmacHeader) {
  if (!hmacHeader) throw new Error('Missing webhook HMAC header');
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
  const expected = crypto
    .createHmac('sha256', appSecret())
    .update(body)
    .digest('base64');
  const given = Buffer.from(hmacHeader, 'base64');
  const exp = Buffer.from(expected, 'base64');
  if (given.length !== exp.length || !crypto.timingSafeEqual(given, exp)) {
    throw new Error('Webhook HMAC mismatch');
  }
}

/**
 * Topics we subscribe to on install. Each maps to a cache-bust / re-sync
 * action in the webhook receiver.
 */
export const SHOPIFY_WEBHOOK_TOPICS = [
  'PRODUCTS_CREATE',
  'PRODUCTS_UPDATE',
  'PRODUCTS_DELETE',
  'COLLECTIONS_CREATE',
  'COLLECTIONS_UPDATE',
  'COLLECTIONS_DELETE',
  'APP_UNINSTALLED',
  'SHOP_UPDATE',
];

const WEBHOOK_SUBSCRIPTION_CREATE = `
  mutation WebhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
      webhookSubscription { id topic endpoint { __typename ... on WebhookHttpEndpoint { callbackUrl } } }
      userErrors { field message }
    }
  }
`;

/**
 * Register the canonical set of webhooks against the freshly-installed shop.
 * Returns an object map { topic: subscriptionId } suitable for storing in
 * Site.shopifyWebhookIds.
 *
 * Failures are logged but never throw - partial registration is better than
 * blocking the OAuth callback.
 */
export async function registerWebhooks({ shop, accessToken, callbackUrl }) {
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2025-01';
  const url = `https://${shop}/admin/api/${apiVersion}/graphql.json`;
  const out = {};

  for (const topic of SHOPIFY_WEBHOOK_TOPICS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({
          query: WEBHOOK_SUBSCRIPTION_CREATE,
          variables: {
            topic,
            webhookSubscription: { callbackUrl, format: 'JSON' },
          },
        }),
      });
      const json = await res.json();
      const node = json?.data?.webhookSubscriptionCreate?.webhookSubscription;
      const errors = json?.data?.webhookSubscriptionCreate?.userErrors || [];
      if (node) {
        out[topic] = node.id;
      } else if (errors.length) {
        // Most common error is "address already taken" if registering twice.
        if (!errors[0].message.toLowerCase().includes('already')) {
          console.warn(`[shopify/webhooks] ${topic}:`, errors.map((e) => e.message).join('; '));
        }
      }
    } catch (err) {
      console.error(`[shopify/webhooks] ${topic} register failed:`, err.message);
    }
  }
  return out;
}

/**
 * Exchange the authorization code for a permanent offline access token.
 */
export async function exchangeCodeForToken({ shop, code }) {
  if (!isValidShopDomain(shop)) throw new Error('Invalid shop domain');
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: appKey(),
      client_secret: appSecret(),
      code,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  if (!body.access_token) throw new Error('Token exchange returned no access_token');
  return {
    accessToken: body.access_token,
    scopes: (body.scope || '').split(',').filter(Boolean),
  };
}
