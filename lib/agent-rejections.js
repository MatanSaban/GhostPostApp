/**
 * Sticky rejection memory.
 *
 * When a user explicitly rejects or dismisses an agent insight, we want the
 * cron to stop regenerating the same suggestion. The previous behavior was
 * a hard trust-killer: a user would dismiss "merge these two URLs" and the
 * exact same card would reappear the next morning.
 *
 * Storage is `AgentRejection` keyed by (siteId, dedupKey). The dedupKey is
 * the same identity the cron already uses to deduplicate insights inside
 * one run, so the suppression check is a single Set lookup at the same
 * point dedup happens today.
 *
 * Auto-expires after REJECTION_TTL_MS so a never-true rejection doesn't
 * suppress a genuinely-new instance forever (e.g. site restructure changes
 * the URL set entirely; that's a fresh dedupKey anyway, so suppression
 * naturally decays). 60d is long enough to feel sticky, short enough that
 * we re-surface if the user changes their mind.
 */

import prisma from '@/lib/prisma';

export const REJECTION_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

/**
 * Build the canonical dedup key for an insight. Must match the
 * implementation used by the cron in agent-analysis.js. Kept here so both
 * the writer (rejection route) and reader (cron) can import a single source.
 */
export function buildDedupKey(titleKey, data) {
  const d = data || {};
  if (titleKey.includes('keywordStrikeZone')) return `${titleKey}:${d.keyword || ''}`;
  if (titleKey.includes('cannibalization')) {
    const urls = d.issues?.[0]?.urls || [];
    const sortedUrls = [...urls].sort().join('|');
    return `${titleKey}:${sortedUrls}`;
  }
  if (titleKey.includes('aiCitedByEngine')) return `${titleKey}:${d.engine || ''}`;
  if (titleKey.includes('aiEngineGap') || titleKey.includes('aiPageMissingSchema') || titleKey.includes('aiAnswerableButNotConcise')) {
    return `${titleKey}:${d.page || d.url || ''}`;
  }
  return titleKey;
}

function inferInsightType(titleKey) {
  // Keys look like "agent.insights.<type>.title" or "agent.insights.<type>.<variant>.title"
  const m = titleKey?.match?.(/agent\.insights\.([\w]+)/);
  return m ? m[1] : null;
}

/**
 * Record a rejection. Upserts so repeated rejects of the same dedupKey
 * just refresh the TTL and the latest reason.
 */
export async function recordRejection({ siteId, accountId, titleKey, data, reason }) {
  if (!siteId || !accountId || !titleKey) return null;
  const dedupKey = buildDedupKey(titleKey, data);
  const expiresAt = new Date(Date.now() + REJECTION_TTL_MS);
  const insightType = inferInsightType(titleKey);

  return prisma.agentRejection.upsert({
    where: { siteId_dedupKey: { siteId, dedupKey } },
    create: { siteId, accountId, dedupKey, insightType, reason: reason || null, expiresAt },
    update: { reason: reason || null, expiresAt, rejectedAt: new Date() },
  });
}

/**
 * Fetch the set of dedup keys that should be suppressed for a site right now.
 * Cron consults this once at the start of each run, then filters in-memory.
 */
export async function getActiveRejectedKeys(siteId) {
  const rows = await prisma.agentRejection.findMany({
    where: {
      siteId,
      expiresAt: { gt: new Date() },
    },
    select: { dedupKey: true },
  });
  return new Set(rows.map(r => r.dedupKey));
}

/**
 * Best-effort cleanup of expired rejections. Safe to call from any cron.
 * Returns the count deleted.
 */
export async function purgeExpiredRejections() {
  const res = await prisma.agentRejection.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return res.count;
}
