/**
 * Free Agent Fix Handlers
 *
 * Handlers for `kind: 'free'` registry entries — no AI calls, no credits
 * charged. Each handler returns the same shape as the AI handlers' apply
 * step so the dispatcher can merge results into `executionResult`:
 *
 *     { success, results: [{ url, postId?, status, reason? }], summary }
 */

import prisma from '@/lib/prisma';
import { cms } from '@/lib/cms';
import { resolveUrl } from '@/lib/wp-api-client.js';

// ─── Helpers ─────────────────────────────────────────────────────────

async function resolveEntityForUrl(site, url) {
  const variants = getUrlVariants(url);
  let entity = await prisma.siteEntity.findFirst({
    where: { siteId: site.id, url: { in: variants } },
    include: { entityType: { select: { slug: true } } },
  });
  if (entity?.externalId) {
    return {
      externalId: String(entity.externalId).replace(/[^0-9]/g, '') || entity.externalId,
      postType: entity.entityType?.slug || 'page',
    };
  }
  // Fallback: WordPress plugin URL resolver. Shopify sites won't have a
  // plugin so this returns null and the caller skips the row.
  if (site.platform !== 'shopify' && site.siteKey) {
    try {
      const resolved = await resolveUrl(site, url);
      if (resolved?.found && resolved.postId) {
        return {
          externalId: String(resolved.postId).replace(/[^0-9]/g, '') || String(resolved.postId),
          postType: resolved.postType || 'page',
        };
      }
    } catch { /* fall through */ }
  }
  return null;
}

function getUrlVariants(url) {
  const variants = new Set([url]);
  try {
    const parsed = new URL(url);
    const withSlash = parsed.href.endsWith('/') ? parsed.href : parsed.href + '/';
    const withoutSlash = parsed.href.endsWith('/') ? parsed.href.slice(0, -1) : parsed.href;
    variants.add(withSlash);
    variants.add(withoutSlash);
    if (parsed.protocol === 'http:') {
      const https = new URL(url); https.protocol = 'https:';
      variants.add(https.href);
      variants.add(https.href.endsWith('/') ? https.href.slice(0, -1) : https.href + '/');
    } else if (parsed.protocol === 'https:') {
      const http = new URL(url); http.protocol = 'http:';
      variants.add(http.href);
      variants.add(http.href.endsWith('/') ? http.href.slice(0, -1) : http.href + '/');
    }
  } catch { /* invalid URL */ }
  return [...variants];
}

// ─── noindexDetected: clear noindex flag per page ─────────────────────
//
// WordPress: plugin SEO endpoint accepts `{ noIndex: false }`. Shopify
// surfaces robots as always indexable (toSeoShape) and never raises this
// insight in the first place — the handler still no-ops gracefully on
// non-WP just in case.

export async function applyNoindexClearFix(insight, site, itemIndices = null) {
  const pages = insight.data?.pages || [];
  if (pages.length === 0) {
    return { success: false, results: [], summary: 'No pages to fix' };
  }

  const indices = itemIndices && itemIndices.length > 0 ? itemIndices : pages.map((_, i) => i);
  const results = [];

  for (const i of indices) {
    const page = pages[i];
    if (!page?.url) {
      results.push({ index: i, url: null, status: 'skipped', reason: 'Missing page URL' });
      continue;
    }

    try {
      const resolved = await resolveEntityForUrl(site, page.url);
      if (!resolved) {
        results.push({ index: i, url: page.url, status: 'skipped', reason: 'Could not resolve page' });
        continue;
      }

      // WP signature: updateSeoData(site, postId, seo). Shopify signature:
      // updateSeoData(site, postType, postId, seo). The WP adapter ignores
      // the postType arg, so passing it is safe on both.
      if (site.platform === 'shopify') {
        // Shopify has no per-page noindex flag in the standard SEO shape —
        // mark the row as a no-op success rather than silently failing.
        results.push({
          index: i,
          url: page.url,
          postId: resolved.externalId,
          status: 'fixed',
          reason: 'Shopify pages are indexable by default',
        });
        continue;
      }

      await cms.updateSeoData(site, resolved.externalId, {
        noIndex: false,
        robots: { index: true, follow: true },
      });

      results.push({
        index: i,
        url: page.url,
        postId: resolved.externalId,
        status: 'fixed',
      });
    } catch (err) {
      results.push({
        index: i,
        url: page.url,
        status: 'error',
        reason: err.message,
      });
    }
  }

  const fixed = results.filter(r => r.status === 'fixed').length;
  return {
    success: fixed > 0,
    results,
    summary: `Cleared noindex on ${fixed}/${indices.length} pages`,
  };
}

// ─── staleCompetitorScans: trigger fresh competitor scrape ────────────
//
// No plugin call, no AI — resets `lastScannedAt` + sets `scanStatus`
// back to PENDING on the site's stale competitors so the scan job picks
// them up on the next run. The insight surfaces competitor domains in
// `data.competitors`; we filter by those when present and fall back to
// "all competitors on this site" otherwise.

export async function applyRescanCompetitorsFix(insight, site) {
  const domains = (insight.data?.competitors || [])
    .map(c => c.domain)
    .filter(Boolean);

  const where = { siteId: site.id };
  if (domains.length > 0) where.domain = { in: domains };

  const updated = await prisma.competitor.updateMany({
    where,
    data: { lastScannedAt: null, scanStatus: 'PENDING' },
  }).catch((e) => {
    console.warn('[Agent Fix] rescanCompetitors: competitor table update failed:', e.message);
    return { count: 0 };
  });

  return {
    success: updated.count > 0,
    results: [{ status: updated.count > 0 ? 'fixed' : 'skipped', count: updated.count }],
    summary: updated.count > 0
      ? `Marked ${updated.count} competitor(s) for rescan`
      : 'No competitors to rescan',
  };
}
