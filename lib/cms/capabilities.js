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
  supportsWebpConversion: true,
  supportsACF: true,
  supportsCPT: true,
  supportsSnippetsInjection: true,
  supportsSecurityHeaders: true,
  supportsFaviconSet: true,
  supportsSearchReplace: true,
  supportsVisualEditor: true,
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
  supportsWebpConversion: false,
  supportsACF: false,
  supportsCPT: true,
  supportsSnippetsInjection: false,
  supportsSecurityHeaders: false,
  supportsFaviconSet: false,
  supportsSearchReplace: true,
  supportsVisualEditor: false,
  supportsProducts: true,
  supportsCollections: true,
  redirectsBackend: 'native',
  seoBackend: 'native+metafields',
  customFieldsLabel: 'Metafields',
  customContentLabel: 'Metaobjects',
});

export function capabilitiesFor(platform) {
  const p = (platform || 'wordpress').toLowerCase();
  if (p === 'shopify') return SHOPIFY_CAPABILITIES;
  return WORDPRESS_CAPABILITIES;
}
