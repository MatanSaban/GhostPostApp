/**
 * Shared utilities for fix handlers.
 *
 * - URL classification (archive/taxonomy pages can't be SEO-edited via the plugin)
 * - WordPress post-ID resolution from a page URL
 * - WordPress media-attachment resolution from an image URL
 * - In-place audit-issue update with optimistic-concurrency retry
 *
 * Handlers should NOT charge credits (that's the dispatcher's job) and SHOULD
 * let third-party AI errors propagate untouched so the dispatcher can classify
 * them as `AI_PROVIDER_FAILED` and notify SuperAdmins.
 */

import prisma from '@/lib/prisma';
import { resolveUrl, getMedia } from '@/lib/wp-api-client';
import { invalidateAudit } from '@/lib/cache/invalidate.js';

// ─── URL helpers ────────────────────────────────────────────────────

const ARCHIVE_PATTERNS = [/\/category\//, /\/tag\//, /\/author\//, /\/page\/\d/];

export function isArchiveUrl(url) {
  return ARCHIVE_PATTERNS.some((p) => p.test(url));
}

export function shortPath(url) {
  try {
    const u = new URL(url);
    return u.pathname === '/' ? u.hostname : u.pathname;
  } catch {
    return url;
  }
}

// ─── WP post-ID resolution ──────────────────────────────────────────

/**
 * Resolve a page URL to a WordPress post ID.
 * Tries entity table first (by URL, then slug, then homepage variants),
 * falls back to the plugin's resolveUrl endpoint.
 *
 * @returns {Promise<number|null>}
 */
export async function resolvePostIdFromUrl(site, url) {
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return null;
  }

  const pathParts = decodeURIComponent(parsedUrl.pathname.replace(/^\/|\/$/g, ''));
  const slug = pathParts.split('/').pop() || '';
  const isHomepage = pathParts === '';

  const urlWithSlash = url.endsWith('/') ? url : url + '/';
  const urlWithoutSlash = url.endsWith('/') ? url.slice(0, -1) : url;

  let entity = await prisma.siteEntity.findFirst({
    where: { siteId: site.id, url: { in: [url, urlWithSlash, urlWithoutSlash] } },
    select: { externalId: true },
  });

  if (!entity && slug) {
    entity = await prisma.siteEntity.findFirst({
      where: { siteId: site.id, slug },
      select: { externalId: true },
    });
  }

  if (!entity && isHomepage) {
    entity = await prisma.siteEntity.findFirst({
      where: {
        siteId: site.id,
        url: { in: [
          parsedUrl.origin + '/',
          parsedUrl.origin,
          site.url,
          site.url.endsWith('/') ? site.url.slice(0, -1) : site.url + '/',
        ] },
      },
      select: { externalId: true },
    });
  }

  if (entity?.externalId) return entity.externalId;

  const resolved = await resolveUrl(site, url);
  return resolved?.found ? resolved.postId : null;
}

// ─── WP media (attachment) resolution by URL ────────────────────────

function normalizeUrlForCompare(url) {
  return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').toLowerCase();
}

function buildMediaSearchTerms(fullFileName) {
  const base = fullFileName.replace(/\.[^.]+$/, '');
  const terms = [];
  if (base.length >= 3) terms.push(base);
  const noSize = base.replace(/-\d+x\d+$/, '');
  if (noSize !== base && noSize.length >= 3) terms.push(noSize);
  const noEdit = noSize.replace(/-e\d{10,13}$/, '');
  if (noEdit !== noSize && noEdit.length >= 3) terms.push(noEdit);
  const noTrailingNum = noEdit.replace(/-\d+$/, '');
  if (noTrailingNum !== noEdit && noTrailingNum.length >= 3) terms.push(noTrailingNum);
  const cleanest = noEdit || noSize || base;
  const words = cleanest.split(/[-_]+/).filter(Boolean);
  if (words.length > 2) {
    const twoWords = words.slice(0, 2).join('-');
    if (twoWords.length >= 3) terms.push(twoWords);
    if (words.length > 3) {
      const threeWords = words.slice(0, 3).join('-');
      if (threeWords.length >= 3) terms.push(threeWords);
    }
  }
  return [...new Set(terms)];
}

/**
 * Resolve image URLs to WP attachment IDs by searching the WP media library.
 * Returns: { [imageUrl]: { found: bool, attachmentId: number|null } }
 */
export async function resolveAttachmentIds(site, imageUrls) {
  const results = {};

  for (const imageUrl of imageUrls) {
    try {
      const urlPath = new URL(imageUrl).pathname;
      const fullFileName = urlPath.split('/').pop() || '';
      const rawTerms = buildMediaSearchTerms(fullFileName);
      const searchTerms = rawTerms.map((t) => t.replace(/[-_]+/g, ' ').trim());

      if (searchTerms.length === 0) {
        results[imageUrl] = { found: false, attachmentId: null };
        continue;
      }

      let items = [];
      let usedTerm = '';
      for (const term of searchTerms) {
        const r = await getMedia(site, { search: term, perPage: 10, mimeType: 'image' });
        items = r?.items || [];
        usedTerm = term;
        if (items.length > 0) break;
      }

      if (items.length === 0) {
        results[imageUrl] = { found: false, attachmentId: null };
        continue;
      }

      const normalizedImageUrl = normalizeUrlForCompare(imageUrl);
      const cleanImageUrl = imageUrl.replace(/-\d+x\d+(?=\.[a-z]+$)/i, '');
      const normalizedCleanUrl = normalizeUrlForCompare(cleanImageUrl);

      let match = items.find((it) => normalizeUrlForCompare(it.url) === normalizedImageUrl);
      if (!match) match = items.find((it) => normalizeUrlForCompare(it.url) === normalizedCleanUrl);

      if (!match) {
        const srcPathClean = urlPath.replace(/-\d+x\d+(?=\.[a-z]+$)/i, '').toLowerCase();
        match = items.find((it) => {
          try {
            const itemPath = new URL(it.url).pathname.toLowerCase();
            return itemPath === srcPathClean || itemPath === urlPath.toLowerCase();
          } catch { return false; }
        });
      }

      if (!match) {
        const stripWpSuffixes = (f) => f.replace(/-\d+x\d+/g, '').replace(/-e\d{10,13}/g, '').toLowerCase();
        const srcFileClean = stripWpSuffixes(fullFileName);
        match = items.find((it) => {
          try {
            const itemFile = new URL(it.url).pathname.split('/').pop() || '';
            return stripWpSuffixes(itemFile) === srcFileClean;
          } catch { return false; }
        });
      }

      if (!match && usedTerm.length >= 5 && items.length === 1) {
        match = items[0];
      }
      if (!match) {
        const termLower = usedTerm.toLowerCase();
        match = items.find((it) => {
          const itemFile = new URL(it.url).pathname.split('/').pop()?.toLowerCase() || '';
          return itemFile.includes(termLower);
        });
      }

      results[imageUrl] = match
        ? { found: true, attachmentId: match.id }
        : { found: false, attachmentId: null };
    } catch (err) {
      console.warn('[fixers/_shared] resolveAttachmentIds failed for', imageUrl, ':', err.message);
      results[imageUrl] = { found: false, attachmentId: null };
    }
  }

  return results;
}

// ─── Audit-doc update with optimistic-concurrency retry ─────────────

/**
 * Read the audit, run a transformer that returns the new fields to write,
 * and persist with retry for Mongo write-conflicts (P2034).
 *
 * @param {string} auditId
 * @param {(audit: { issues: any[], pageResults: any[] }) => Partial<{issues: any[], pageResults: any[]}> | null} transform
 *        Return null/undefined to skip the write.
 * @returns {Promise<boolean>} whether the audit was updated
 */
export async function updateAuditWithRetry(auditId, transform, { invalidateSiteId, fields = ['issues', 'pageResults'] } = {}) {
  const select = Object.fromEntries(fields.map((f) => [f, true]));
  const MAX_RETRIES = 5;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const audit = await prisma.siteAudit.findUnique({
        where: { id: auditId },
        select,
      });
      if (!audit) return false;

      const updated = transform(audit);
      if (!updated) return false;

      await prisma.siteAudit.update({
        where: { id: auditId },
        data: updated,
      });
      if (invalidateSiteId) invalidateAudit(invalidateSiteId);
      return true;
    } catch (e) {
      if (e.code === 'P2034' && attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
        continue;
      }
      console.warn('[fixers/_shared] updateAuditWithRetry failed:', e.message);
      return false;
    }
  }
  return false;
}

// ─── i18n helpers ───────────────────────────────────────────────────

export function localeName(locale) {
  if (locale === 'he') return 'Hebrew';
  if (locale === 'es') return 'Spanish';
  if (locale === 'fr') return 'French';
  if (locale === 'de') return 'German';
  return 'English';
}

export function brandName(site) {
  if (site.name) return site.name;
  try { return new URL(site.url).hostname; } catch { return site.url || ''; }
}
