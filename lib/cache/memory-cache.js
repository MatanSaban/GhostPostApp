/**
 * Per-instance in-memory TTL cache with stale-while-revalidate semantics.
 *
 * Use this ONLY for truly global, low-churn data that every Vercel Fluid
 * instance can safely hold its own copy of with a short TTL — admin-edited
 * config like plans, AI pricing, chat tool registry.
 *
 * Do NOT use this for per-user, per-site, or per-account data — that belongs
 * in `unstable_cache` where Vercel's Data Cache shares across instances and
 * supports tag-based invalidation.
 *
 * Design:
 *   - Map-backed. Key → { value, expiresAt, inflight }.
 *   - Returns the cached value until TTL expires, then refetches.
 *   - A single inflight refetch is coalesced so N concurrent callers don't
 *     all stampede the source (cheap prevention for the M10 Mongo).
 *   - No cross-instance coordination; each warm Fluid instance has its own.
 *     Acceptable for data that only changes via admin UI edits.
 */

const store = new Map();

/**
 * @param {string} key       unique cache key
 * @param {number} ttlMs     how long a value is considered fresh
 * @param {() => Promise<T>} loader  fetches a fresh value when stale/missing
 * @returns {Promise<T>}
 */
export async function memoGet(key, ttlMs, loader) {
  const now = Date.now();
  const entry = store.get(key);

  if (entry && entry.expiresAt > now) {
    return entry.value;
  }

  // Stampede prevention — if someone is already fetching, wait on their promise.
  if (entry?.inflight) {
    return entry.inflight;
  }

  const inflight = (async () => {
    try {
      const value = await loader();
      store.set(key, { value, expiresAt: Date.now() + ttlMs, inflight: null });
      return value;
    } catch (err) {
      // On failure, keep serving stale value if we have one; otherwise rethrow.
      if (entry) {
        // Mark inflight resolved so next call retries.
        store.set(key, { ...entry, inflight: null });
        return entry.value;
      }
      store.delete(key);
      throw err;
    }
  })();

  store.set(key, { value: entry?.value, expiresAt: entry?.expiresAt ?? 0, inflight });
  return inflight;
}

/** Force-drop a key (called on admin edit). */
export function memoInvalidate(key) {
  store.delete(key);
}

/** Drop all keys matching a prefix. */
export function memoInvalidatePrefix(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

/** Test/debug helper — clear the entire cache. */
export function memoClear() {
  store.clear();
}
