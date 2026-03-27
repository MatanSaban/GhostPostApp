/**
 * Recalculate audit score and regenerate AI summary after an issue fix.
 *
 * Called by fix routes (fix-noindex, set-favicon, etc.) after they update
 * the issues array in-place, so the score/summary reflect the new state.
 */

import prisma from '@/lib/prisma';
import { calculateAuditScore } from './scoring.js';
import { generateAuditSummary } from './summary-generator.js';

/**
 * @param {string} auditId  - the SiteAudit record to recalculate
 * @param {string} siteUrl  - used by the summary generator
 */
export async function recalculateAuditAfterFix(auditId, siteUrl) {
  const audit = await prisma.siteAudit.findUnique({
    where: { id: auditId },
    select: { issues: true, pagesScanned: true },
  });
  if (!audit) return;

  const { score, categoryScores } = calculateAuditScore(audit.issues || []);

  // Generate AI summary once (used on first attempt)
  let summary = null;
  try {
    summary = await generateAuditSummary(
      audit.issues,
      score,
      categoryScores,
      siteUrl,
      audit.pagesScanned || 0,
    );
  } catch (err) {
    console.warn('[RecalcAfterFix] Summary generation failed:', err.message);
  }

  const MAX_RETRIES = 5;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // On retry, re-read + recalculate from latest state
      const currentAudit = attempt === 0 ? audit : await prisma.siteAudit.findUnique({
        where: { id: auditId },
        select: { issues: true, pagesScanned: true },
      });
      if (!currentAudit) return;

      const recalc = calculateAuditScore(currentAudit.issues || []);

      let freshSummary = null;
      if (attempt === 0) {
        freshSummary = summary;
      } else {
        try {
          freshSummary = await generateAuditSummary(
            currentAudit.issues,
            recalc.score,
            recalc.categoryScores,
            siteUrl,
            currentAudit.pagesScanned || 0,
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
