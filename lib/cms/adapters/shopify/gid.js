/**
 * Shopify GID helpers
 *
 * Shopify IDs are GIDs like "gid://shopify/Product/1234567890". Callers in
 * the platform pass plain numeric-style IDs to cms methods; these helpers
 * bridge the two conventions without leaking Shopify-ism to the caller.
 */

export function toGid(type, id) {
  if (typeof id === 'string' && id.startsWith('gid://shopify/')) return id;
  return `gid://shopify/${type}/${id}`;
}

export function fromGid(gid) {
  if (typeof gid !== 'string') return String(gid);
  const m = gid.match(/gid:\/\/shopify\/[^/]+\/(.+)$/);
  return m ? m[1] : gid;
}

/** Extract the numeric tail of a GID as a string (suitable for URLs/IDs). */
export function gidNumericId(gid) {
  const tail = fromGid(gid);
  const numeric = tail.replace(/[^0-9]/g, '');
  return numeric || tail;
}
