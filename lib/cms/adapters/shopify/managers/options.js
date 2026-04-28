/**
 * Shopify options manager
 *
 * WordPress "options" map to two Shopify concepts:
 *   - Shop policy fields (Shop, BrandingSettings, etc.) - read-only via GraphQL
 *   - Shop-level metafields under namespace "ghostpost" - read+write
 *
 * For platform parity, getOptions returns a flat object that mixes a few
 * common shop fields (siteName, contactEmail, currency, primaryDomain) with
 * any custom metafields stored under namespace "ghostpost". updateOptions
 * writes back to namespace "ghostpost" only - built-in shop fields are
 * handled by Shopify admin UI / shop settings, not our adapter.
 */

import { shopifyGraphQL } from '../client';

const SHOP_OPTIONS = `
  query ShopOptions {
    shop {
      id name email contactEmail myshopifyDomain currencyCode
      primaryDomain { url host }
      brand { logo { image { url } } }
      metafields(first: 50, namespace: "ghostpost") {
        edges { node { id namespace key value type } }
      }
    }
  }
`;

const METAFIELDS_SET = `
  mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id namespace key value type }
      userErrors { field message code }
    }
  }
`;

function parseValue(node) {
  if (!node) return null;
  const { value, type } = node;
  if (value == null) return null;
  if (type === 'number_integer') return parseInt(value, 10);
  if (type === 'number_decimal') return parseFloat(value);
  if (type === 'boolean') return value === 'true';
  if (type === 'json' || type?.startsWith('list.')) {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}

export async function getOptions(site, keys = null) {
  const data = await shopifyGraphQL(site, SHOP_OPTIONS);
  const shop = data.shop;

  const builtin = {
    blogname: shop.name,
    blogdescription: null,
    siteurl: shop.primaryDomain?.url,
    home: shop.primaryDomain?.url,
    admin_email: shop.contactEmail || shop.email,
    timezone_string: null,
    site_logo: shop.brand?.logo?.image?.url || null,
    posts_per_page: null,
    permalink_structure: null,
    // Shopify-specific carry-throughs
    currency: shop.currencyCode,
    myshopify_domain: shop.myshopifyDomain,
  };

  const custom = {};
  for (const { node } of shop.metafields?.edges || []) {
    custom[node.key] = parseValue(node);
  }

  const all = { ...builtin, ...custom };
  if (Array.isArray(keys) && keys.length) {
    return Object.fromEntries(keys.map((k) => [k, all[k] ?? null]));
  }
  return all;
}

export async function updateOptions(site, updates = {}) {
  // Resolve owner GID = shop GID (use Shop singleton query result as source).
  const data = await shopifyGraphQL(site, `query { shop { id } }`);
  const ownerId = data.shop.id;

  const metafields = Object.entries(updates)
    // Built-in keys (blogname etc.) are not writable via metafields. Skip.
    .filter(([k]) => !['blogname', 'blogdescription', 'siteurl', 'home', 'admin_email', 'currency', 'myshopify_domain'].includes(k))
    .map(([key, value]) => {
      const isObj = value !== null && typeof value === 'object';
      const type = isObj
        ? 'json'
        : typeof value === 'boolean'
          ? 'boolean'
          : Number.isInteger(value)
            ? 'number_integer'
            : typeof value === 'number'
              ? 'number_decimal'
              : (typeof value === 'string' && (value.length > 255 || value.includes('\n')))
                ? 'multi_line_text_field'
                : 'single_line_text_field';
      return {
        ownerId,
        namespace: 'ghostpost',
        key,
        type,
        value: isObj ? JSON.stringify(value) : String(value ?? ''),
      };
    });

  if (!metafields.length) return getOptions(site);

  const res = await shopifyGraphQL(site, METAFIELDS_SET, { metafields });
  const errors = res.metafieldsSet?.userErrors || [];
  if (errors.length) throw new Error(`[shopify] metafieldsSet: ${errors.map((e) => e.message).join('; ')}`);
  return getOptions(site);
}

/** Always-on for Shopify storefronts; toggled in Shopify admin not via API. */
export async function getSearchEngineVisibility(site) {
  const data = await shopifyGraphQL(site, `query { shop { id myshopifyDomain } }`);
  // No GraphQL field exposes the storefront password / visibility flag -
  // report a best-effort default.
  return { discourageSearch: false, source: 'shopify-admin', note: 'Toggle search engine visibility in Shopify admin → Online Store → Preferences.', shop: data.shop?.myshopifyDomain };
}

export async function setSearchEngineVisibility(_site, _value) {
  throw new Error('[shopify] setSearchEngineVisibility: not supported via Shopify API. Toggle in admin → Preferences.');
}

export async function setFavicon(site, mediaIdOrUrl) {
  // Favicon is set via the Online Store theme settings - there's no direct
  // GraphQL mutation. We store the chosen URL in a "ghostpost" metafield so
  // the chat assistant can surface it; the merchant still needs to wire it
  // into the theme.
  await updateOptions(site, { favicon_url: typeof mediaIdOrUrl === 'string' ? mediaIdOrUrl : String(mediaIdOrUrl) });
  return {
    set: true,
    note: 'Favicon URL stored in shop metafield ghostpost.favicon_url. Update theme settings → Brand → Favicon to reference it.',
  };
}
