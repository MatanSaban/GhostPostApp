/**
 * Shopify Admin GraphQL client
 *
 * Per-shop, uses the encrypted OAuth access token on Site.shopifyAccessToken.
 * All managers (content, media, seo, …) call into this. Callers should never
 * hit the Shopify REST endpoint directly.
 *
 * Rate-limit handling: Shopify returns `extensions.cost.throttleStatus`. If
 * `currentlyAvailable` drops below 100 points we sleep proportionally before
 * returning so the next call doesn't trip the bucket.
 */

import { decryptCredential } from '@/lib/site-keys';

const DEFAULT_API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-01';

function resolveToken(site) {
  if (!site?.shopifyAccessToken) {
    throw new Error('Shopify site is not connected - missing shopifyAccessToken');
  }
  return decryptCredential(site.shopifyAccessToken);
}

function resolveShop(site) {
  if (!site?.shopifyDomain) {
    throw new Error('Shopify site is not connected - missing shopifyDomain');
  }
  return site.shopifyDomain;
}

/**
 * Run a GraphQL query or mutation against a shop.
 * @param {object} site - Prisma Site row (must have shopifyDomain + shopifyAccessToken)
 * @param {string} query - GraphQL source
 * @param {object} [variables]
 */
export async function shopifyGraphQL(site, query, variables = {}) {
  const shop = resolveShop(site);
  const token = resolveToken(site);
  const url = `https://${shop}/admin/api/${DEFAULT_API_VERSION}/graphql.json`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[shopify] GraphQL ${res.status} on ${shop}: ${text}`);
    throw new Error(`Shopify GraphQL ${res.status}: ${text}`);
  }

  const body = await res.json();
  if (body.errors?.length) {
    const msg = body.errors.map((e) => e.message).join('; ');
    throw new Error(`Shopify GraphQL error: ${msg}`);
  }

  await maybeBackoff(body.extensions?.cost?.throttleStatus);

  return body.data;
}

async function maybeBackoff(throttle) {
  if (!throttle) return;
  const { currentlyAvailable, restoreRate, maximumAvailable } = throttle;
  if (currentlyAvailable >= 100) return;
  const needed = Math.min(200, maximumAvailable) - currentlyAvailable;
  const waitMs = Math.min(2_000, Math.ceil((needed / restoreRate) * 1000));
  if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
}

/**
 * Shopify REST call - used only for OAuth and the few endpoints that aren't
 * exposed via GraphQL (currently: webhook registration pre-GraphQL, health
 * ping). Prefer GraphQL everywhere else.
 */
export async function shopifyRest(site, { method = 'GET', path, body }) {
  const shop = resolveShop(site);
  const token = resolveToken(site);
  const url = `https://${shop}/admin/api/${DEFAULT_API_VERSION}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify REST ${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}
