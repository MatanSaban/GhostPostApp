/**
 * Shopify taxonomy manager
 *
 * Shopify has no tag/category taxonomies in the WordPress sense. Closest
 * analogs:
 *   - Product tags (freeform strings on product.tags)
 *   - Collections (manual or smart groups of products — closer to categories)
 *   - Blogs (each article belongs to a Blog — analog to a post category)
 *
 * We surface three synthetic "taxonomies":
 *   - `product_tag`  — aggregated from products.tags (read-only; created implicitly)
 *   - `product_cat`  — Shopify Collections
 *   - `blog`         — Shopify Blogs (article parent)
 */

import { shopifyGraphQL } from '../client';
import { gidNumericId, toGid } from '../gid';

const LIST_COLLECTIONS = `
  query ListCollections($first: Int!, $after: String) {
    collections(first: $first, after: $after, sortKey: UPDATED_AT, reverse: true) {
      edges { cursor node {
        id handle title descriptionHtml updatedAt
        productsCount
        image { url altText }
      } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const LIST_BLOGS = `
  query ListBlogs($first: Int!, $after: String) {
    blogs(first: $first, after: $after) {
      edges { cursor node { id handle title commentPolicy feedburner feedburnerLocation } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const LIST_PRODUCT_TAGS = `
  query ListProductTags($first: Int!) {
    productTags(first: $first) {
      edges { node }
    }
  }
`;

const CREATE_COLLECTION = `
  mutation CollectionCreate($input: CollectionInput!) {
    collectionCreate(input: $input) {
      collection { id handle title descriptionHtml }
      userErrors { field message }
    }
  }
`;

const UPDATE_COLLECTION = `
  mutation CollectionUpdate($input: CollectionInput!) {
    collectionUpdate(input: $input) {
      collection { id handle title descriptionHtml }
      userErrors { field message }
    }
  }
`;

const DELETE_COLLECTION = `
  mutation CollectionDelete($input: CollectionDeleteInput!) {
    collectionDelete(input: $input) {
      deletedCollectionId
      userErrors { field message }
    }
  }
`;

const CREATE_BLOG = `
  mutation BlogCreate($blog: BlogCreateInput!) {
    blogCreate(blog: $blog) {
      blog { id handle title }
      userErrors { field message }
    }
  }
`;

function mapCollection(node) {
  if (!node) return null;
  return {
    id: gidNumericId(node.id),
    gid: node.id,
    taxonomy: 'product_cat',
    name: node.title,
    slug: node.handle,
    description: node.descriptionHtml || '',
    count: node.productsCount || 0,
    parent: 0,
    image: node.image?.url || null,
  };
}

function mapBlog(node) {
  if (!node) return null;
  return {
    id: gidNumericId(node.id),
    gid: node.id,
    taxonomy: 'blog',
    name: node.title,
    slug: node.handle,
    description: '',
    count: 0,
    parent: 0,
  };
}

function mapTag(tag) {
  return {
    id: encodeURIComponent(tag),
    gid: null,
    taxonomy: 'product_tag',
    name: tag,
    slug: tag.toLowerCase().replace(/\s+/g, '-'),
    description: '',
    count: 0,
    parent: 0,
  };
}

export async function getTaxonomies(_site) {
  return [
    {
      slug: 'product_cat',
      name: 'Collections',
      singularName: 'Collection',
      restBase: 'collections',
      hierarchical: true,
      objectTypes: ['product'],
    },
    {
      slug: 'product_tag',
      name: 'Product Tags',
      singularName: 'Product Tag',
      restBase: 'product_tags',
      hierarchical: false,
      objectTypes: ['product'],
    },
    {
      slug: 'blog',
      name: 'Blogs',
      singularName: 'Blog',
      restBase: 'blogs',
      hierarchical: false,
      objectTypes: ['post'],
    },
  ];
}

async function listCollections(site, page, perPage) {
  const first = Math.min(perPage, 250);
  let after = null;
  let currentPage = 0;
  while (currentPage < page) {
    const data = await shopifyGraphQL(site, LIST_COLLECTIONS, { first, after });
    currentPage += 1;
    const { edges, pageInfo } = data.collections;
    if (currentPage === page) {
      const hasNext = !!pageInfo.hasNextPage;
      return {
        items: edges.map((e) => mapCollection(e.node)),
        total: hasNext ? currentPage * perPage + 1 : currentPage * perPage,
        pages: hasNext ? currentPage + 1 : currentPage,
        page: currentPage,
      };
    }
    if (!pageInfo.hasNextPage) return { items: [], total: 0, pages: currentPage, page };
    after = pageInfo.endCursor;
  }
  return { items: [], total: 0, pages: 0, page };
}

async function listBlogs(site, page, perPage) {
  const first = Math.min(perPage, 250);
  let after = null;
  let currentPage = 0;
  while (currentPage < page) {
    const data = await shopifyGraphQL(site, LIST_BLOGS, { first, after });
    currentPage += 1;
    const { edges, pageInfo } = data.blogs;
    if (currentPage === page) {
      const hasNext = !!pageInfo.hasNextPage;
      return {
        items: edges.map((e) => mapBlog(e.node)),
        total: hasNext ? currentPage * perPage + 1 : currentPage * perPage,
        pages: hasNext ? currentPage + 1 : currentPage,
        page: currentPage,
      };
    }
    if (!pageInfo.hasNextPage) return { items: [], total: 0, pages: currentPage, page };
    after = pageInfo.endCursor;
  }
  return { items: [], total: 0, pages: 0, page };
}

async function listProductTags(site, page = 1, perPage = 250) {
  // Shopify caps productTags at 250 and has no cursor. Emulate paging client-side.
  const data = await shopifyGraphQL(site, LIST_PRODUCT_TAGS, { first: 250 });
  const all = (data.productTags?.edges || []).map((e) => e.node);
  const start = (page - 1) * perPage;
  const slice = all.slice(start, start + perPage);
  return {
    items: slice.map(mapTag),
    total: all.length,
    pages: Math.max(1, Math.ceil(all.length / perPage)),
    page,
  };
}

export async function getTaxonomyTerms(site, taxonomy, page = 1, perPage = 100) {
  const t = (taxonomy || '').toLowerCase();
  if (t === 'product_cat' || t === 'category' || t === 'categories' || t === 'collection' || t === 'collections') {
    return listCollections(site, page, perPage);
  }
  if (t === 'blog' || t === 'blogs') {
    return listBlogs(site, page, perPage);
  }
  if (t === 'product_tag' || t === 'post_tag' || t === 'tag' || t === 'tags') {
    return listProductTags(site, page, perPage);
  }
  return { items: [], total: 0, pages: 0, page };
}

/** Alias used by some callers. */
export async function listTerms(site, taxonomy, page = 1, perPage = 100) {
  return getTaxonomyTerms(site, taxonomy, page, perPage);
}

export async function createTerm(site, taxonomy, { name, slug, description, parent } = {}) {
  const t = (taxonomy || '').toLowerCase();
  if (t === 'product_cat' || t === 'collection' || t === 'collections') {
    const data = await shopifyGraphQL(site, CREATE_COLLECTION, {
      input: { title: name, handle: slug, descriptionHtml: description || '' },
    });
    const errors = data.collectionCreate?.userErrors || [];
    if (errors.length) throw new Error(`[shopify] collectionCreate: ${errors.map((e) => e.message).join('; ')}`);
    return mapCollection(data.collectionCreate?.collection);
  }
  if (t === 'blog' || t === 'blogs') {
    const data = await shopifyGraphQL(site, CREATE_BLOG, {
      blog: { title: name, handle: slug },
    });
    const errors = data.blogCreate?.userErrors || [];
    if (errors.length) throw new Error(`[shopify] blogCreate: ${errors.map((e) => e.message).join('; ')}`);
    return mapBlog(data.blogCreate?.blog);
  }
  if (t === 'product_tag' || t === 'tag' || t === 'tags') {
    // Tags are created implicitly when added to a product; return a synthetic term.
    return mapTag(name);
  }
  throw new Error(`[shopify] createTerm: unsupported taxonomy "${taxonomy}"`);
}

export async function updateTerm(site, taxonomy, termId, { name, slug, description } = {}) {
  const t = (taxonomy || '').toLowerCase();
  const rawId = String(termId);
  const isGid = rawId.startsWith('gid://shopify/');

  if (t === 'product_cat' || t === 'collection' || t === 'collections') {
    const id = isGid ? rawId : toGid('Collection', rawId);
    const data = await shopifyGraphQL(site, UPDATE_COLLECTION, {
      input: { id, title: name, handle: slug, descriptionHtml: description },
    });
    const errors = data.collectionUpdate?.userErrors || [];
    if (errors.length) throw new Error(`[shopify] collectionUpdate: ${errors.map((e) => e.message).join('; ')}`);
    return mapCollection(data.collectionUpdate?.collection);
  }
  throw new Error(`[shopify] updateTerm: taxonomy "${taxonomy}" is read-only`);
}

export async function deleteTerm(site, taxonomy, termId) {
  const t = (taxonomy || '').toLowerCase();
  const rawId = String(termId);
  const isGid = rawId.startsWith('gid://shopify/');

  if (t === 'product_cat' || t === 'collection' || t === 'collections') {
    const id = isGid ? rawId : toGid('Collection', rawId);
    const data = await shopifyGraphQL(site, DELETE_COLLECTION, { input: { id } });
    const errors = data.collectionDelete?.userErrors || [];
    if (errors.length) throw new Error(`[shopify] collectionDelete: ${errors.map((e) => e.message).join('; ')}`);
    return { deleted: data.collectionDelete?.deletedCollectionId };
  }
  throw new Error(`[shopify] deleteTerm: taxonomy "${taxonomy}" is not deletable via API`);
}
