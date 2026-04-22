/**
 * Shopify CMS Adapter
 *
 * Talks to the Shopify Admin GraphQL API using a per-shop OAuth access token
 * stored encrypted on Site.shopifyAccessToken.
 *
 * Phase 3 wired the read path. Phase 4 fills in the write path
 * (create/update/delete), menus, options, entity sync, URL resolution, and
 * webhook receiver. Methods with no Shopify analog (WP plugin self-update,
 * WP-only visual-editor ops, comments) throw permanently with a clear
 * message — surface code should gate them via capabilities.
 */

import { SHOPIFY_CAPABILITIES } from '../../capabilities';

import * as content from './managers/content';
import * as media from './managers/media';
import * as menus from './managers/menus';
import * as metafields from './managers/metafields';
import * as options from './managers/options';
import * as redirects from './managers/redirects';
import * as resolve from './managers/resolve';
import * as seo from './managers/seo';
import * as shopInfo from './managers/shop-info';
import * as sync from './managers/sync';
import * as taxonomy from './managers/taxonomy';

export const capabilities = SHOPIFY_CAPABILITIES;

function notImplemented(method) {
  return () => {
    throw new Error(
      `[cms/shopify] ${method}() is not implemented yet.`,
    );
  };
}

function notSupported(method, reason) {
  return () => {
    throw new Error(`[cms/shopify] ${method}() is not supported on Shopify. ${reason}`);
  };
}

// ─── Site info ─────────────────────────────────────────────────────────
export const getSiteInfo = shopInfo.getSiteInfo;

// ─── Content (read + write) ────────────────────────────────────────────
export const getPostTypes = content.getPostTypes;
export const getPosts = content.getPosts;
export const getPost = content.getPost;
export const getPostBySlug = content.getPostBySlug;
export const createPost = content.createPost;
export const updatePost = content.updatePost;
export const deletePost = content.deletePost;

// ─── SEO ───────────────────────────────────────────────────────────────
export const getSeoData = seo.getSeoData;
export const updateSeoData = seo.updateSeoData;

// ─── ACF / Metafields ──────────────────────────────────────────────────
export const getAcfFields = metafields.getAcfFields;
export const updateAcfFields = metafields.updateAcfFields;

// ─── Media ─────────────────────────────────────────────────────────────
export const getMedia = media.getMedia;
export const getMediaItem = media.getMediaItem;
export const uploadMediaFromUrl = media.uploadMediaFromUrl;
export const uploadMediaFromBase64 = media.uploadMediaFromBase64;
export const uploadMediaFromBuffer = media.uploadMediaFromBuffer;
export const updateMedia = media.updateMedia;
export const deleteMedia = media.deleteMedia;

// ─── Taxonomies ────────────────────────────────────────────────────────
export const getTaxonomies = taxonomy.getTaxonomies;
export const getTaxonomyTerms = taxonomy.getTaxonomyTerms;
export const listTerms = taxonomy.listTerms;
export const createTerm = taxonomy.createTerm;
export const updateTerm = taxonomy.updateTerm;
export const deleteTerm = taxonomy.deleteTerm;

// ─── Comments — no Shopify analog ─────────────────────────────────────
export const listComments = notSupported('listComments', 'Shopify has no native comment system; use a reviews app.');
export const updateComment = notSupported('updateComment', 'Shopify has no native comment system.');
export const replyComment = notSupported('replyComment', 'Shopify has no native comment system.');
export const deleteComment = notSupported('deleteComment', 'Shopify has no native comment system.');

// ─── Menus ─────────────────────────────────────────────────────────────
export const getMenus = menus.getMenus;
export const addMenuItem = menus.addMenuItem;
export const updateMenuItem = menus.updateMenuItem;
export const deleteMenuItem = menus.deleteMenuItem;

// ─── Redirects ─────────────────────────────────────────────────────────
export const getRedirects = redirects.getRedirects;
export const createRedirect = redirects.createRedirect;
export const updateRedirect = redirects.updateRedirect;
export const deleteRedirect = redirects.deleteRedirect;
export const bulkSyncRedirects = redirects.bulkSyncRedirects;
export const importRedirects = redirects.importRedirects;
export const getDetectedRedirectPlugins = redirects.getDetectedRedirectPlugins;

// ─── Options / Shop settings ──────────────────────────────────────────
export const getOptions = options.getOptions;
export const updateOptions = options.updateOptions;

// ─── URL resolution ────────────────────────────────────────────────────
export const resolveUrl = resolve.resolveUrl;
export const resolveMediaUrls = media.resolveMediaUrls;

// ─── Site-level ops ────────────────────────────────────────────────────
export const setFavicon = options.setFavicon;
export const getSearchEngineVisibility = options.getSearchEngineVisibility;
export const setSearchEngineVisibility = options.setSearchEngineVisibility;
export const enableSecurityHeaders = notSupported('enableSecurityHeaders', 'Shopify manages security headers via Shopify Plus / theme configuration.');
export const searchReplaceLinks = notImplemented('searchReplaceLinks');
export const clearCache = notSupported('clearCache', 'Shopify CDN purges automatically when content changes.');
export const pushWidgetData = notImplemented('pushWidgetData');

// ─── Visual editor — WP-only DOM manipulation ─────────────────────────
export const manipulateElement = notSupported('manipulateElement', 'Visual editor only targets WordPress themes.');
export const getElementStructure = notSupported('getElementStructure', 'Visual editor only targets WordPress themes.');

// ─── WP plugin self-update / REST passthrough — WP-only ──────────────
export const selfUpdatePlugin = notSupported('selfUpdatePlugin', 'Shopify uses OAuth, not the Ghost Post Connector plugin.');
export const wpRestPassthrough = notSupported('wpRestPassthrough', 'Shopify has no WordPress REST; use cms.* methods directly.');

// ─── Entity sync orchestration ────────────────────────────────────────
export const syncAllEntities = sync.syncAllEntities;
