/**
 * Custom / generic CMS Adapter
 *
 * Backs every non-plugin, non-Shopify site: custom-coded, Lovable, Base44,
 * static, or unknown. There is no live write channel into these sites yet, so:
 *
 *   - READS return safe, empty-but-valid shapes (or DB-backed data from
 *     SiteEntity, which is populated by the platform-agnostic sitemap crawler).
 *     They never throw, so callers that expect a CMS never crash.
 *   - WRITES are tagged `__notSupported` so the `applyChange` choke point
 *     (lib/cms/apply.js) degrades them to the assisted/manual path (copy-paste
 *     snippet, redirect config, host instructions) instead of silently
 *     "succeeding" while nothing reaches the site.
 *
 * When a write transport is connected (SDK / edge proxy — later phases),
 * `supportsWrite()` starts returning true for the capabilities that transport
 * fulfils, and the corresponding methods get real implementations.
 *
 * Invoked via the cms dispatcher (see lib/cms/index.js).
 */

import prisma from '@/lib/prisma';
import { CUSTOM_CAPABILITIES } from '../../capabilities';
import { upsertSeoOverride, upsertRedirectOverride } from '@/lib/contract/overrides';
import { normalizePath } from '@/lib/contract/resolver';

export const capabilities = CUSTOM_CAPABILITIES;

// Writes the signed Contract can carry: the platform persists the desired
// state (SiteSeoOverride / Redirection) and the connected SDK / edge proxy
// serves it on the next cache refresh. "Applying" IS the persistence.
const CONTRACT_WRITE_TYPES = new Set([
  'updateSeoData',
  'createRedirect',
  'updateRedirect',
  'deleteRedirect',
]);

const CONTRACT_TRANSPORTS = new Set(['SDK', 'EDGE_PROXY']);

function hasContractTransport(site) {
  return (
    CONTRACT_TRANSPORTS.has(site?.integrationType) &&
    site?.connectionStatus === 'CONNECTED'
  );
}

/**
 * Throw the tagged assisted error when the site's transport kill switch is
 * engaged, so applyChange degrades to the manual path instead of persisting
 * state the paused transport won't serve.
 */
async function assertKillSwitchOff(site) {
  const paused = await prisma.siteIntegration.findFirst({
    where: { siteId: site.id, type: { in: [...CONTRACT_TRANSPORTS] }, killSwitch: true },
    select: { id: true },
  });
  if (paused) {
    throw Object.assign(
      new Error('[cms/custom] GhostSEO serving is paused for this site (kill switch).'),
      { code: 'NATIVE_WRITE_UNAVAILABLE', assisted: true },
    );
  }
}

/**
 * Produce a write method that has no native path on this site. It throws a
 * tagged error so `applyChange` can catch it and fall back to assisted mode.
 * The tag (`__notSupported`) also lets `applyChange` skip the call entirely.
 */
function assisted(method, reason) {
  const fn = () => {
    throw Object.assign(
      new Error(`[cms/custom] ${method}() has no native write path for this site yet. ${reason}`),
      { code: 'NATIVE_WRITE_UNAVAILABLE', assisted: true },
    );
  };
  fn.__notSupported = true;
  return fn;
}

/**
 * Whether the site's connected transport can natively perform a given change.
 * Contract-carried writes (SEO meta, redirects) count as native once an
 * SDK/edge transport is CONNECTED — the override IS the write, served on the
 * consumer's next cache refresh. Everything else stays assisted.
 *
 * Sync by design (canApplyNatively is sync): relies on integrationType /
 * connectionStatus being present on the passed site row; absent fields
 * safely degrade to assisted. The async kill-switch check happens inside the
 * write methods.
 *
 * @param {string} changeType
 * @param {object} site
 * @returns {boolean}
 */
export function supportsWrite(changeType, site) {
  return CONTRACT_WRITE_TYPES.has(changeType) && hasContractTransport(site);
}

/**
 * How this adapter's "native" writes actually land. applyChange surfaces it
 * as `mode: 'contract'` so callers can message "applied — live after the next
 * cache refresh" instead of implying an instant CMS write.
 */
export const writeMode = 'contract';

// Map a stored SiteEntity row to the loose "post" shape read-side callers expect.
function entityToPost(entity) {
  if (!entity) return null;
  const seo = entity.seoData || {};
  return {
    id: entity.externalId || entity.id,
    title: entity.title,
    slug: entity.slug,
    url: entity.url,
    link: entity.url,
    permalink: entity.url,
    status: (entity.status || 'PUBLISHED').toLowerCase(),
    excerpt: entity.excerpt || '',
    content: entity.content || '',
    featured_image: entity.featuredImage || null,
    date: entity.publishedAt || null,
    seo,
    meta: entity.metadata || {},
    acf: entity.acfData || null,
  };
}

// ─── Site info ─────────────────────────────────────────────────────────
export async function getSiteInfo(site) {
  // No plugin to interrogate; report what the platform already knows.
  const url = site?.url || '';
  return {
    siteUrl: url,
    homeUrl: url,
    siteName: site?.name || '',
    platform: 'custom',
    activePlugins: [],
    postTypes: [],
    taxonomies: [],
    hasYoast: false,
    hasRankMath: false,
    hasACF: false,
  };
}

export async function getPostTypes() {
  return [];
}

// ─── Content (read from SiteEntity; write → assisted) ──────────────────
export async function getPosts() {
  // Entities for custom sites are populated by the sitemap crawler
  // (lib/entity-discovery.js), not pulled through the CMS dispatcher.
  // Returning an empty page keeps entity-sync's reconciliation a safe no-op.
  return { items: [], total: 0, pages: 0 };
}

export async function getPost(site, postType, postId) {
  if (!site?.id || postId == null) return null;
  const idStr = String(postId);
  const entity = await prisma.siteEntity.findFirst({
    where: {
      siteId: site.id,
      OR: [{ externalId: idStr }, { id: idStr }],
    },
  });
  return entityToPost(entity);
}

export async function getPostBySlug(site, postType, slug) {
  if (!site?.id || !slug) return null;
  const entity = await prisma.siteEntity.findFirst({
    where: { siteId: site.id, slug },
  });
  return entityToPost(entity);
}

export const createPost = assisted('createPost', 'Connect the GhostSEO SDK or edge proxy to publish content, or copy the generated HTML.');
export const updatePost = assisted('updatePost', 'Connect a write transport, or apply the generated change manually.');
export const deletePost = assisted('deletePost', 'Delete this page in your own codebase/host.');

// ─── SEO (write → assisted; the fixers already emit paste-ready snippets) ─
export async function getSeoData(site, postId) {
  const post = await getPost(site, null, postId);
  return post?.seo || null;
}
/**
 * Contract-backed SEO write. Persists a SiteSeoOverride the connected SDK /
 * edge proxy serves on its next cache refresh. Unconnected sites throw the
 * tagged assisted error (never reached via applyChange when supportsWrite
 * already said no, but direct callers get the same degradation).
 *
 * @param {object} site
 * @param {string} target - URL, path, or SiteEntity id/externalId
 * @param {{ title?: string, description?: string, canonical?: string, robots?: string, ogImage?: string, jsonLd?: any }} seoData
 */
export async function updateSeoData(site, target, seoData = {}) {
  if (!hasContractTransport(site)) {
    throw Object.assign(
      new Error('[cms/custom] updateSeoData has no connected transport - apply the generated meta tags manually.'),
      { code: 'NATIVE_WRITE_UNAVAILABLE', assisted: true },
    );
  }
  await assertKillSwitchOff(site);

  let rawPath = typeof target === 'string' ? target : '';
  if (rawPath && !rawPath.startsWith('/') && !/^https?:\/\//i.test(rawPath)) {
    // Looks like an entity id, not a path - resolve it to the entity's URL.
    const entity = await prisma.siteEntity.findFirst({
      where: { siteId: site.id, OR: [{ externalId: rawPath }, { id: rawPath }] },
      select: { url: true, slug: true },
    });
    rawPath = entity?.url || `/${entity?.slug || rawPath}`;
  }
  const outcome = await upsertSeoOverride(site.id, rawPath || '/', seoData);
  if (!outcome.persisted) {
    throw new Error(`[cms/custom] updateSeoData failed to persist override: ${outcome.reason}`);
  }
  return { ...outcome, mode: 'contract', path: outcome.path ?? normalizePath(rawPath || '/') };
}

// ─── Custom fields — not a concept for custom sites ────────────────────
export async function getAcfFields() {
  return { fields: {}, groups: {} };
}
export const updateAcfFields = assisted('updateAcfFields', 'Custom sites have no ACF layer.');

// ─── Media (read empty; write → assisted) ──────────────────────────────
export async function getMedia() {
  return { items: [], total: 0, pages: 0 };
}
export async function getMediaItem() {
  return null;
}
export async function resolveMediaUrls() {
  return { results: {} };
}
export const uploadMediaFromUrl = assisted('uploadMediaFromUrl', 'Host the image in your own asset pipeline.');
export const uploadMediaFromBase64 = assisted('uploadMediaFromBase64', 'Host the image in your own asset pipeline.');
export const uploadMediaFromBuffer = assisted('uploadMediaFromBuffer', 'Host the image in your own asset pipeline.');
export const updateMedia = assisted('updateMedia', 'Update image metadata in your own codebase.');
export const deleteMedia = assisted('deleteMedia', 'Delete the asset in your own codebase/host.');

// ─── Taxonomies / terms ────────────────────────────────────────────────
export async function getTaxonomies() {
  return [];
}
export async function getTaxonomyTerms() {
  return [];
}
export async function listTerms() {
  return [];
}
export const createTerm = assisted('createTerm', 'Custom sites manage taxonomies in their own code.');
export const updateTerm = assisted('updateTerm', 'Custom sites manage taxonomies in their own code.');
export const deleteTerm = assisted('deleteTerm', 'Custom sites manage taxonomies in their own code.');

// ─── Comments — no native comment system ──────────────────────────────
export async function listComments() {
  return [];
}
export const updateComment = assisted('updateComment', 'Custom sites have no native comment system.');
export const replyComment = assisted('replyComment', 'Custom sites have no native comment system.');
export const deleteComment = assisted('deleteComment', 'Custom sites have no native comment system.');

// ─── Menus ─────────────────────────────────────────────────────────────
export async function getMenus() {
  return [];
}
export const addMenuItem = assisted('addMenuItem', 'Edit navigation in your own codebase.');
export const updateMenuItem = assisted('updateMenuItem', 'Edit navigation in your own codebase.');
export const deleteMenuItem = assisted('deleteMenuItem', 'Edit navigation in your own codebase.');

// ─── Redirects (write → assisted: emit host-specific config) ───────────
export async function getRedirects() {
  return { redirects: [] };
}
export async function getDetectedRedirectPlugins() {
  return { plugins: [] };
}
function requireContractTransport(site, method, fallback) {
  if (!hasContractTransport(site)) {
    throw Object.assign(
      new Error(`[cms/custom] ${method} has no connected transport. ${fallback}`),
      { code: 'NATIVE_WRITE_UNAVAILABLE', assisted: true },
    );
  }
}

/**
 * Contract-backed redirect write: persists to the Redirection table the
 * Contract /redirects endpoint serves (SDK next.config / edge proxy apply it).
 * @param {object} site
 * @param {{ source: string, target: string, type?: string }} data
 */
export async function createRedirect(site, data = {}) {
  requireContractTransport(site, 'createRedirect', 'Add the redirect via your host config.');
  await assertKillSwitchOff(site);
  const outcome = await upsertRedirectOverride(site.id, data.source, data.target, data.type);
  if (!outcome.persisted) {
    throw new Error(`[cms/custom] createRedirect failed to persist: ${outcome.reason}`);
  }
  return { ...outcome, mode: 'contract' };
}

/** Update = upsert by source (same Contract row), or re-point by row id. */
export async function updateRedirect(site, idOrData, maybeData) {
  requireContractTransport(site, 'updateRedirect', 'Update the redirect in your host config.');
  await assertKillSwitchOff(site);
  const data = maybeData || idOrData || {};
  if (typeof idOrData === 'string' && maybeData) {
    const updated = await prisma.redirection.updateMany({
      where: { siteId: site.id, id: idOrData },
      data: {
        ...(data.source ? { sourceUrl: normalizePath(data.source) } : {}),
        ...(data.target ? { targetUrl: data.target } : {}),
        ...(data.type ? { type: data.type === '302' || data.type === 'TEMPORARY' ? 'TEMPORARY' : 'PERMANENT' } : {}),
        isActive: true,
      },
    });
    if (!updated.count) throw new Error('[cms/custom] updateRedirect: redirect not found');
    return { persisted: true, mode: 'contract' };
  }
  return createRedirect(site, data);
}

/** Deactivate a redirect (by row id or source path) so the Contract stops serving it. */
export async function deleteRedirect(site, idOrSource) {
  requireContractTransport(site, 'deleteRedirect', 'Remove the redirect from your host config.');
  await assertKillSwitchOff(site);
  const where = String(idOrSource || '').startsWith('/')
    ? { siteId: site.id, sourceUrl: normalizePath(idOrSource) }
    : { siteId: site.id, id: String(idOrSource) };
  const res = await prisma.redirection.updateMany({ where, data: { isActive: false } });
  if (!res.count) throw new Error('[cms/custom] deleteRedirect: redirect not found');
  return { persisted: true, mode: 'contract' };
}
export const bulkSyncRedirects = assisted('bulkSyncRedirects', 'Export redirects to your host config.');
export const importRedirects = assisted('importRedirects', 'Custom sites have no redirect plugin to import from.');

// ─── URL resolution ────────────────────────────────────────────────────
export async function resolveUrl(site, url) {
  if (!site?.id || !url) return { found: false, postId: null };
  const entity = await prisma.siteEntity.findFirst({
    where: { siteId: site.id, url },
    select: { id: true, externalId: true, slug: true },
  });
  if (!entity) return { found: false, postId: null };
  return { found: true, postId: entity.externalId || entity.id, slug: entity.slug };
}

// ─── Site-level ops (write → assisted) ─────────────────────────────────
export async function getSearchEngineVisibility() {
  return { discouraged: false };
}
export const setSearchEngineVisibility = assisted('setSearchEngineVisibility', 'Set robots/indexing in your framework or the edge proxy.');
export const setFavicon = assisted('setFavicon', 'Set the favicon in your own codebase.');
export const enableSecurityHeaders = assisted('enableSecurityHeaders', 'Apply security headers at your host or via the edge proxy.');
export const searchReplaceLinks = assisted('searchReplaceLinks', 'Search-and-replace links in your own codebase.');
export async function getOptions() {
  return {};
}
export const updateOptions = assisted('updateOptions', 'Custom sites have no WordPress options table.');
export const clearCache = assisted('clearCache', 'Purge cache at your host/CDN.');

// ─── Visual editor — requires the editor-bridge (SDK/proxy, later phase) ─
export async function getElementStructure() {
  return { elements: [] };
}
export const manipulateElement = assisted('manipulateElement', 'Live visual editing needs the GhostSEO SDK or edge-proxy editor-bridge.');
export const restoreElementSnapshot = assisted('restoreElementSnapshot', 'Live visual editing needs the GhostSEO SDK or edge-proxy editor-bridge.');

// ─── WP-only concepts ──────────────────────────────────────────────────
export const selfUpdatePlugin = assisted('selfUpdatePlugin', 'Custom sites have no GhostSEO plugin to update.');
export const wpRestPassthrough = assisted('wpRestPassthrough', 'Custom sites have no WordPress REST API.');
export const pushWidgetData = assisted('pushWidgetData', 'Custom sites have no plugin dashboard widget.');

// ─── Entity sync orchestration (no-op; sitemap crawler owns discovery) ──
export async function syncAllEntities() {
  return { postTypes: [], entities: [], menus: [], taxonomies: [], errors: [] };
}
