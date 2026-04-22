/**
 * Shopify metafields manager
 *
 * Shopify metafields are the closest analog to WordPress ACF / post meta.
 * A metafield is keyed by (ownerResource, namespace, key) and typed
 * (single_line_text_field, number_integer, json, file_reference, etc).
 *
 * We surface metafields under the `acf` key for shape compatibility with
 * WP's ACF endpoint, and under `meta` for parity with post meta. The
 * manager accepts plain object blobs keyed by metafield key and writes
 * them to the "custom" namespace unless a fully-qualified "ns.key" is
 * used on input.
 */

import { shopifyGraphQL } from '../client';
import { toGid } from '../gid';

const GET_METAFIELDS = `
  query GetMetafields($id: ID!, $first: Int!, $namespace: String) {
    node(id: $id) {
      id
      ... on HasMetafields {
        metafields(first: $first, namespace: $namespace) {
          edges { node { id namespace key value type } }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`;

const METAFIELDS_SET = `
  mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id namespace key value type }
      userErrors { field message code }
    }
  }
`;

const METAFIELD_DELETE = `
  mutation MetafieldDelete($input: MetafieldDeleteInput!) {
    metafieldDelete(input: $input) {
      deletedId
      userErrors { field message }
    }
  }
`;

function resolveOwnerGid(postType, postId) {
  const t = (postType || 'post').toLowerCase();
  const rawId = String(postId);
  const isGid = rawId.startsWith('gid://shopify/');
  if (isGid) return rawId;
  if (t === 'page' || t === 'pages') return toGid('OnlineStorePage', rawId);
  if (t === 'product' || t === 'products') return toGid('Product', rawId);
  if (t === 'article' || t === 'post' || t === 'posts') return toGid('OnlineStoreArticle', rawId);
  if (t === 'customer' || t === 'customers') return toGid('Customer', rawId);
  if (t === 'collection' || t === 'collections') return toGid('Collection', rawId);
  if (t === 'shop') return toGid('Shop', rawId || '1');
  // Fallback to metaobject
  return toGid('Metaobject', rawId);
}

function parseKey(input) {
  // Accept "namespace.key" or plain "key" (defaults to namespace:"custom").
  if (input.includes('.')) {
    const idx = input.indexOf('.');
    return { namespace: input.slice(0, idx), key: input.slice(idx + 1) };
  }
  return { namespace: 'custom', key: input };
}

function inferType(value) {
  if (value === null || value === undefined) return 'single_line_text_field';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'number_integer' : 'number_decimal';
  }
  if (typeof value === 'object') return 'json';
  if (typeof value === 'string') {
    if (value.length > 255 || value.includes('\n')) return 'multi_line_text_field';
  }
  return 'single_line_text_field';
}

function serializeValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function parseMetafieldValue(node) {
  if (!node) return null;
  const { value, type } = node;
  if (value == null) return null;
  if (type === 'number_integer') return parseInt(value, 10);
  if (type === 'number_decimal') return parseFloat(value);
  if (type === 'boolean') return value === 'true';
  if (type === 'json' || type?.startsWith('list.')) {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}

export async function getAcfFields(site, postType, postId, namespace = null) {
  const id = resolveOwnerGid(postType, postId);
  // Walk paged metafields — typical record has <50, so one page is usually enough.
  const edges = [];
  let after = null;
  do {
    const data = await shopifyGraphQL(site, GET_METAFIELDS, {
      id,
      first: 50,
      namespace,
    });
    const mfs = data.node?.metafields;
    if (!mfs) break;
    edges.push(...(mfs.edges || []));
    if (!mfs.pageInfo?.hasNextPage) break;
    after = mfs.pageInfo.endCursor;
  } while (after);

  const fields = {};
  const detailed = {};
  for (const { node } of edges) {
    const parsed = parseMetafieldValue(node);
    fields[node.key] = parsed;
    detailed[`${node.namespace}.${node.key}`] = {
      id: node.id,
      namespace: node.namespace,
      key: node.key,
      type: node.type,
      value: parsed,
    };
  }
  return { fields, detailed };
}

export async function updateAcfFields(site, postType, postId, updates = {}) {
  const ownerId = resolveOwnerGid(postType, postId);
  const metafields = Object.entries(updates).map(([k, v]) => {
    const { namespace, key } = parseKey(k);
    const type = v && typeof v === 'object' && v.__type ? v.__type : inferType(v);
    const rawValue = v && typeof v === 'object' && '__value' in (v || {}) ? v.__value : v;
    return {
      ownerId,
      namespace,
      key,
      type,
      value: serializeValue(rawValue),
    };
  });

  if (!metafields.length) return { fields: {} };

  const data = await shopifyGraphQL(site, METAFIELDS_SET, { metafields });
  const errors = data.metafieldsSet?.userErrors || [];
  if (errors.length) {
    throw new Error(`[shopify] metafieldsSet: ${errors.map((e) => e.message).join('; ')}`);
  }
  const written = {};
  for (const mf of data.metafieldsSet?.metafields || []) {
    written[mf.key] = parseMetafieldValue(mf);
  }
  return { fields: written };
}

/** Delete a metafield by namespace + key on a given owner. */
export async function deleteAcfField(site, postType, postId, namespaceDotKey) {
  const ownerId = resolveOwnerGid(postType, postId);
  const { namespace, key } = parseKey(namespaceDotKey);
  const data = await shopifyGraphQL(site, METAFIELD_DELETE, {
    input: { ownerId, namespace, key },
  });
  const errors = data.metafieldDelete?.userErrors || [];
  if (errors.length) throw new Error(`[shopify] metafieldDelete: ${errors.map((e) => e.message).join('; ')}`);
  return { deleted: data.metafieldDelete?.deletedId };
}
