/**
 * CMS Dispatcher
 *
 * Platform-agnostic entry point for all CMS operations. Callers import `cms`
 * and call `cms.<method>(site, …)` - the dispatcher routes to the correct
 * adapter based on `site.platform`.
 *
 *     import { cms } from '@/lib/cms';
 *     const info = await cms.getSiteInfo(site);
 *
 * Add methods to the adapters (wordpress.js / shopify.js) - the dispatcher
 * picks them up automatically via Proxy. No forwarding table to maintain.
 */

import * as wordpressAdapter from './adapters/wordpress';
import * as shopifyAdapter from './adapters/shopify';
import { WORDPRESS_CAPABILITIES, SHOPIFY_CAPABILITIES, capabilitiesFor } from './capabilities';

function adapterFor(site) {
  const p = (site?.platform || 'wordpress').toLowerCase();
  if (p === 'shopify') return shopifyAdapter;
  return wordpressAdapter;
}

export function getAdapter(site) {
  return adapterFor(site);
}

export function getCapabilities(site) {
  return capabilitiesFor(site?.platform);
}

export { WORDPRESS_CAPABILITIES, SHOPIFY_CAPABILITIES, capabilitiesFor };

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
