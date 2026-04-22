/**
 * Shopify URL resolution
 *
 * Maps a storefront URL (or partial path) back to the underlying resource
 * (page, product, article, collection). The chat assistant uses this to
 * answer "edit this URL" requests without the user knowing internal IDs.
 */

import { shopifyGraphQL } from '../client';
import { gidNumericId } from '../gid';

const RESOLVE_PRODUCT = `
  query ProductByHandle($handle: String!) {
    productByHandle(handle: $handle) { id handle title onlineStoreUrl }
  }
`;
const RESOLVE_PAGE = `
  query PageByHandle($handle: String!) {
    pageByHandle(handle: $handle) { id handle title onlineStoreUrl }
  }
`;
const RESOLVE_COLLECTION = `
  query CollectionByHandle($handle: String!) {
    collectionByHandle(handle: $handle) { id handle title }
  }
`;

function pathSegments(url) {
  try {
    const u = new URL(url, 'https://example.com');
    return u.pathname.split('/').filter(Boolean);
  } catch {
    return String(url).split('/').filter(Boolean);
  }
}

/**
 * Heuristic — Shopify default URL templates:
 *   /products/<handle>
 *   /pages/<handle>
 *   /collections/<handle>
 *   /collections/<col>/products/<handle>
 *   /blogs/<blog-handle>/<article-handle>
 */
export async function resolveUrl(site, url) {
  const segs = pathSegments(url);
  if (!segs.length) return null;

  if (segs[0] === 'products' && segs[1]) {
    const data = await shopifyGraphQL(site, RESOLVE_PRODUCT, { handle: segs[1] });
    const node = data.productByHandle;
    if (!node) return null;
    return {
      type: 'product',
      id: gidNumericId(node.id),
      gid: node.id,
      title: node.title,
      slug: node.handle,
      permalink: node.onlineStoreUrl,
    };
  }
  if (segs[0] === 'pages' && segs[1]) {
    const data = await shopifyGraphQL(site, RESOLVE_PAGE, { handle: segs[1] });
    const node = data.pageByHandle;
    if (!node) return null;
    return {
      type: 'page',
      id: gidNumericId(node.id),
      gid: node.id,
      title: node.title,
      slug: node.handle,
      permalink: node.onlineStoreUrl,
    };
  }
  if (segs[0] === 'collections' && segs[1]) {
    // Could be a collection or a "collection scoped to product"
    if (segs[2] === 'products' && segs[3]) {
      const data = await shopifyGraphQL(site, RESOLVE_PRODUCT, { handle: segs[3] });
      const node = data.productByHandle;
      if (!node) return null;
      return {
        type: 'product',
        id: gidNumericId(node.id),
        gid: node.id,
        title: node.title,
        slug: node.handle,
        permalink: node.onlineStoreUrl,
      };
    }
    const data = await shopifyGraphQL(site, RESOLVE_COLLECTION, { handle: segs[1] });
    const node = data.collectionByHandle;
    if (!node) return null;
    return {
      type: 'collection',
      id: gidNumericId(node.id),
      gid: node.id,
      title: node.title,
      slug: node.handle,
    };
  }
  if (segs[0] === 'blogs' && segs[1] && segs[2]) {
    // Article paths require resolving via list filtered by handle — Shopify
    // has no direct articleByHandle. Fall back to scanning latest articles.
    const ARTICLE_BY_HANDLE = `
      query ArticleByHandle($query: String!) {
        articles(first: 1, query: $query) {
          edges { node { id handle title onlineStoreUrl blog { handle } } }
        }
      }
    `;
    const data = await shopifyGraphQL(site, ARTICLE_BY_HANDLE, {
      query: `handle:${segs[2]}`,
    });
    const node = data.articles?.edges?.[0]?.node;
    if (!node) return null;
    return {
      type: 'post',
      id: gidNumericId(node.id),
      gid: node.id,
      title: node.title,
      slug: node.handle,
      permalink: node.onlineStoreUrl,
    };
  }

  return null;
}
