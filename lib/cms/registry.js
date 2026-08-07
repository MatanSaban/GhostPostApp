/**
 * CMS Integration Registry (server-only)
 *
 * Single source of truth mapping an integration identifier → { adapter,
 * capabilities }. The dispatcher (lib/cms/index.js) and the apply choke point
 * (lib/cms/apply.js) resolve a site to its entry through here.
 *
 * `integrationType` decouples HOW we write back to a site from WHAT the site is
 * built with (`site.platform`). A WordPress site with the plugin and a
 * WordPress site without it share `platform: 'wordpress'` but differ in
 * integration. When `site.integrationType` is null (legacy rows), we derive it
 * from `platform` + presence of credentials — see `resolveIntegrationType`.
 *
 * To add a new adapter (Lovable, Base44, edge-proxy, …): implement it under
 * ./adapters/<name>, then register it here. Nothing else changes.
 *
 * NOTE: this module imports server-only adapters (crypto/prisma). Do NOT import
 * it from client components — use lib/cms/capabilities.js there instead.
 */

import * as wordpressAdapter from './adapters/wordpress';
import * as shopifyAdapter from './adapters/shopify';
import * as customAdapter from './adapters/custom';
import {
  WORDPRESS_CAPABILITIES,
  SHOPIFY_CAPABILITIES,
  CUSTOM_CAPABILITIES,
  CONTRACT_CAPABILITIES,
} from './capabilities';

export const INTEGRATION_TYPES = Object.freeze({
  WORDPRESS_PLUGIN: 'WORDPRESS_PLUGIN',
  SHOPIFY_OAUTH: 'SHOPIFY_OAUTH',
  SDK: 'SDK',
  EDGE_PROXY: 'EDGE_PROXY',
  MCP: 'MCP',
  GITHUB_APP: 'GITHUB_APP',
  CUSTOM_API: 'CUSTOM_API',
  NONE: 'NONE',
});

/**
 * One entry per integration. New write transports for custom sites (SDK,
 * EDGE_PROXY, MCP, GITHUB_APP) currently share the generic custom adapter and
 * custom capabilities; as each transport lands, split it into its own adapter
 * module + capability object and update only this table.
 */
const REGISTRY = Object.freeze({
  WORDPRESS_PLUGIN: { adapter: wordpressAdapter, capabilities: WORDPRESS_CAPABILITIES },
  SHOPIFY_OAUTH: { adapter: shopifyAdapter, capabilities: SHOPIFY_CAPABILITIES },
  SDK: { adapter: customAdapter, capabilities: CONTRACT_CAPABILITIES },
  EDGE_PROXY: { adapter: customAdapter, capabilities: CONTRACT_CAPABILITIES },
  MCP: { adapter: customAdapter, capabilities: CUSTOM_CAPABILITIES },
  GITHUB_APP: { adapter: customAdapter, capabilities: CUSTOM_CAPABILITIES },
  CUSTOM_API: { adapter: customAdapter, capabilities: CUSTOM_CAPABILITIES },
  NONE: { adapter: customAdapter, capabilities: CUSTOM_CAPABILITIES },
});

/**
 * Resolve a site's integration type. Honors an explicit `site.integrationType`
 * when set and known; otherwise derives it from `platform` + credentials so
 * existing rows keep working before the column is backfilled.
 *
 * @param {object} site
 * @returns {string} an INTEGRATION_TYPES value
 */
export function resolveIntegrationType(site) {
  if (site?.integrationType && REGISTRY[site.integrationType]) {
    return site.integrationType;
  }
  const platform = (site?.platform || '').toLowerCase();
  if (platform === 'wordpress' && site?.siteKey) return INTEGRATION_TYPES.WORDPRESS_PLUGIN;
  if (platform === 'shopify' && site?.shopifyAccessToken) return INTEGRATION_TYPES.SHOPIFY_OAUTH;
  // A brand-new WordPress/Shopify site that hasn't connected yet still maps to
  // its native adapter so the existing "connect your plugin" flows are unchanged.
  if (platform === 'wordpress') return INTEGRATION_TYPES.WORDPRESS_PLUGIN;
  if (platform === 'shopify') return INTEGRATION_TYPES.SHOPIFY_OAUTH;
  return INTEGRATION_TYPES.NONE;
}

/**
 * Get the { adapter, capabilities } entry for a site.
 * @param {object} site
 */
export function getRegistryEntry(site) {
  return REGISTRY[resolveIntegrationType(site)] || REGISTRY.NONE;
}

/**
 * Site-aware capabilities (server-side). Unlike the string-only
 * `capabilitiesFor(platform)` in capabilities.js, this accounts for the
 * integration type + credentials (e.g. a WordPress row with a null platform
 * but a real plugin connection).
 * @param {object} site
 */
export function capabilitiesForSite(site) {
  return getRegistryEntry(site).capabilities;
}
