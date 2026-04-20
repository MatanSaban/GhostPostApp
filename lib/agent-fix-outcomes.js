/**
 * Post-fix measurement loop.
 *
 * The agent applies a cannibalization fix (MERGE / CANONICAL / 301_REDIRECT
 * / DIFFERENTIATE). Whether that fix actually helped is invisible until you
 * compare GSC metrics 14 days later: did clicks for the affected URLs go
 * up, position improve, query owner stabilize?
 *
 * This module owns:
 *   1. Snapshotting GSC metrics at apply time (`recordBaseline`)
 *   2. A cron-runnable scorer that revisits each outcome 14d later
 *      (`measureMaturedOutcomes`) and tags each with a verdict
 *   3. A small "what's the agent's track record?" reader for the dashboard
 *
 * The verdict feeds back into AI prompt context (Phase 7-ish "tell me what
 * usually works for this site"), and into the trust UI: a CRITICAL insight
 * with a 70% improvement track record should look very different from one
 * the agent has botched the last 3 times.
 */

import prisma from '@/lib/prisma';
import { fetchGSCDataWithPagination } from '@/lib/cannibalization-engine';

const MEASURE_DELAY_DAYS = 14;

function withinDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Aggregate GSC metrics for a set of URLs over the last `days` window.
 * Returns { clicks, impressions, position, ctr, queryCount } summed/averaged.
 *
 * Uses fetchGSCDataWithPagination so we get the same dynamic-freshness offset
 * the engine uses — keeps baseline-vs-result comparable.
 */
async function snapshotUrls(accessToken, gscSiteUrl, urls, days = 14) {
  const data = await fetchGSCDataWithPagination(accessToken, gscSiteUrl, days);
  const set = new Set(urls.map(u => u.replace(/\/$/, '')));
  const matching = data.filter(row => {
    const p = (row.page || '').replace(/\/$/, '');
    return set.has(p);
  });

  let clicks = 0;
  let impressions = 0;
  const positions = [];
  const queries = new Set();
  for (const row of matching) {
    clicks += row.clicks || 0;
    impressions += row.impressions || 0;
    if (row.position) positions.push(row.position);
    if (row.query) queries.add(row.query);
  }
  const avgPosition = positions.length > 0 ? positions.reduce((a, b) => a + b, 0) / positions.length : null;
  const ctr = impressions > 0 ? clicks / impressions : 0;

  return {
    clicks,
    impressions,
    avgPosition: avgPosition !== null ? Math.round(avgPosition * 10) / 10 : null,
    ctr: Math.round(ctr * 10000) / 100,
    queryCount: queries.size,
    sampledAt: new Date().toISOString(),
    windowDays: days,
  };
}

/**
 * Record the baseline metrics at apply time. Called from the fixers right
 * after the fix lands successfully. Non-blocking — if GSC is unreachable
 * we still create the outcome row with a null baseline so the measurement
 * cron has *something* to follow up on (it can no-op gracefully later).
 */
export async function recordBaseline({ siteId, accountId, insightId, insightType, action, affectedUrls }) {
  if (!siteId || !accountId || !affectedUrls?.length) return null;

  let baseline = null;
  try {
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      include: { googleIntegration: true },
    });
    if (site?.googleIntegration?.gscConnected && site.googleIntegration.gscSiteUrl) {
      // Reuse the platform's existing token-refresh helper. Imported lazily
      // to avoid a top-of-file cycle (agent-analysis.js imports this file).
      const { refreshAccessToken } = await import('@/lib/google-integration');
      let accessToken = site.googleIntegration.accessToken;
      if (!site.googleIntegration.tokenExpiresAt || new Date(site.googleIntegration.tokenExpiresAt) <= new Date(Date.now() + 5 * 60 * 1000)) {
        if (site.googleIntegration.refreshToken) {
          const refreshed = await refreshAccessToken(site.googleIntegration.refreshToken).catch(() => null);
          if (refreshed?.access_token) accessToken = refreshed.access_token;
        }
      }
      if (accessToken) {
        baseline = await snapshotUrls(accessToken, site.googleIntegration.gscSiteUrl, affectedUrls, 14);
      }
    }
  } catch (err) {
    console.error('[AgentFixOutcomes] baseline snapshot failed:', err.message);
  }

  return prisma.agentFixOutcome.create({
    data: {
      siteId,
      accountId,
      insightId: insightId || null,
      insightType,
      action,
      affectedUrls,
      appliedAt: new Date(),
      measureAt: withinDays(new Date(), MEASURE_DELAY_DAYS),
      baselineMetrics: baseline || { unavailable: true, reason: 'gsc_not_ready' },
    },
  });
}

/**
 * Compute a verdict label by comparing baseline vs. result. Heuristic for
 * now — favors clicks first (most direct user signal), then position.
 */
function judge(baseline, result) {
  if (!baseline || baseline.unavailable) return 'inconclusive';
  if (!result || result.unavailable) return 'inconclusive';

  const baseClicks = baseline.clicks || 0;
  const resClicks = result.clicks || 0;
  const clicksDelta = baseClicks > 0 ? (resClicks - baseClicks) / baseClicks : (resClicks > 0 ? 1 : 0);

  // Position: lower is better. Treat null as "no rank" (worse than rank 100).
  const basePos = baseline.avgPosition || 100;
  const resPos = result.avgPosition || 100;
  const posDelta = basePos - resPos; // positive = improved

  if (clicksDelta >= 0.15 || posDelta >= 2) return 'improved';
  if (clicksDelta <= -0.20 || posDelta <= -3) return 'regressed';
  return 'no_change';
}

/**
 * Cron entry point. Finds outcomes whose measureAt is in the past and
 * haven't been measured yet, snapshots the result window, and writes a
 * verdict. Returns counts for telemetry.
 */
export async function measureMaturedOutcomes({ batchLimit = 100 } = {}) {
  const due = await prisma.agentFixOutcome.findMany({
    where: { measureAt: { lte: new Date() }, measuredAt: null },
    take: batchLimit,
    orderBy: { measureAt: 'asc' },
  });

  let measured = 0;
  let inconclusive = 0;
  for (const outcome of due) {
    try {
      const site = await prisma.site.findUnique({
        where: { id: outcome.siteId },
        include: { googleIntegration: true },
      });
      let result = { unavailable: true, reason: 'no_gsc' };
      if (site?.googleIntegration?.gscConnected && site.googleIntegration.gscSiteUrl) {
        const { refreshAccessToken } = await import('@/lib/google-integration');
        let accessToken = site.googleIntegration.accessToken;
        if (!site.googleIntegration.tokenExpiresAt || new Date(site.googleIntegration.tokenExpiresAt) <= new Date(Date.now() + 5 * 60 * 1000)) {
          if (site.googleIntegration.refreshToken) {
            const refreshed = await refreshAccessToken(site.googleIntegration.refreshToken).catch(() => null);
            if (refreshed?.access_token) accessToken = refreshed.access_token;
          }
        }
        if (accessToken) {
          result = await snapshotUrls(accessToken, site.googleIntegration.gscSiteUrl, outcome.affectedUrls, 14);
        }
      }
      const verdict = judge(outcome.baselineMetrics, result);
      if (verdict === 'inconclusive') inconclusive++;
      await prisma.agentFixOutcome.update({
        where: { id: outcome.id },
        data: { resultMetrics: result, verdict, measuredAt: new Date() },
      });
      measured++;
    } catch (err) {
      console.error(`[AgentFixOutcomes] measure failed for ${outcome.id}:`, err.message);
    }
  }
  return { measured, inconclusive, dueCount: due.length };
}

/**
 * Quick read helper for the dashboard / AI prompt context.
 * Returns counts by verdict for a given site over the last `days`.
 */
export async function getOutcomeStats(siteId, days = 90) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const rows = await prisma.agentFixOutcome.groupBy({
    by: ['verdict'],
    where: { siteId, measuredAt: { gte: since, not: null } },
    _count: true,
  });
  const stats = { improved: 0, no_change: 0, regressed: 0, inconclusive: 0 };
  for (const r of rows) {
    if (r.verdict && stats[r.verdict] !== undefined) stats[r.verdict] = r._count;
  }
  return stats;
}
