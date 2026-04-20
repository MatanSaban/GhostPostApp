/**
 * Invalidation helpers — one entry point per logical mutation.
 *
 * Call these immediately AFTER the mutation completes (not before), so
 * readers don't race and repopulate the cache with stale data.
 *
 * Every helper also logs what it invalidated. In production the log shows
 * up in Vercel function logs — useful for confirming that a mutation path
 * remembered to call the right helper.
 */

import { revalidateTag } from 'next/cache';
import { tagFor } from './tags.js';

function invalidate(tags, label) {
  for (const tag of tags) {
    try {
      revalidateTag(tag);
    } catch (err) {
      // revalidateTag throws if called outside a request context (e.g. from a
      // background script). Log and continue — TTLs will catch it.
      console.warn(`[cache/invalidate] revalidateTag("${tag}") failed:`, err?.message ?? err);
    }
  }
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[cache/invalidate] ${label} → ${tags.join(', ')}`);
  }
}

/** Invalidate just the keywords cache for a site. */
export function invalidateKeywords(siteId) {
  invalidate([tagFor.siteKeywords(siteId)], `keywords:${siteId}`);
}

/** Invalidate just the competitors cache for a site. */
export function invalidateCompetitors(siteId) {
  invalidate([tagFor.siteCompetitors(siteId)], `competitors:${siteId}`);
}

/** Invalidate just the agent-insights cache for a site. */
export function invalidateAgentInsights(siteId) {
  invalidate([tagFor.siteAgentInsights(siteId)], `agent-insights:${siteId}`);
}

/** Invalidate audit cache for a site (called on status transitions + fixes). */
export function invalidateAudit(siteId) {
  invalidate([tagFor.siteAudit(siteId)], `audit:${siteId}`);
}

/** Invalidate site metadata (settings, url, name changes). */
export function invalidateSiteMetadata(siteId) {
  invalidate([tagFor.siteMetadata(siteId)], `site-metadata:${siteId}`);
}

/** Invalidate AI traffic cache for a site (called rarely — integration changes). */
export function invalidateAiTraffic(siteId) {
  invalidate([tagFor.siteAiTraffic(siteId)], `ai-traffic:${siteId}`);
}

/**
 * Nuke everything for a site. Use sparingly — when you're unsure which narrow
 * tag applies (e.g. a catch-all admin operation), or when a mutation affects
 * multiple domains at once.
 */
export function invalidateSite(siteId) {
  invalidate([tagFor.site(siteId)], `site:${siteId} (all)`);
}

/**
 * Nuke everything for an account. Use for: plan changes, member changes,
 * account deletion.
 */
export function invalidateAccount(accountId) {
  invalidate([tagFor.account(accountId)], `account:${accountId} (all)`);
}
