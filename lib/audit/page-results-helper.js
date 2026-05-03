/**
 * Page-results storage abstraction.
 *
 * Phase 1 of the SiteAudit storage refactor moves per-page scan records out
 * of the embedded `SiteAudit.pageResults[]` array into a dedicated MongoDB
 * collection (`AuditPageResult`, modeled in Prisma as `AuditPageResultDoc`).
 *
 * Three modes via env var `AUDIT_USE_PAGE_RESULTS_COLLECTION`:
 *
 *   'off' (or unset) — Legacy behavior. Writers $push to the embedded array;
 *                      readers read it. The new collection is untouched.
 *
 *   'dual'           — Writers write to BOTH the embedded array AND the new
 *                      collection. Readers prefer the new collection but fall
 *                      back to the embedded array when the collection has no
 *                      rows for that audit (i.e. pre-migration data).
 *                      Use during the rollout window — safe to flip without
 *                      losing data, since the embedded path still works.
 *
 *   'on'             — Writers write only to the new collection. Readers read
 *                      only the new collection. The embedded array is dead
 *                      weight (cleanup happens in a later phase).
 *
 * Every consumer reads/writes through this module. Never touch
 * `prisma.auditPageResultDoc` or `audit.pageResults` directly from feature
 * code — the flag-aware routing is the entire reason this module exists.
 */

import prisma from '@/lib/prisma';

const FLAG_ENV = 'AUDIT_USE_PAGE_RESULTS_COLLECTION';

/**
 * @returns {'off' | 'dual' | 'on'}
 */
export function getMode() {
  const v = (process.env[FLAG_ENV] || '').toLowerCase();
  if (v === '1' || v === 'on' || v === 'true') return 'on';
  if (v === 'dual') return 'dual';
  return 'off';
}

const writesNewCollection = () => {
  const m = getMode();
  return m === 'dual' || m === 'on';
};
const writesEmbedded = () => {
  const m = getMode();
  return m === 'off' || m === 'dual';
};
const readsNewCollection = () => {
  const m = getMode();
  return m === 'dual' || m === 'on';
};

/**
 * Strip the document wrapper fields (id, audit relation, denormalized scope
 * fields, scannedAt) so the returned shape matches the legacy embedded-array
 * shape. Lets every existing consumer (which expects `{ url, title, ... }`)
 * keep working unmodified.
 */
function stripDocFields(doc) {
  if (!doc) return doc;
  const { id: _id, auditId: _auditId, siteId: _siteId, accountId: _accountId, scannedAt: _scannedAt, ...rest } = doc;
  return rest;
}

/**
 * Read all pageResults for an audit. Result has the same shape as the legacy
 * embedded array — `[{ url, title, statusCode, ... }, ...]` — regardless of
 * which storage backend is in use.
 */
export async function getAllPageResults(auditId) {
  if (!auditId) return [];

  if (readsNewCollection()) {
    const docs = await prisma.auditPageResultDoc.findMany({
      where: { auditId },
      orderBy: { scannedAt: 'asc' },
    });
    if (docs.length > 0) return docs.map(stripDocFields);

    // 'dual' mode falls back to embedded when the new collection is still
    // empty (e.g. an audit created pre-migration). 'on' mode also falls back
    // for the same reason; once Phase 5 sunsets the embedded array we drop
    // this fallback.
    if (getMode() !== 'off') {
      const audit = await prisma.siteAudit.findUnique({
        where: { id: auditId },
        select: { pageResults: true },
      });
      return audit?.pageResults || [];
    }
    return [];
  }

  // 'off': read embedded only.
  const audit = await prisma.siteAudit.findUnique({
    where: { id: auditId },
    select: { pageResults: true },
  });
  return audit?.pageResults || [];
}

/**
 * Read a single pageResult by URL. Same fallback logic as getAllPageResults.
 * Returns null if not found.
 */
export async function getPageResultByUrl(auditId, url) {
  if (!auditId || !url) return null;

  if (readsNewCollection()) {
    const doc = await prisma.auditPageResultDoc.findFirst({
      where: { auditId, url },
    });
    if (doc) return stripDocFields(doc);

    if (getMode() !== 'off') {
      const audit = await prisma.siteAudit.findUnique({
        where: { id: auditId },
        select: { pageResults: true },
      });
      return (audit?.pageResults || []).find((p) => p.url === url) || null;
    }
    return null;
  }

  const audit = await prisma.siteAudit.findUnique({
    where: { id: auditId },
    select: { pageResults: true },
  });
  return (audit?.pageResults || []).find((p) => p.url === url) || null;
}

/**
 * Append a new pageResult atomically.
 *
 * @param {Object} ctx              audit/site/account scope
 * @param {string} ctx.auditId
 * @param {string} ctx.siteId
 * @param {string} ctx.accountId
 * @param {Object} pageResult       same shape as the embedded type — the
 *                                  caller doesn't need to know about doc
 *                                  fields (id/auditId/siteId/accountId/scannedAt
 *                                  are filled in here).
 *
 * In 'dual' mode this performs TWO writes (embedded $push + collection insert).
 * They are not transactional — see persistPage for how processChunk handles
 * the embedded write atomically alongside issues + pendingUrls + pagesScanned.
 * For dual mode, callers that already hold the embedded-write atomic op
 * (processChunk) should pass `{ skipEmbedded: true }` so we don't double-write.
 */
export async function appendPageResult({ auditId, siteId, accountId }, pageResult, opts = {}) {
  const promises = [];

  if (writesNewCollection()) {
    promises.push(
      prisma.auditPageResultDoc.create({
        data: {
          auditId,
          siteId,
          accountId,
          url: pageResult.url,
          statusCode: pageResult.statusCode ?? null,
          title: pageResult.title ?? null,
          metaDescription: pageResult.metaDescription ?? null,
          robotsMeta: pageResult.robotsMeta ?? null,
          ttfb: pageResult.ttfb ?? null,
          performanceScore: pageResult.performanceScore ?? null,
          lcp: pageResult.lcp ?? null,
          cls: pageResult.cls ?? null,
          inp: pageResult.inp ?? null,
          jsErrors: pageResult.jsErrors || [],
          brokenResources: pageResult.brokenResources || [],
          issueCount: pageResult.issueCount ?? 0,
          screenshotDesktop: pageResult.screenshotDesktop ?? null,
          screenshotMobile: pageResult.screenshotMobile ?? null,
          screenshotsDesktop: pageResult.screenshotsDesktop || [],
          screenshotsMobile: pageResult.screenshotsMobile || [],
          filmstripDesktop: pageResult.filmstripDesktop ?? null,
          filmstripMobile: pageResult.filmstripMobile ?? null,
        },
      }),
    );
  }

  // Embedded write — only when caller didn't already do it (processChunk's
  // raw $push includes pageResults inside its atomic op for chunked audits).
  if (writesEmbedded() && !opts.skipEmbedded) {
    promises.push(
      prisma.$runCommandRaw({
        update: 'SiteAudit',
        updates: [{
          q: { _id: { $oid: auditId } },
          u: { $push: { pageResults: pageResult } },
        }],
      }),
    );
  }

  await Promise.all(promises);
}

/**
 * Update a pageResult's fields by URL. Used by rescan / recheck / screenshot
 * recovery to overwrite metrics on a re-scanned URL without rebuilding the
 * entire array.
 *
 * In 'on' mode this is a single $set on one collection row.
 * In 'dual' mode it does the collection $set AND a read-modify-write on the
 *   embedded array (the only way to update a specific element without an
 *   array filter — keeping that complexity out of feature code).
 * In 'off' mode it does the embedded read-modify-write only.
 *
 * Pass `{ skipEmbedded: true }` when the caller already handled the embedded
 * write atomically alongside other fields.
 */
export async function updatePageResultByUrl({ auditId }, url, updates, opts = {}) {
  const promises = [];

  if (writesNewCollection()) {
    promises.push(
      prisma.auditPageResultDoc.updateMany({
        where: { auditId, url },
        data: updates,
      }),
    );
  }

  if (writesEmbedded() && !opts.skipEmbedded) {
    // Read-modify-write on the embedded array. Wrapped in a tiny retry loop
    // for transient write conflicts; the array is on a hot doc.
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const fresh = await prisma.siteAudit.findUnique({
          where: { id: auditId },
          select: { pageResults: true },
        });
        const updated = (fresh?.pageResults || []).map((pr) =>
          pr.url === url ? { ...pr, ...updates } : pr,
        );
        await prisma.siteAudit.update({
          where: { id: auditId },
          data: { pageResults: updated },
        });
        break;
      } catch (err) {
        if (attempt === 3) {
          // Embedded write failed but the collection write may have succeeded.
          // Don't throw — we'd rather have data in the collection than nothing.
          console.warn(`[page-results-helper] embedded update failed for ${auditId} ${url}: ${err.message}`);
          break;
        }
        await new Promise((r) => setTimeout(r, 200 * attempt));
      }
    }
  }

  await Promise.all(promises);
}

/**
 * Update many pageResults at once, keyed by URL.
 *
 * @param {{auditId: string}} ctx
 * @param {Map<string, object>} updatedByUrl  Each value is the partial-or-full
 *                                            patch to apply to that URL's row.
 * @param {object} [opts]
 * @param {boolean} [opts.skipEmbedded]  Skip the embedded read-modify-write.
 *                                       Pass `true` when the caller already
 *                                       wrote the embedded array themselves
 *                                       (e.g. fixers/_shared.updateAuditWithRetry
 *                                       persists `data.pageResults` first).
 */
export async function applyBulkUpdates({ auditId }, updatedByUrl, opts = {}) {
  if (updatedByUrl.size === 0) return;

  if (writesNewCollection()) {
    // One updateMany per URL — Prisma doesn't have a multi-where bulk update.
    // Cap parallelism to keep MongoDB pool happy.
    for (const [url, patch] of updatedByUrl) {
      await prisma.auditPageResultDoc.updateMany({
        where: { auditId, url },
        data: patch,
      }).catch((err) => {
        console.warn(`[page-results-helper] bulk update failed for ${auditId} ${url}: ${err.message}`);
      });
    }
  }

  if (writesEmbedded() && !opts.skipEmbedded) {
    try {
      const fresh = await prisma.siteAudit.findUnique({
        where: { id: auditId },
        select: { pageResults: true },
      });
      const updated = (fresh?.pageResults || []).map((pr) => {
        const patch = updatedByUrl.get(pr.url);
        return patch ? { ...pr, ...patch } : pr;
      });
      await prisma.siteAudit.update({
        where: { id: auditId },
        data: { pageResults: updated },
      });
    } catch (err) {
      console.warn(`[page-results-helper] bulk embedded update failed for ${auditId}: ${err.message}`);
    }
  }
}

/**
 * Whether the caller should write the embedded `SiteAudit.pageResults` field
 * directly. In 'on' mode the field is effectively dead (no readers) so we
 * skip writes to it; in 'off' and 'dual' modes writes are required.
 *
 * Use this to gate any direct writes to the embedded field — keep the helper
 * (`appendPageResult` / `applyBulkUpdates`) the only thing that knows about
 * the dual-write semantics.
 */
export function shouldWriteEmbeddedPageResults() {
  return writesEmbedded();
}

/**
 * Alias kept for clarity at processChunk's atomic-$push site.
 */
export function shouldIncludePageResultInRawPush() {
  return writesEmbedded();
}
