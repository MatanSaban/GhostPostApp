/**
 * Cluster Health Analysis
 *
 * Three signals answering "is this cluster healthy?":
 *
 *   5a. Internal link gaps   — pillar↔member and member↔member missing links,
 *                              parsed from existing crawled SiteEntity.content.
 *   5b. Cross-cluster
 *       cannibalization      — existing PENDING cannibalization AgentInsights
 *                              that involve this cluster's members.
 *   5c. Staleness flags      — members not updated in N+ months.
 *
 * All three are pure read operations (no AI, no side effects), designed to
 * be cheap enough to run on every cluster page load. Surface only — the user
 * decides what to act on. Action-execution (insights → fixes) is a separate phase.
 */

import prisma from '@/lib/prisma';

const STALE_THRESHOLD_DAYS = 365;
const HREF_RE = /href\s*=\s*["']([^"']+)["']/gi;

function normalizeUrl(rawUrl) {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    // Drop trailing slash, fragment, search — match by canonical path origin.
    let pathname = url.pathname.replace(/\/+$/, '') || '/';
    return `${url.origin}${pathname}`.toLowerCase();
  } catch {
    // Relative URL or malformed — fall back to a trimmed lowercased string.
    return rawUrl.replace(/[#?].*$/, '').replace(/\/+$/, '').toLowerCase();
  }
}

function extractOutgoingHrefs(html) {
  if (!html || typeof html !== 'string') return [];
  const out = new Set();
  let m;
  HREF_RE.lastIndex = 0;
  while ((m = HREF_RE.exec(html)) !== null) {
    const href = m[1];
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
    out.add(href);
  }
  return Array.from(out);
}

function findMissingLinks(members, pillarId) {
  // Build a map of canonical URL → entityId for fast match.
  const urlToId = new Map();
  for (const m of members) {
    const norm = normalizeUrl(m.url);
    if (norm) urlToId.set(norm, m.id);
  }

  // For each member, parse its content and find which other cluster members it links to.
  const outgoing = new Map(); // entityId → Set<entityId>
  for (const m of members) {
    outgoing.set(m.id, new Set());
    const hrefs = extractOutgoingHrefs(m.content);
    for (const href of hrefs) {
      const target = urlToId.get(normalizeUrl(href));
      if (target && target !== m.id) {
        outgoing.get(m.id).add(target);
      }
    }
  }

  const gaps = [];
  for (const m of members) {
    for (const other of members) {
      if (m.id === other.id) continue;
      // Pillar↔member is HIGH priority; member↔member is MEDIUM.
      const involvesPillar = pillarId && (m.id === pillarId || other.id === pillarId);
      // Only flag missing FROM→TO when the source has body content (otherwise we'd
      // tell the user to add a link to a page they probably haven't drafted yet).
      if (!m.content || m.content.length < 50) continue;
      if (!outgoing.get(m.id).has(other.id)) {
        gaps.push({
          fromEntityId: m.id,
          fromTitle: m.title,
          fromUrl: m.url,
          toEntityId: other.id,
          toTitle: other.title,
          toUrl: other.url,
          severity: involvesPillar ? 'HIGH' : 'MEDIUM',
        });
      }
    }
  }
  return gaps;
}

function findStaleMembers(members, thresholdDays) {
  const now = Date.now();
  const ms = thresholdDays * 24 * 60 * 60 * 1000;
  const out = [];
  for (const m of members) {
    const reference = m.updatedAt || m.publishedAt;
    if (!reference) continue;
    const age = now - new Date(reference).getTime();
    if (age >= ms) {
      out.push({
        entityId: m.id,
        title: m.title,
        url: m.url,
        lastUpdated: reference,
        daysStale: Math.floor(age / (24 * 60 * 60 * 1000)),
      });
    }
  }
  return out.sort((a, b) => b.daysStale - a.daysStale);
}

async function findCannibalizationsAffectingCluster(siteId, members) {
  const memberUrls = new Set();
  for (const m of members) {
    const norm = normalizeUrl(m.url);
    if (norm) memberUrls.add(norm);
  }
  if (memberUrls.size === 0) return [];

  // Existing cannibalization insights are produced by lib/agent-analysis.js with
  // titleKeys under 'agent.insights.cannibalization.*'. Reuse them; don't re-run
  // the engine from here (it's a multi-minute job).
  const candidates = await prisma.agentInsight.findMany({
    where: {
      siteId,
      status: 'PENDING',
      titleKey: { contains: 'cannibalization' },
    },
    select: {
      id: true,
      category: true,
      priority: true,
      titleKey: true,
      data: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const matched = [];
  for (const insight of candidates) {
    const issues = insight.data?.issues || [];
    for (const issue of issues) {
      const urls = issue.urls || issue.urlsInvolved || [];
      const overlap = urls
        .map(normalizeUrl)
        .filter((u) => u && memberUrls.has(u));
      if (overlap.length > 0) {
        matched.push({
          insightId: insight.id,
          titleKey: insight.titleKey,
          priority: insight.priority,
          recommendedAction: issue.action || null,
          confidence: issue.confidence ?? null,
          urlsInvolved: urls,
          memberUrlsInvolved: overlap,
          createdAt: insight.createdAt,
        });
        break; // one entry per insight is enough for the UI
      }
    }
  }
  return matched;
}

/**
 * Run cluster health analysis.
 *
 * @param {Object} params
 * @param {string} params.clusterId
 * @param {number} [params.daysStaleThreshold]
 * @param {number|null} [params.topN] - When set, each issue array is capped at N entries
 *                                       (totals stay accurate). Pass null/undefined for full list.
 *                                       Used by the list endpoint to keep responses lean.
 * @returns {Promise<{
 *   clusterId: string,
 *   linkGaps: Array,
 *   staleness: Array,
 *   cannibalizations: Array,
 *   totals: { linkGaps: number, staleness: number, cannibalizations: number, all: number },
 * }>}
 */
export async function analyzeClusterHealth({
  clusterId,
  daysStaleThreshold = STALE_THRESHOLD_DAYS,
  topN = null,
}) {
  if (!clusterId) throw new Error('clusterId is required');

  const cluster = await prisma.topicCluster.findUnique({
    where: { id: clusterId },
    select: { id: true, siteId: true, pillarEntityId: true, memberEntityIds: true, status: true },
  });
  if (!cluster) {
    return {
      clusterId,
      linkGaps: [],
      staleness: [],
      cannibalizations: [],
      totals: { linkGaps: 0, staleness: 0, cannibalizations: 0, all: 0 },
    };
  }

  const members = cluster.memberEntityIds?.length
    ? await prisma.siteEntity.findMany({
        where: { id: { in: cluster.memberEntityIds } },
        select: {
          id: true,
          title: true,
          url: true,
          content: true,
          updatedAt: true,
          publishedAt: true,
        },
      })
    : [];

  const linkGaps = findMissingLinks(members, cluster.pillarEntityId);
  const staleness = findStaleMembers(members, daysStaleThreshold);
  const cannibalizations = await findCannibalizationsAffectingCluster(cluster.siteId, members);

  const cap = (arr) => (typeof topN === 'number' && topN >= 0 ? arr.slice(0, topN) : arr);

  return {
    clusterId,
    linkGaps: cap(linkGaps),
    staleness: cap(staleness),
    cannibalizations: cap(cannibalizations),
    totals: {
      linkGaps: linkGaps.length,
      staleness: staleness.length,
      cannibalizations: cannibalizations.length,
      all: linkGaps.length + staleness.length + cannibalizations.length,
    },
  };
}
