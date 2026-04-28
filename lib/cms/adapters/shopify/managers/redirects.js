/**
 * Shopify redirects manager
 *
 * Shopify has first-class URL redirects (UrlRedirect) - no plugin detection
 * needed. Surface matches the WP redirect shape: { id, source, target, code }.
 * Shopify redirects are always 301 (no code choice exposed by API).
 */

import { shopifyGraphQL } from '../client';
import { gidNumericId, toGid } from '../gid';

const LIST_REDIRECTS = `
  query ListRedirects($first: Int!, $after: String, $query: String) {
    urlRedirects(first: $first, after: $after, query: $query) {
      edges { cursor node { id path target } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const CREATE_REDIRECT = `
  mutation UrlRedirectCreate($urlRedirect: UrlRedirectInput!) {
    urlRedirectCreate(urlRedirect: $urlRedirect) {
      urlRedirect { id path target }
      userErrors { field message code }
    }
  }
`;

const UPDATE_REDIRECT = `
  mutation UrlRedirectUpdate($id: ID!, $urlRedirect: UrlRedirectInput!) {
    urlRedirectUpdate(id: $id, urlRedirect: $urlRedirect) {
      urlRedirect { id path target }
      userErrors { field message code }
    }
  }
`;

const DELETE_REDIRECT = `
  mutation UrlRedirectDelete($id: ID!) {
    urlRedirectDelete(id: $id) {
      deletedUrlRedirectId
      userErrors { field message code }
    }
  }
`;

const BULK_CREATE = `
  mutation UrlRedirectImportSubmit($input: [UrlRedirectInput!]!) {
    urlRedirectBulkDeleteAll { job { id } userErrors { message } }
  }
`;

function mapRedirect(node) {
  if (!node) return null;
  return {
    id: gidNumericId(node.id),
    gid: node.id,
    source: node.path,
    from: node.path,
    target: node.target,
    to: node.target,
    code: 301,
    statusCode: 301,
    enabled: true,
  };
}

export async function getRedirects(site, page = 1, perPage = 100, search = null) {
  const first = Math.min(perPage, 250);
  let after = null;
  let currentPage = 0;
  const query = search ? `path:*${search}* OR target:*${search}*` : null;

  while (currentPage < page) {
    const data = await shopifyGraphQL(site, LIST_REDIRECTS, { first, after, query });
    currentPage += 1;
    const { edges, pageInfo } = data.urlRedirects;
    if (currentPage === page) {
      const items = edges.map((e) => mapRedirect(e.node));
      const hasNext = !!pageInfo?.hasNextPage;
      return {
        items,
        total: hasNext ? currentPage * perPage + 1 : currentPage * perPage,
        pages: hasNext ? currentPage + 1 : currentPage,
        page: currentPage,
        _cursor: pageInfo?.endCursor || null,
      };
    }
    if (!pageInfo.hasNextPage) return { items: [], total: 0, pages: currentPage, page };
    after = pageInfo.endCursor;
  }
  return { items: [], total: 0, pages: 0, page };
}

export async function createRedirect(site, { source, target, code }) {
  if (code && code !== 301) {
    // Shopify only supports 301; we accept the field but ignore non-301 codes.
  }
  const data = await shopifyGraphQL(site, CREATE_REDIRECT, {
    urlRedirect: { path: source, target },
  });
  const errors = data.urlRedirectCreate?.userErrors || [];
  if (errors.length) throw new Error(`[shopify] urlRedirectCreate: ${errors.map((e) => e.message).join('; ')}`);
  return mapRedirect(data.urlRedirectCreate?.urlRedirect);
}

export async function updateRedirect(site, redirectId, { source, target }) {
  const rawId = String(redirectId);
  const id = rawId.startsWith('gid://shopify/') ? rawId : toGid('UrlRedirect', rawId);
  const data = await shopifyGraphQL(site, UPDATE_REDIRECT, {
    id,
    urlRedirect: { path: source, target },
  });
  const errors = data.urlRedirectUpdate?.userErrors || [];
  if (errors.length) throw new Error(`[shopify] urlRedirectUpdate: ${errors.map((e) => e.message).join('; ')}`);
  return mapRedirect(data.urlRedirectUpdate?.urlRedirect);
}

export async function deleteRedirect(site, redirectId) {
  const rawId = String(redirectId);
  const id = rawId.startsWith('gid://shopify/') ? rawId : toGid('UrlRedirect', rawId);
  const data = await shopifyGraphQL(site, DELETE_REDIRECT, { id });
  const errors = data.urlRedirectDelete?.userErrors || [];
  if (errors.length) throw new Error(`[shopify] urlRedirectDelete: ${errors.map((e) => e.message).join('; ')}`);
  return { deleted: data.urlRedirectDelete?.deletedUrlRedirectId };
}

/**
 * Bulk sync - accepts the platform's existing { redirects: [{source,target,code}] }
 * payload and issues individual creates. Shopify has a bulk CSV import endpoint,
 * but the GraphQL bulk mutation only supports bulk delete; per-row creates are
 * the pragmatic path for <500 entries.
 */
export async function bulkSyncRedirects(site, { redirects = [], overwrite = false }) {
  const created = [];
  const failed = [];

  if (overwrite) {
    // Fetch and delete existing redirects. Paged walk.
    let cursor = null;
    const first = 250;
    while (true) {
      const data = await shopifyGraphQL(site, LIST_REDIRECTS, {
        first,
        after: cursor,
        query: null,
      });
      const { edges, pageInfo } = data.urlRedirects;
      for (const e of edges) {
        try {
          await shopifyGraphQL(site, DELETE_REDIRECT, { id: e.node.id });
        } catch (err) {
          failed.push({ id: e.node.id, error: err.message });
        }
      }
      if (!pageInfo?.hasNextPage) break;
      cursor = pageInfo.endCursor;
    }
  }

  for (const r of redirects) {
    try {
      const item = await createRedirect(site, r);
      created.push(item);
    } catch (err) {
      failed.push({ source: r.source, error: err.message });
    }
  }
  return { created: created.length, failed: failed.length, items: created, errors: failed };
}

/** Alias - same behavior as bulkSync with overwrite:false. */
export async function importRedirects(site, { redirects = [] }) {
  return bulkSyncRedirects(site, { redirects, overwrite: false });
}

/**
 * Plugin detection is a WordPress concept (Redirection, Rank Math, etc).
 * Shopify's redirects are first-class - report a single synthetic "native"
 * provider so the UI can render an appropriate card.
 */
export async function getDetectedRedirectPlugins(_site) {
  return {
    backend: 'shopify',
    detected: [
      {
        slug: 'shopify-native',
        name: 'Shopify URL Redirects',
        version: null,
        active: true,
        native: true,
      },
    ],
    active: 'shopify-native',
  };
}

void BULK_CREATE;
