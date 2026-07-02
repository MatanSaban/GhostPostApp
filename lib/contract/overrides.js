/**
 * Contract override producers.
 *
 * When a user accepts an SEO change or redirect for a site that has NO native
 * write transport (custom / SDK / edge - the WordPress plugin writes directly
 * instead), we persist the *desired* value here so the Contract API serves it:
 *
 *   - SEO edits  → SiteSeoOverride (merged first in the resolver)
 *   - Redirects  → Redirection     (served by the Contract /redirects endpoint)
 *
 * The value is also handed to the user as a copy-ready snippet for immediate
 * manual application; persisting means it applies automatically the moment an
 * SDK / edge transport connects.
 */

import prisma from '@/lib/prisma';
import { normalizePath } from './resolver';

/**
 * Upsert the desired SEO for a path. No-op (reason returned) when the
 * SiteSeoOverride model isn't on the Prisma client yet (pre-regen).
 *
 * @param {string} siteId
 * @param {string} rawPath
 * @param {{ title?: string, description?: string, canonical?: string, robots?: string, ogImage?: string, jsonLd?: any }} patch
 * @returns {Promise<{ persisted: boolean, path?: string, reason?: string }>}
 */
export async function upsertSeoOverride(siteId, rawPath, patch = {}) {
  if (!siteId || typeof prisma.siteSeoOverride?.upsert !== 'function') {
    return { persisted: false, reason: 'overrides-unavailable' };
  }
  const path = normalizePath(rawPath);

  const data = {};
  for (const key of ['title', 'description', 'canonical', 'robots', 'ogImage']) {
    if (patch[key] != null && patch[key] !== '') data[key] = patch[key];
  }
  if (patch.jsonLd != null) data.jsonLd = patch.jsonLd;
  if (Object.keys(data).length === 0) {
    return { persisted: false, reason: 'nothing-to-persist' };
  }

  try {
    await prisma.siteSeoOverride.upsert({
      where: { siteId_path: { siteId, path } },
      update: data,
      create: { siteId, path, ...data },
    });
    return { persisted: true, path };
  } catch (err) {
    console.warn('[contract/overrides] upsertSeoOverride failed:', err.message);
    return { persisted: false, reason: err.message };
  }
}

/**
 * Upsert a redirect into the platform's Redirection table so the Contract
 * serves it. Keyed on (siteId, sourceUrl) - re-pointing an existing source
 * updates it.
 *
 * @param {string} siteId
 * @param {string} from - source path
 * @param {string} to - destination path or URL
 * @param {string} [type] - '301'|'302' or 'PERMANENT'|'TEMPORARY' (default 301)
 * @returns {Promise<{ persisted: boolean, source?: string, reason?: string }>}
 */
export async function upsertRedirectOverride(siteId, from, to, type = '301') {
  if (!siteId || !from || !to) {
    return { persisted: false, reason: 'missing-args' };
  }
  const source = normalizePath(from);
  const redirType = type === '302' || type === 'TEMPORARY' ? 'TEMPORARY' : 'PERMANENT';

  try {
    await prisma.redirection.upsert({
      where: { siteId_sourceUrl: { siteId, sourceUrl: source } },
      update: { targetUrl: to, type: redirType, isActive: true },
      create: { siteId, sourceUrl: source, targetUrl: to, type: redirType, isActive: true },
    });
    return { persisted: true, source };
  } catch (err) {
    console.warn('[contract/overrides] upsertRedirectOverride failed:', err.message);
    return { persisted: false, reason: err.message };
  }
}
