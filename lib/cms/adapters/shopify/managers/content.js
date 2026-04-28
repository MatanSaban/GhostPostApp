/**
 * Shopify content manager
 *
 * Maps the WordPress-flavored post-type surface to Shopify resources:
 *   post / posts     → Article (on the default Blog)
 *   page / pages     → Page
 *   product / products → Product
 *   <metaobject-type>→ Metaobject(type:…)
 *
 * Return shapes match the WP plugin's /posts, /pages, /cpt endpoints closely
 * (items, total, pages, page) so entity-sync and the chat executor keep
 * working without per-platform branching.
 */

import { shopifyGraphQL } from '../client';
import { fromGid, gidNumericId, toGid } from '../gid';

// ─── post-type resolution ──────────────────────────────────────────────

function normalizeType(postType) {
  const t = (postType || 'post').toLowerCase().trim();
  if (t === 'post' || t === 'posts') return 'article';
  if (t === 'page' || t === 'pages') return 'page';
  if (t === 'product' || t === 'products') return 'product';
  return t; // metaobject type name
}

// ─── shared mappers ────────────────────────────────────────────────────

function mapArticle(node) {
  if (!node) return null;
  return {
    id: gidNumericId(node.id),
    gid: node.id,
    type: 'post',
    title: node.title || 'Untitled',
    slug: node.handle,
    permalink: node.onlineStoreUrl || null,
    link: node.onlineStoreUrl || null,
    excerpt: node.summary || null,
    content: node.body || null,
    status: node.isPublished ? 'publish' : 'draft',
    author: node.author?.name || null,
    featured_image: node.image?.url || null,
    featuredImage: node.image?.url || null,
    date: node.publishedAt,
    date_gmt: node.publishedAt,
    modified: node.updatedAt,
    categories: [],
    tags: (node.tags || []).map((t) => (typeof t === 'string' ? t : t.title)),
    taxonomies: null,
    meta: null,
    acf: null,
    seo: node.seo ? { title: node.seo.title, description: node.seo.description } : null,
    shopify: { blogId: node.blog?.id || null, blogHandle: node.blog?.handle || null },
  };
}

function mapPage(node) {
  if (!node) return null;
  return {
    id: gidNumericId(node.id),
    gid: node.id,
    type: 'page',
    title: node.title || 'Untitled',
    slug: node.handle,
    permalink: node.onlineStoreUrl || null,
    link: node.onlineStoreUrl || null,
    excerpt: null,
    content: node.body || null,
    status: node.isPublished ? 'publish' : 'draft',
    author: null,
    featured_image: null,
    featuredImage: null,
    date: node.publishedAt || node.createdAt,
    date_gmt: node.publishedAt || node.createdAt,
    modified: node.updatedAt,
    categories: [],
    tags: [],
    taxonomies: null,
    meta: null,
    acf: null,
    seo: node.seo ? { title: node.seo.title, description: node.seo.description } : null,
  };
}

function mapProduct(node) {
  if (!node) return null;
  return {
    id: gidNumericId(node.id),
    gid: node.id,
    type: 'product',
    title: node.title || 'Untitled',
    slug: node.handle,
    permalink: node.onlineStoreUrl || null,
    link: node.onlineStoreUrl || null,
    excerpt: null,
    content: node.descriptionHtml || null,
    status: (node.status || '').toLowerCase() === 'active' ? 'publish' : 'draft',
    author: node.vendor || null,
    featured_image: node.featuredImage?.url || null,
    featuredImage: node.featuredImage?.url || null,
    date: node.publishedAt || node.createdAt,
    date_gmt: node.publishedAt || node.createdAt,
    modified: node.updatedAt,
    categories: [],
    tags: node.tags || [],
    taxonomies: null,
    meta: null,
    acf: null,
    seo: node.seo ? { title: node.seo.title, description: node.seo.description } : null,
    shopify: {
      productType: node.productType,
      vendor: node.vendor,
      totalInventory: node.totalInventory,
    },
  };
}

function mapMetaobject(node) {
  if (!node) return null;
  const fieldsByKey = Object.fromEntries(
    (node.fields || []).map((f) => [f.key, f.value]),
  );
  return {
    id: gidNumericId(node.id),
    gid: node.id,
    type: node.type,
    title: node.displayName || fieldsByKey.title || node.handle,
    slug: node.handle,
    permalink: null,
    link: null,
    excerpt: null,
    content: null,
    status: 'publish',
    author: null,
    featured_image: null,
    featuredImage: null,
    date: node.updatedAt,
    date_gmt: node.updatedAt,
    modified: node.updatedAt,
    categories: [],
    tags: [],
    taxonomies: null,
    meta: fieldsByKey,
    acf: fieldsByKey,
    seo: null,
  };
}

// ─── queries ───────────────────────────────────────────────────────────

const LIST_PAGES = `
  query ListPages($first: Int!, $after: String) {
    pages(first: $first, after: $after, sortKey: UPDATED_AT, reverse: true) {
      edges { cursor node {
        id handle title body bodyHtml isPublished
        publishedAt updatedAt createdAt onlineStoreUrl
        seo { title description }
      } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const LIST_PRODUCTS = `
  query ListProducts($first: Int!, $after: String) {
    products(first: $first, after: $after, sortKey: UPDATED_AT, reverse: true) {
      edges { cursor node {
        id handle title descriptionHtml vendor productType status
        publishedAt updatedAt createdAt onlineStoreUrl totalInventory tags
        featuredImage { url altText }
        seo { title description }
      } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const LIST_ARTICLES = `
  query ListArticles($first: Int!, $after: String) {
    articles(first: $first, after: $after, sortKey: UPDATED_AT, reverse: true) {
      edges { cursor node {
        id handle title body summary isPublished publishedAt updatedAt
        onlineStoreUrl tags
        author { name }
        image { url altText }
        blog { id handle title }
        seo { title description }
      } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const LIST_METAOBJECTS = `
  query ListMetaobjects($type: String!, $first: Int!, $after: String) {
    metaobjects(type: $type, first: $first, after: $after) {
      edges { cursor node {
        id handle type displayName updatedAt
        fields { key value type }
      } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const GET_PAGE = `
  query GetPage($id: ID!) {
    page(id: $id) {
      id handle title body bodyHtml isPublished
      publishedAt updatedAt createdAt onlineStoreUrl
      seo { title description }
    }
  }
`;

const GET_PRODUCT = `
  query GetProduct($id: ID!) {
    product(id: $id) {
      id handle title descriptionHtml vendor productType status
      publishedAt updatedAt createdAt onlineStoreUrl totalInventory tags
      featuredImage { url altText }
      seo { title description }
    }
  }
`;

const GET_ARTICLE = `
  query GetArticle($id: ID!) {
    article(id: $id) {
      id handle title body summary isPublished publishedAt updatedAt
      onlineStoreUrl tags
      author { name }
      image { url altText }
      blog { id handle title }
      seo { title description }
    }
  }
`;

const GET_METAOBJECT = `
  query GetMetaobject($id: ID!) {
    metaobject(id: $id) {
      id handle type displayName updatedAt
      fields { key value type }
    }
  }
`;

const BY_HANDLE_PAGE = `
  query PageByHandle($handle: String!) {
    pageByHandle(handle: $handle) {
      id handle title body bodyHtml isPublished publishedAt updatedAt
      onlineStoreUrl seo { title description }
    }
  }
`;

const BY_HANDLE_PRODUCT = `
  query ProductByHandle($handle: String!) {
    productByHandle(handle: $handle) {
      id handle title descriptionHtml vendor productType status
      publishedAt updatedAt onlineStoreUrl totalInventory tags
      featuredImage { url altText }
      seo { title description }
    }
  }
`;

// ─── post-type registry (analog of WP REST /types) ─────────────────────

export async function getPostTypes(site) {
  // Static built-ins that always exist on a Shopify store. Metaobject types
  // could be enumerated via `metaobjectDefinitions` - defer that until we
  // need it in the UI.
  return [
    { slug: 'post', name: 'Articles', singularName: 'Article', restBase: 'articles', isBuiltin: true, hierarchical: false },
    { slug: 'page', name: 'Pages', singularName: 'Page', restBase: 'pages', isBuiltin: true, hierarchical: false },
    { slug: 'product', name: 'Products', singularName: 'Product', restBase: 'products', isBuiltin: true, hierarchical: false },
  ];
}

// ─── list/get ──────────────────────────────────────────────────────────

const MAX_PAGE = 50; // Shopify hard-caps per-page at 250; keep it reasonable

function paginateResponse(edges, pageInfo, currentPage, perPage) {
  const items = edges.map((e) => e.node);
  const hasNext = !!pageInfo?.hasNextPage;
  return {
    items,
    total: hasNext ? currentPage * perPage + 1 : currentPage * perPage,
    pages: hasNext ? currentPage + 1 : currentPage,
    page: currentPage,
    // cursor carried so chained fetches can continue; callers using
    // page-number paging will just see totalPages bump.
    _cursor: pageInfo?.endCursor || null,
  };
}

export async function getPosts(
  site,
  postType = 'post',
  page = 1,
  perPage = 100,
  _full = true,
) {
  const type = normalizeType(postType);
  const first = Math.min(perPage, MAX_PAGE);

  // Cursor-paging emulation: walk forward from page 1 to `page`. Fine for
  // small page counts; entity-sync typically starts at page 1.
  let after = null;
  let response;
  let currentPage = 0;

  const runQuery = async (query, extraVars = {}) => {
    while (currentPage < page) {
      response = await shopifyGraphQL(site, query, { first, after, ...extraVars });
      currentPage += 1;
      const key = Object.keys(response)[0];
      const { edges, pageInfo } = response[key];
      if (currentPage === page) {
        return { edges, pageInfo };
      }
      if (!pageInfo.hasNextPage) return { edges: [], pageInfo };
      after = pageInfo.endCursor;
    }
    return { edges: [], pageInfo: { hasNextPage: false, endCursor: null } };
  };

  if (type === 'page') {
    const { edges, pageInfo } = await runQuery(LIST_PAGES);
    const mapped = edges.map((e) => ({ ...e, node: mapPage(e.node) }));
    return paginateResponse(mapped, pageInfo, page, perPage);
  }
  if (type === 'product') {
    const { edges, pageInfo } = await runQuery(LIST_PRODUCTS);
    const mapped = edges.map((e) => ({ ...e, node: mapProduct(e.node) }));
    return paginateResponse(mapped, pageInfo, page, perPage);
  }
  if (type === 'article') {
    const { edges, pageInfo } = await runQuery(LIST_ARTICLES);
    const mapped = edges.map((e) => ({ ...e, node: mapArticle(e.node) }));
    return paginateResponse(mapped, pageInfo, page, perPage);
  }
  // Fallback: treat as metaobject type
  const { edges, pageInfo } = await runQuery(LIST_METAOBJECTS, { type });
  const mapped = edges.map((e) => ({ ...e, node: mapMetaobject(e.node) }));
  return paginateResponse(mapped, pageInfo, page, perPage);
}

export async function getPost(site, postType, postId) {
  const type = normalizeType(postType);
  const rawId = String(postId);
  const isGid = rawId.startsWith('gid://shopify/');

  if (type === 'page') {
    const id = isGid ? rawId : toGid('OnlineStorePage', rawId);
    const data = await shopifyGraphQL(site, GET_PAGE, { id });
    return mapPage(data.page);
  }
  if (type === 'product') {
    const id = isGid ? rawId : toGid('Product', rawId);
    const data = await shopifyGraphQL(site, GET_PRODUCT, { id });
    return mapProduct(data.product);
  }
  if (type === 'article') {
    const id = isGid ? rawId : toGid('OnlineStoreArticle', rawId);
    const data = await shopifyGraphQL(site, GET_ARTICLE, { id });
    return mapArticle(data.article);
  }
  // Metaobject
  const id = isGid ? rawId : toGid('Metaobject', rawId);
  const data = await shopifyGraphQL(site, GET_METAOBJECT, { id });
  return mapMetaobject(data.metaobject);
}

export async function getPostBySlug(site, postType, slug) {
  const type = normalizeType(postType);
  if (type === 'page') {
    const data = await shopifyGraphQL(site, BY_HANDLE_PAGE, { handle: slug });
    return mapPage(data.pageByHandle);
  }
  if (type === 'product') {
    const data = await shopifyGraphQL(site, BY_HANDLE_PRODUCT, { handle: slug });
    return mapProduct(data.productByHandle);
  }
  // Articles + metaobjects - no byHandle query; fall back to list-scan.
  const listed = await getPosts(site, postType, 1, MAX_PAGE);
  return listed.items.find((i) => i.slug === slug) || null;
}

// ─── write path (create / update / delete) ─────────────────────────────

const CREATE_PAGE = `
  mutation PageCreate($page: PageCreateInput!) {
    pageCreate(page: $page) {
      page {
        id handle title body isPublished publishedAt updatedAt createdAt
        onlineStoreUrl seo { title description }
      }
      userErrors { field message code }
    }
  }
`;

const UPDATE_PAGE = `
  mutation PageUpdate($id: ID!, $page: PageUpdateInput!) {
    pageUpdate(id: $id, page: $page) {
      page {
        id handle title body isPublished publishedAt updatedAt
        onlineStoreUrl seo { title description }
      }
      userErrors { field message code }
    }
  }
`;

const DELETE_PAGE = `
  mutation PageDelete($id: ID!) {
    pageDelete(id: $id) {
      deletedPageId
      userErrors { field message code }
    }
  }
`;

const CREATE_PRODUCT = `
  mutation ProductCreate($input: ProductInput!) {
    productCreate(input: $input) {
      product {
        id handle title descriptionHtml vendor productType status
        publishedAt updatedAt createdAt onlineStoreUrl totalInventory tags
        featuredImage { url altText }
        seo { title description }
      }
      userErrors { field message code }
    }
  }
`;

const UPDATE_PRODUCT = `
  mutation ProductUpdate($input: ProductInput!) {
    productUpdate(input: $input) {
      product {
        id handle title descriptionHtml vendor productType status
        publishedAt updatedAt onlineStoreUrl totalInventory tags
        featuredImage { url altText }
        seo { title description }
      }
      userErrors { field message code }
    }
  }
`;

const DELETE_PRODUCT = `
  mutation ProductDelete($input: ProductDeleteInput!) {
    productDelete(input: $input) {
      deletedProductId
      userErrors { field message code }
    }
  }
`;

const CREATE_ARTICLE = `
  mutation ArticleCreate($article: ArticleCreateInput!) {
    articleCreate(article: $article) {
      article {
        id handle title body summary isPublished publishedAt updatedAt
        onlineStoreUrl tags
        author { name }
        image { url altText }
        blog { id handle title }
        seo { title description }
      }
      userErrors { field message code }
    }
  }
`;

const UPDATE_ARTICLE = `
  mutation ArticleUpdate($id: ID!, $article: ArticleUpdateInput!) {
    articleUpdate(id: $id, article: $article) {
      article {
        id handle title body summary isPublished publishedAt updatedAt
        onlineStoreUrl tags
        author { name }
        image { url altText }
        blog { id handle title }
        seo { title description }
      }
      userErrors { field message code }
    }
  }
`;

const DELETE_ARTICLE = `
  mutation ArticleDelete($id: ID!) {
    articleDelete(id: $id) {
      deletedArticleId
      userErrors { field message code }
    }
  }
`;

const FIRST_BLOG = `
  query FirstBlog { blogs(first: 1) { edges { node { id handle title } } } }
`;

const CREATE_METAOBJECT = `
  mutation MetaobjectCreate($metaobject: MetaobjectCreateInput!) {
    metaobjectCreate(metaobject: $metaobject) {
      metaobject {
        id handle type displayName updatedAt
        fields { key value type }
      }
      userErrors { field message code }
    }
  }
`;

const UPDATE_METAOBJECT = `
  mutation MetaobjectUpdate($id: ID!, $metaobject: MetaobjectUpdateInput!) {
    metaobjectUpdate(id: $id, metaobject: $metaobject) {
      metaobject {
        id handle type displayName updatedAt
        fields { key value type }
      }
      userErrors { field message code }
    }
  }
`;

const DELETE_METAOBJECT = `
  mutation MetaobjectDelete($id: ID!) {
    metaobjectDelete(id: $id) {
      deletedId
      userErrors { field message code }
    }
  }
`;

function throwIfErrors(label, errors) {
  if (errors && errors.length) {
    throw new Error(`[shopify] ${label}: ${errors.map((e) => e.message).join('; ')}`);
  }
}

/**
 * Build the Shopify input from a WP-style payload. WP-shaped fields:
 *   { title, content, excerpt, slug, status, tags, categories, featured_image, seo, meta }
 * We translate into per-resource inputs without leaking unknown keys.
 */
function buildPageInput(payload, { isUpdate = false } = {}) {
  const out = {};
  if (payload.title !== undefined) out.title = payload.title;
  if (payload.slug !== undefined) out.handle = payload.slug;
  if (payload.content !== undefined) out.body = payload.content;
  if (payload.status !== undefined) out.isPublished = payload.status === 'publish';
  if (payload.seo) {
    out.seo = {
      title: payload.seo.title ?? null,
      description: payload.seo.description ?? null,
    };
  }
  // PageCreateInput requires title; PageUpdateInput leaves it optional.
  if (!isUpdate && !out.title) out.title = 'Untitled';
  return out;
}

function buildProductInput(payload) {
  const out = {};
  if (payload.title !== undefined) out.title = payload.title;
  if (payload.slug !== undefined) out.handle = payload.slug;
  if (payload.content !== undefined) out.descriptionHtml = payload.content;
  if (payload.status !== undefined) {
    out.status = payload.status === 'publish' ? 'ACTIVE' : payload.status === 'draft' ? 'DRAFT' : 'ARCHIVED';
  }
  if (Array.isArray(payload.tags)) out.tags = payload.tags;
  if (payload.vendor !== undefined) out.vendor = payload.vendor;
  if (payload.productType !== undefined) out.productType = payload.productType;
  if (payload.seo) {
    out.seo = {
      title: payload.seo.title ?? null,
      description: payload.seo.description ?? null,
    };
  }
  return out;
}

function buildArticleInput(payload, blogId) {
  const out = {};
  if (blogId) out.blogId = blogId;
  if (payload.title !== undefined) out.title = payload.title;
  if (payload.slug !== undefined) out.handle = payload.slug;
  if (payload.content !== undefined) out.body = payload.content;
  if (payload.excerpt !== undefined) out.summary = payload.excerpt;
  if (payload.status !== undefined) out.isPublished = payload.status === 'publish';
  if (Array.isArray(payload.tags)) out.tags = payload.tags;
  if (payload.author) out.author = { name: typeof payload.author === 'string' ? payload.author : payload.author.name };
  if (payload.featured_image || payload.featuredImage) {
    const url = payload.featured_image || payload.featuredImage;
    out.image = { src: url, altText: payload.alt || null };
  }
  if (payload.seo) {
    out.seo = {
      title: payload.seo.title ?? null,
      description: payload.seo.description ?? null,
    };
  }
  return out;
}

function buildMetaobjectInput(payload, type) {
  const fields = Object.entries(payload.fields || payload.meta || payload.acf || {}).map(([key, value]) => ({
    key,
    value: typeof value === 'object' ? JSON.stringify(value) : String(value ?? ''),
  }));
  return {
    type,
    handle: payload.slug || payload.handle || undefined,
    fields,
  };
}

async function getOrThrowFirstBlogId(site) {
  const data = await shopifyGraphQL(site, FIRST_BLOG);
  const node = data.blogs?.edges?.[0]?.node;
  if (!node) throw new Error('[shopify] createPost: no blog exists. Create one in Shopify admin first.');
  return node.id;
}

export async function createPost(site, postType, payload = {}) {
  const type = normalizeType(postType);

  if (type === 'page') {
    const data = await shopifyGraphQL(site, CREATE_PAGE, {
      page: buildPageInput(payload),
    });
    throwIfErrors('pageCreate', data.pageCreate?.userErrors);
    return mapPage(data.pageCreate?.page);
  }
  if (type === 'product') {
    const data = await shopifyGraphQL(site, CREATE_PRODUCT, {
      input: buildProductInput(payload),
    });
    throwIfErrors('productCreate', data.productCreate?.userErrors);
    return mapProduct(data.productCreate?.product);
  }
  if (type === 'article') {
    const blogId = payload.blogId || (await getOrThrowFirstBlogId(site));
    const data = await shopifyGraphQL(site, CREATE_ARTICLE, {
      article: buildArticleInput(payload, blogId),
    });
    throwIfErrors('articleCreate', data.articleCreate?.userErrors);
    return mapArticle(data.articleCreate?.article);
  }
  // Metaobject
  const data = await shopifyGraphQL(site, CREATE_METAOBJECT, {
    metaobject: buildMetaobjectInput(payload, type),
  });
  throwIfErrors('metaobjectCreate', data.metaobjectCreate?.userErrors);
  return mapMetaobject(data.metaobjectCreate?.metaobject);
}

export async function updatePost(site, postType, postId, payload = {}) {
  const type = normalizeType(postType);
  const rawId = String(postId);
  const isGid = rawId.startsWith('gid://shopify/');

  if (type === 'page') {
    const id = isGid ? rawId : toGid('OnlineStorePage', rawId);
    const data = await shopifyGraphQL(site, UPDATE_PAGE, {
      id,
      page: buildPageInput(payload, { isUpdate: true }),
    });
    throwIfErrors('pageUpdate', data.pageUpdate?.userErrors);
    return mapPage(data.pageUpdate?.page);
  }
  if (type === 'product') {
    const id = isGid ? rawId : toGid('Product', rawId);
    const input = { id, ...buildProductInput(payload) };
    const data = await shopifyGraphQL(site, UPDATE_PRODUCT, { input });
    throwIfErrors('productUpdate', data.productUpdate?.userErrors);
    return mapProduct(data.productUpdate?.product);
  }
  if (type === 'article') {
    const id = isGid ? rawId : toGid('OnlineStoreArticle', rawId);
    // ArticleUpdateInput doesn't accept blogId - only on create.
    const article = buildArticleInput(payload, null);
    delete article.blogId;
    const data = await shopifyGraphQL(site, UPDATE_ARTICLE, { id, article });
    throwIfErrors('articleUpdate', data.articleUpdate?.userErrors);
    return mapArticle(data.articleUpdate?.article);
  }
  // Metaobject
  const id = isGid ? rawId : toGid('Metaobject', rawId);
  const fields = Object.entries(payload.fields || payload.meta || payload.acf || {}).map(([key, value]) => ({
    key,
    value: typeof value === 'object' ? JSON.stringify(value) : String(value ?? ''),
  }));
  const data = await shopifyGraphQL(site, UPDATE_METAOBJECT, {
    id,
    metaobject: { handle: payload.slug || payload.handle, fields },
  });
  throwIfErrors('metaobjectUpdate', data.metaobjectUpdate?.userErrors);
  return mapMetaobject(data.metaobjectUpdate?.metaobject);
}

export async function deletePost(site, postType, postId) {
  const type = normalizeType(postType);
  const rawId = String(postId);
  const isGid = rawId.startsWith('gid://shopify/');

  if (type === 'page') {
    const id = isGid ? rawId : toGid('OnlineStorePage', rawId);
    const data = await shopifyGraphQL(site, DELETE_PAGE, { id });
    throwIfErrors('pageDelete', data.pageDelete?.userErrors);
    return { deleted: data.pageDelete?.deletedPageId };
  }
  if (type === 'product') {
    const id = isGid ? rawId : toGid('Product', rawId);
    const data = await shopifyGraphQL(site, DELETE_PRODUCT, { input: { id } });
    throwIfErrors('productDelete', data.productDelete?.userErrors);
    return { deleted: data.productDelete?.deletedProductId };
  }
  if (type === 'article') {
    const id = isGid ? rawId : toGid('OnlineStoreArticle', rawId);
    const data = await shopifyGraphQL(site, DELETE_ARTICLE, { id });
    throwIfErrors('articleDelete', data.articleDelete?.userErrors);
    return { deleted: data.articleDelete?.deletedArticleId };
  }
  const id = isGid ? rawId : toGid('Metaobject', rawId);
  const data = await shopifyGraphQL(site, DELETE_METAOBJECT, { id });
  throwIfErrors('metaobjectDelete', data.metaobjectDelete?.userErrors);
  return { deleted: data.metaobjectDelete?.deletedId };
}

// exported for unit tests if needed
export const __internals = { mapArticle, mapPage, mapProduct, mapMetaobject, normalizeType };
