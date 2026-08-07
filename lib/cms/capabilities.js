/**
 * CMS Adapter Capabilities
 *
 * Static feature flags per platform. Safe to import from client components -
 * contains no server dependencies.
 *
 * UI gates feature visibility by consulting these flags (via useCapabilities),
 * never by hard-checking `site.platform === 'wordpress'`.
 */

export const WORDPRESS_CAPABILITIES = Object.freeze({
  platform: 'wordpress',
  supportsPlugin: true,
  supportsContentWrite: true,
  supportsWebpConversion: true,
  supportsACF: true,
  supportsCPT: true,
  supportsSnippetsInjection: true,
  supportsSecurityHeaders: true,
  supportsFaviconSet: true,
  supportsSearchReplace: true,
  supportsVisualEditor: true,
  previewMode: 'direct', // live preview loads the site directly (signed plugin URL)
  supportsProducts: false,
  supportsCollections: false,
  redirectsBackend: 'plugin',
  seoBackend: 'yoast-rankmath',
  customFieldsLabel: 'ACF',
  customContentLabel: 'Custom Post Types',
});

export const SHOPIFY_CAPABILITIES = Object.freeze({
  platform: 'shopify',
  supportsPlugin: false,
  supportsContentWrite: true,
  supportsWebpConversion: false,
  supportsACF: false,
  supportsCPT: true,
  supportsSnippetsInjection: false,
  supportsSecurityHeaders: false,
  supportsFaviconSet: false,
  supportsSearchReplace: true,
  supportsVisualEditor: false,
  previewMode: 'none', // no visual editor for Shopify (theme-locked)
  supportsProducts: true,
  supportsCollections: true,
  redirectsBackend: 'native',
  seoBackend: 'native+metafields',
  customFieldsLabel: 'Metafields',
  customContentLabel: 'Metaobjects',
});

/**
 * Custom / non-CMS sites (custom-coded, Lovable, Base44, static, unknown).
 * Read-only by default: audits/insights work for any URL, but native write-back
 * requires a connected transport (SDK / edge proxy). Until then, every write
 * degrades to the assisted/manual path (copy-paste snippets, redirect config).
 */
export const CUSTOM_CAPABILITIES = Object.freeze({
  platform: 'custom',
  supportsPlugin: false,
  supportsContentWrite: false, // flips true once an SDK/edge transport is connected
  supportsWebpConversion: false,
  supportsACF: false,
  supportsCPT: false,
  supportsSnippetsInjection: false,
  supportsSecurityHeaders: false, // → assisted: htaccess / nginx / meta
  supportsFaviconSet: false, // → assisted: image + instructions
  supportsSearchReplace: false,
  supportsVisualEditor: false,
  previewMode: 'proxy', // live preview via the on-demand preview proxy (no plugin/DNS)
  supportsProducts: false,
  supportsCollections: false,
  redirectsBackend: 'none', // → assisted: redirect + host-config instructions
  seoBackend: 'manual',
  customFieldsLabel: null,
  customContentLabel: null,
});

/**
 * Custom site WITH a connected contract transport (SDK / edge proxy).
 * SEO meta + redirects are contract-carried: dashboard/chat writes persist to
 * the Contract store and the transport serves them within its cache TTL — no
 * copy-paste needed. Content writes still have no channel.
 */
export const CONTRACT_CAPABILITIES = Object.freeze({
  ...CUSTOM_CAPABILITIES,
  redirectsBackend: 'contract',
  seoBackend: 'contract',
});

/**
 * Resolve capabilities from a bare platform string (client-safe).
 *
 * - `shopify`            → Shopify
 * - `wordpress`          → WordPress
 * - null / undefined / '' → WordPress (legacy default: pre-detection sites and
 *   older WordPress sites that never had `platform` populated)
 * - anything else (`custom`, `wix`, `webflow`, `lovable`, `base44`, …) → Custom
 *
 * Server code that needs siteKey-aware resolution (e.g. a WordPress site with a
 * null platform but a real plugin connection) should use `capabilitiesForSite`
 * from `lib/cms/registry`, not this string-only helper.
 */
export function capabilitiesFor(platform) {
  if (platform == null || platform === '') return WORDPRESS_CAPABILITIES;
  const p = String(platform).toLowerCase();
  if (p === 'shopify') return SHOPIFY_CAPABILITIES;
  if (p === 'wordpress') return WORDPRESS_CAPABILITIES;
  return CUSTOM_CAPABILITIES;
}
