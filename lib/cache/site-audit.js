/**
 * Cached reader for COMPLETED site audits.
 *
 * Design choice: we cache individual audits ONLY when they're in a terminal
 * state (COMPLETED / FAILED). Running audits are not cached because:
 *   1. They mutate every few seconds (progress, pagesScanned) - the dashboard
 *      polls /api/audit every 3s to track progress.
 *   2. Caching would either fight the polling or cause stale-progress bugs.
 *
 * The list endpoint (GET /api/audit without auditId) is also NOT cached here -
 * it's used for polling and includes RUNNING audits with live progress.
 *
 * What we DO cache: a specific audit fetched by auditId, but only after it's
 * terminal. Once an audit is COMPLETED or FAILED, it never changes, so a
 * long TTL + tag-based invalidation on fix-apply is sufficient.
 *
 * Invalidated by `invalidateAudit(siteId)` - called after:
 *   - fix-applied (lib/audit/recalculate-after-fix.js triggers a score update)
 *   - any audit mutation that updates the record post-completion
 */

import { unstable_cache } from 'next/cache';
import prisma from '@/lib/prisma.js';
import { tagsFor } from './tags.js';

const TTL = 3600; // 1 hour - terminal audits almost never change; tag handles exceptions.

/**
 * Fetch a single audit by id, full payload (includes issues + pageResults).
 * Caller MUST verify user has access to the audit's site before displaying.
 *
 * Returns null if audit not found or if it belongs to a different site than
 * the caller claims (enforces scoping via (auditId, siteId) in the query).
 *
 * For running/pending audits, this bypasses the cache entirely and returns
 * fresh data from Mongo - a safe default so progress updates are visible.
 */
export async function getCachedAuditById({ auditId, siteId, accountId }) {
  // First, a tiny uncached lookup to check the audit's terminal status.
  // If it's still running, we skip caching to avoid serving stale progress.
  const status = await prisma.siteAudit.findFirst({
    where: { id: auditId, siteId },
    select: { status: true },
  });

  if (!status) return null;

  const isTerminal = status.status === 'COMPLETED' || status.status === 'FAILED';

  if (!isTerminal) {
    // Running/pending - return fresh data, do not cache. Skip the heavy
    // arrays that grow with the audit (issues / pageResults / pendingUrls)
    // — for an in-progress audit those reads are 1MB+ and uncached, and
    // every 3s page poll was triggering them. The drill-down UI doesn't
    // render full issues until the audit completes anyway.
    return prisma.siteAudit.findFirst({
      where: { id: auditId, siteId },
      select: {
        id: true, siteId: true, status: true, score: true, deviceType: true,
        categoryScores: true, pagesScanned: true, pagesFound: true,
        discoveryMethod: true, screenshots: true, summary: true,
        summaryTranslations: true, progress: true, phase: true,
        chunkErrors: true,
        startedAt: true, completedAt: true, createdAt: true, updatedAt: true,
      },
    });
  }

  const cached = unstable_cache(
    async () => {
      return prisma.siteAudit.findFirst({ where: { id: auditId, siteId } });
    },
    ['site-audit-by-id', auditId],
    {
      tags: tagsFor('siteAudit', { siteId, accountId }),
      revalidate: TTL,
    }
  );

  return cached();
}
