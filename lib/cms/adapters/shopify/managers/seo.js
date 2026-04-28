/**
 * Shopify SEO manager
 *
 * Shopify products/pages/articles expose an `seo { title description }` field
 * natively - no plugin required. We read/write that field and return a shape
 * matching the WP SEO manager's response (title, description, canonical,
 * social, schema where available).
 *
 * Canonical URL, og:*, Twitter Card etc. are NOT first-class fields on
 * Shopify - merchants manage them via theme templates (seo.liquid, meta
 * metafields) or apps. We surface any namespace:'global', key:'seo_*'
 * metafields we can read as best-effort and mark absent fields null.
 */

import { shopifyGraphQL } from '../client';
import { toGid } from '../gid';

const GET_PRODUCT_SEO = `
  query GetProductSeo($id: ID!) {
    product(id: $id) {
      id handle title onlineStoreUrl
      seo { title description }
      metafields(first: 10, namespace: "global") {
        edges { node { key value type } }
      }
    }
  }
`;

const GET_PAGE_SEO = `
  query GetPageSeo($id: ID!) {
    page(id: $id) {
      id handle title onlineStoreUrl
      seo { title description }
      metafields(first: 10, namespace: "global") {
        edges { node { key value type } }
      }
    }
  }
`;

const GET_ARTICLE_SEO = `
  query GetArticleSeo($id: ID!) {
    article(id: $id) {
      id handle title onlineStoreUrl
      seo { title description }
      metafields(first: 10, namespace: "global") {
        edges { node { key value type } }
      }
    }
  }
`;

const UPDATE_PRODUCT_SEO = `
  mutation ProductUpdate($input: ProductInput!) {
    productUpdate(input: $input) {
      product { id seo { title description } }
      userErrors { field message }
    }
  }
`;

const UPDATE_PAGE_SEO = `
  mutation PageUpdate($id: ID!, $page: PageUpdateInput!) {
    pageUpdate(id: $id, page: $page) {
      page { id seo { title description } }
      userErrors { field message }
    }
  }
`;

const UPDATE_ARTICLE_SEO = `
  mutation ArticleUpdate($id: ID!, $article: ArticleUpdateInput!) {
    articleUpdate(id: $id, article: $article) {
      article { id seo { title description } }
      userErrors { field message }
    }
  }
`;

function resolveIdAndType(postType, postId) {
  const t = (postType || 'post').toLowerCase();
  const rawId = String(postId);
  const isGid = rawId.startsWith('gid://shopify/');
  if (t === 'page' || t === 'pages') {
    return { type: 'page', id: isGid ? rawId : toGid('OnlineStorePage', rawId) };
  }
  if (t === 'product' || t === 'products') {
    return { type: 'product', id: isGid ? rawId : toGid('Product', rawId) };
  }
  return { type: 'article', id: isGid ? rawId : toGid('OnlineStoreArticle', rawId) };
}

function metafieldsToObj(edges = []) {
  return Object.fromEntries(edges.map((e) => [e.node.key, e.node.value]));
}

function toSeoShape(node, extraMetafields = {}) {
  if (!node) return null;
  return {
    title: node.seo?.title || null,
    description: node.seo?.description || null,
    canonical: node.onlineStoreUrl || null,
    focusKeyword: extraMetafields.focus_keyword || null,
    og: {
      title: extraMetafields.og_title || null,
      description: extraMetafields.og_description || null,
      image: extraMetafields.og_image || null,
    },
    twitter: {
      title: extraMetafields.twitter_title || null,
      description: extraMetafields.twitter_description || null,
      image: extraMetafields.twitter_image || null,
      card: extraMetafields.twitter_card || null,
    },
    schema: null,
    robots: {
      index: true,
      follow: true,
    },
    // Shopify-specific raw
    shopify: {
      handle: node.handle,
      title: node.title,
      onlineStoreUrl: node.onlineStoreUrl,
    },
  };
}

export async function getSeoData(site, postType, postId) {
  const { type, id } = resolveIdAndType(postType, postId);
  if (type === 'page') {
    const data = await shopifyGraphQL(site, GET_PAGE_SEO, { id });
    return toSeoShape(
      data.page,
      metafieldsToObj(data.page?.metafields?.edges),
    );
  }
  if (type === 'product') {
    const data = await shopifyGraphQL(site, GET_PRODUCT_SEO, { id });
    return toSeoShape(
      data.product,
      metafieldsToObj(data.product?.metafields?.edges),
    );
  }
  const data = await shopifyGraphQL(site, GET_ARTICLE_SEO, { id });
  return toSeoShape(
    data.article,
    metafieldsToObj(data.article?.metafields?.edges),
  );
}

export async function updateSeoData(site, postType, postId, seo = {}) {
  const { type, id } = resolveIdAndType(postType, postId);
  const seoInput = {
    title: seo.title ?? null,
    description: seo.description ?? null,
  };

  if (type === 'page') {
    const data = await shopifyGraphQL(site, UPDATE_PAGE_SEO, {
      id,
      page: { seo: seoInput },
    });
    const errors = data.pageUpdate?.userErrors || [];
    if (errors.length) throw new Error(`[shopify] pageUpdate seo: ${errors.map((e) => e.message).join('; ')}`);
    return toSeoShape(data.pageUpdate?.page);
  }
  if (type === 'product') {
    const data = await shopifyGraphQL(site, UPDATE_PRODUCT_SEO, {
      input: { id, seo: seoInput },
    });
    const errors = data.productUpdate?.userErrors || [];
    if (errors.length) throw new Error(`[shopify] productUpdate seo: ${errors.map((e) => e.message).join('; ')}`);
    return toSeoShape(data.productUpdate?.product);
  }
  const data = await shopifyGraphQL(site, UPDATE_ARTICLE_SEO, {
    id,
    article: { seo: seoInput },
  });
  const errors = data.articleUpdate?.userErrors || [];
  if (errors.length) throw new Error(`[shopify] articleUpdate seo: ${errors.map((e) => e.message).join('; ')}`);
  return toSeoShape(data.articleUpdate?.article);
}
