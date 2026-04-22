import { shopifyGraphQL } from '../client';

const QUERY = `
  query ShopInfo {
    shop {
      name
      email
      myshopifyDomain
      primaryDomain { url host }
      ianaTimezone
      currencyCode
      contactEmail
      description
      plan { displayName partnerDevelopment }
      shipsToCountries
    }
    themes(first: 5, roles: [MAIN]) {
      nodes { id name role }
    }
    shopLocales { locale primary published }
    publications(first: 5) { nodes { id name } }
  }
`;

/**
 * Shopify equivalent of WordPress /site-info — returns a shape mirroring
 * the WP response so platform code consumes it identically.
 */
export async function getSiteInfo(site) {
  const data = await shopifyGraphQL(site, QUERY);
  const { shop, themes, shopLocales } = data;
  const primary = shopLocales?.find((l) => l.primary) || shopLocales?.[0];

  return {
    siteUrl: shop.primaryDomain?.url || `https://${shop.myshopifyDomain}`,
    homeUrl: shop.primaryDomain?.url || `https://${shop.myshopifyDomain}`,
    siteName: shop.name,
    siteDescription: shop.description || '',
    // WP-version / PHP-version don't apply
    wpVersion: null,
    phpVersion: null,
    pluginVersion: null,
    timezone: shop.ianaTimezone,
    locale: primary?.locale || null,
    theme: themes?.nodes?.[0]
      ? {
          name: themes.nodes[0].name,
          version: null,
          parent: null,
          role: themes.nodes[0].role,
        }
      : null,
    activePlugins: [],
    // Shopify-specific additions — UI can read these when caps.platform === 'shopify'
    shopify: {
      myshopifyDomain: shop.myshopifyDomain,
      primaryDomain: shop.primaryDomain?.host,
      currency: shop.currencyCode,
      planName: shop.plan?.displayName,
      isDevStore: !!shop.plan?.partnerDevelopment,
      locales: shopLocales || [],
      shipsToCountries: shop.shipsToCountries || [],
    },
    // Post types + taxonomies are reported by content/taxonomy managers; keep
    // the key for shape compatibility.
    postTypes: [],
    taxonomies: [],
  };
}
