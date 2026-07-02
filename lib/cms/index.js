/**
 * CMS Dispatcher
 *
 * Platform-agnostic entry point for all CMS operations. Callers import `cms`
 * and call `cms.<method>(site, …)` - the dispatcher routes to the correct
 * adapter based on the site's resolved integration type (see lib/cms/registry).
 *
 *     import { cms } from '@/lib/cms';
 *     const info = await cms.getSiteInfo(site);
 *
 * Add methods to the adapters (wordpress.js / shopify / custom) and register the
 * adapter in lib/cms/registry.js - the dispatcher picks methods up automatically
 * via Proxy. No forwarding table to maintain.
 */

import {
  getRegistryEntry,
  capabilitiesForSite,
  resolveIntegrationType,
  INTEGRATION_TYPES,
} from './registry';
import {
  WORDPRESS_CAPABILITIES,
  SHOPIFY_CAPABILITIES,
  CUSTOM_CAPABILITIES,
  capabilitiesFor,
} from './capabilities';

function adapterFor(site) {
  return getRegistryEntry(site).adapter;
}

export function getAdapter(site) {
  return adapterFor(site);
}

/**
 * Site-aware capabilities. Prefer this (it accounts for integration type +
 * credentials) over the string-only `capabilitiesFor(platform)`.
 */
export function getCapabilities(site) {
  return capabilitiesForSite(site);
}

export {
  WORDPRESS_CAPABILITIES,
  SHOPIFY_CAPABILITIES,
  CUSTOM_CAPABILITIES,
  capabilitiesFor,
  resolveIntegrationType,
  INTEGRATION_TYPES,
};

export const cms = new Proxy(
  {},
  {
    get(_target, prop) {
      if (typeof prop !== 'string') return undefined;
      return (site, ...args) => {
        const adapter = adapterFor(site);
        const fn = adapter[prop];
        if (typeof fn !== 'function') {
          const platform = adapter.capabilities?.platform || 'unknown';
          throw new Error(
            `[cms] method "${prop}" not implemented for platform "${platform}"`,
          );
        }
        return fn(site, ...args);
      };
    },
  },
);
