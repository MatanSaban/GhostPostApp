/**
 * Recalculate audit score and regenerate AI summary after an issue fix.
 *
 * Called by fix routes (fix-noindex, set-favicon, etc.) after they update
 * the issues array in-place, so the score/summary reflect the new state.
 */

import prisma from '@/lib/prisma';
import { calculateAuditScore } from './scoring.js';
import { generateAuditSummary } from './summary-generator.js';
import { invalidateAudit } from '@/lib/cache/invalidate.js';
import { getAllIssues } from './issues-helper.js';

/**
 * @param {string} auditId  - the SiteAudit record to recalculate
 * @param {string} siteUrl  - used by the summary generator
 */
export async function recalculateAuditAfterFix(auditId, siteUrl) {
  const audit = await prisma.siteAudit.findUnique({
    where: { id: auditId },
    select: { pagesScanned: true, siteId: true, site: { select: { accountId: true } } },
  });
  if (!audit) return;

  // Phase 2: read issues via helper.
  const initialIssues = await getAllIssues(auditId);

  const context = { accountId: audit.site?.accountId, siteId: audit.siteId };
  const { score, categoryScores } = calculateAuditScore(initialIssues);

  // Generate AI summary once (used on first attempt)
  let summary = null;
  try {
    summary = await generateAuditSummary(
      initialIssues,
      score,
      categoryScores,
      siteUrl,
      audit.pagesScanned || 0,
      context,
    );
  } catch (err) {
    console.warn('[RecalcAfterFix] Summary generation failed:', err.message);
  }

  const MAX_RETRIES = 5;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // On retry, re-read + recalculate from latest state via helper
      const currentIssues = attempt === 0 ? initialIssues : await getAllIssues(auditId);
      const currentAudit = attempt === 0 ? audit : await prisma.siteAudit.findUnique({
        where: { id: auditId },
        select: { pagesScanned: true },
      });
      if (!currentAudit) return;

      const recalc = calculateAuditScore(currentIssues);

      let freshSummary = null;
      if (attempt === 0) {
        freshSummary = summary;
      } else {
        try {
          freshSummary = await generateAuditSummary(
            currentIssues,
            recalc.score,
            recalc.categoryScores,
            siteUrl,
            currentAudit.pagesScanned || 0,
            context,
          );
        } catch (err) {
          console.warn('[RecalcAfterFix] Summary retry failed:', err.message);
        }
      }

      await prisma.siteAudit.update({
        where: { id: auditId },
        data: {
          score: recalc.score,
          categoryScores: recalc.categoryScores,
          ...(freshSummary
            ? { summary: freshSummary, summaryTranslations: { en: freshSummary } }
            : { summaryTranslations: {} }),
        },
      });

      invalidateAudit(audit.siteId);
      console.log(`[RecalcAfterFix] Audit ${auditId} recalculated: score=${recalc.score}`);
      break; // success
    } catch (retryErr) {
      if (retryErr.code === 'P2034' && attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
        continue;
      }
      throw retryErr;
    }
  }
}
