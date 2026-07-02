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

export const capabilities = CUSTOM_CAPABILITIES;

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
 * Phase 0: nothing is connected, so always false → everything goes assisted.
 * Later phases flip specific change types to true per connected transport.
 *
 * @param {string} _changeType
 * @param {object} _site
 * @returns {boolean}
 */
export function supportsWrite(_changeType, _site) {
  return false;
}

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
export const updateSeoData = assisted('updateSeoData', 'Apply the generated meta tags via the SDK, edge proxy, or by pasting them into your <head>.');

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
export const createRedirect = assisted('createRedirect', 'Add the redirect via the edge proxy or your host config (next.config, _redirects, vercel.json, nginx).');
export const updateRedirect = assisted('updateRedirect', 'Update the redirect in your host config.');
export const deleteRedirect = assisted('deleteRedirect', 'Remove the redirect from your host config.');
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
