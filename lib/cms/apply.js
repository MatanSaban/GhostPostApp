/**
 * applyChange — the single choke point for every write to a site.
 *
 * Instead of calling `cms.createPost(...)` directly and hoping the platform can
 * write, callers route writes through `applyChange`. It asks the site's active
 * adapter "can you do this natively?" and either performs the write or returns
 * an `assisted` result so the caller hands off to the manual path (paste-ready
 * snippet, redirect/host config, instructions) — never silently succeeding.
 *
 * This is what ends the old "PUBLISHED but wrote nothing" behavior for
 * non-WordPress sites: an adapter that can't natively write reports `assisted`,
 * and the caller surfaces the generated change for the user to apply.
 *
 *     const res = await applyChange(site, 'createPost', ['post', data], { manualKinds: ['snippet'] });
 *     if (res.mode === 'native') { …persist res.result… }
 *     else { …surface assisted output (res.manualKinds)… }
 *
 * By default the adapter method equals `changeType`; pass `{ method }` to
 * override (e.g. a logical change that maps to a differently-named method).
 *
 * Server-only (imports the registry, which imports adapters).
 */

import { cms } from './index';
import { getRegistryEntry } from './registry';

/**
 * Whether the site's active adapter can natively perform `changeType`.
 * True when the adapter opts in via `supportsWrite`, or exposes a real method
 * that isn't tagged `__notSupported` (the marker adapters use for
 * assisted-only writes).
 *
 * @param {object} site
 * @param {string} changeType
 * @param {{ method?: string }} [opts]
 * @returns {boolean}
 */
export function canApplyNatively(site, changeType, { method } = {}) {
  const { adapter } = getRegistryEntry(site);
  if (typeof adapter.supportsWrite === 'function' && adapter.supportsWrite(changeType, site)) {
    return true;
  }
  const fn = adapter[method || changeType];
  return typeof fn === 'function' && !fn.__notSupported;
}

/**
 * Perform a write, or report that it must be applied manually.
 *
 * @param {object} site
 * @param {string} changeType   logical change / adapter method name
 * @param {any[]}  [args]       args passed to the adapter method after `site`
 * @param {{ manualKinds?: string[], method?: string }} [options]
 * @returns {Promise<{
 *   applied: boolean,
 *   mode: 'native'|'assisted'|'error',
 *   changeType: string,
 *   result?: any,
 *   error?: string,
 *   manualKinds?: string[],
 *   capabilities?: object,
 * }>}
 */
export async function applyChange(site, changeType, args = [], options = {}) {
  const { manualKinds, method } = options;
  const { capabilities } = getRegistryEntry(site);
  const kinds = manualKinds && manualKinds.length ? manualKinds : ['instructions'];

  if (!canApplyNatively(site, changeType, { method })) {
    return { applied: false, mode: 'assisted', changeType, manualKinds: kinds, capabilities };
  }

  try {
    const result = await cms[method || changeType](site, ...args);
    return { applied: true, mode: 'native', changeType, result };
  } catch (err) {
    // An adapter that raised a tagged "assisted" error just means: no native
    // path — degrade gracefully. Any other error is a real failure.
    if (err?.assisted || err?.code === 'NATIVE_WRITE_UNAVAILABLE') {
      return { applied: false, mode: 'assisted', changeType, manualKinds: kinds, capabilities };
    }
    return { applied: false, mode: 'error', changeType, error: err?.message || String(err), manualKinds: kinds };
  }
}
