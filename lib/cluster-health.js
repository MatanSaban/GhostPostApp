/**
 * Cluster Health Analysis
 *
 * Three signals answering "is this cluster healthy?":
 *
 *   5a. Internal link gaps   — Four typed gaps:
 *                                PARENT   (HIGH)   member missing → own pillar
 *                                ANCESTOR (MEDIUM) member missing → root pillar of tree
 *                                BRAND    (LOW)    brand-aligned member missing → homepage
 *                                SIBLING  (LOW)    member missing → co-member
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
import { normalizeText, jaccardSimilarity } from '@/lib/cannibalization-engine';

const STALE_THRESHOLD_DAYS = 365;
const HREF_RE = /href\s*=\s*["']([^"']+)["']/gi;
// Threshold for "topically aligned with the homepage". Low because we're not
// matching exact keywords — we just need topical relevance.
const BRAND_ALIGNMENT_THRESHOLD = 0.15;

function normalizeUrl(rawUrl) {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    let pathname = url.pathname.replace(/\/+$/, '') || '/';
    return `${url.origin}${pathname}`.toLowerCase();
  } catch {
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

/**
 * Find the homepage SiteEntity for a site — the one whose URL normalizes to
 * the site root. Returns null when not crawled (in which case BRAND-type gaps
 * are skipped).
 */
export async function findHomepageEntity(siteId) {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { id: true, url: true },
  });
  if (!site?.url) return null;
  const normalizedRoot = normalizeUrl(site.url);
  if (!normalizedRoot) return null;
  // Lean candidate set: only PUBLISHED entities. Most sites have <50 pages
  // total — we scan all of them rather than try to predict the homepage's slug.
  const candidates = await prisma.siteEntity.findMany({
    where: { siteId, status: 'PUBLISHED' },
    select: { id: true, title: true, url: true, content: true, seoData: true },
  });
  return candidates.find((e) => normalizeUrl(e.url) === normalizedRoot) || null;
}

/**
 * Pull homepage's "main keywords" from SEO plugin metadata, with a tokenized
 * title as fallback. Returns an array of normalized tokens (already de-duped
 * and stop-worded by normalizeText).
 */
export function extractHomepageKeywords(homepage) {
  if (!homepage) return [];
  const seoData = homepage.seoData || {};
  // Yoast: focuskw + focuskw_synonyms; RankMath: focus_keyword + secondary_keywords
  const candidates = [];
  for (const key of ['focusKeyword', 'focuskw', 'focus_keyword']) {
    if (typeof seoData[key] === 'string' && seoData[key]) candidates.push(seoData[key]);
  }
  for (const key of ['additionalKeywords', 'focuskw_synonyms', 'secondary_keywords']) {
    const v = seoData[key];
    if (Array.isArray(v)) candidates.push(...v.filter((x) => typeof x === 'string'));
    else if (typeof v === 'string' && v) candidates.push(v);
  }
  // Always include the title as a fallback signal — even when SEO data is rich,
  // the title carries the brand name itself and is worth folding in.
  if (homepage.title) candidates.push(homepage.title);

  // Tokenize each candidate string and merge into a single normalized set.
  const tokens = new Set();
  for (const c of candidates) {
    for (const tok of normalizeText(c)) tokens.add(tok);
  }
  return Array.from(tokens);
}

/**
 * Decide whether a cluster member is topically aligned with the homepage.
 * Uses Jaccard similarity on tokenized title + focus keyword. Hebrew-aware
 * via normalizeText (which handles plurals + diacritics + stop words).
 */
export function isBrandAligned(member, homepageKeywords) {
  if (!homepageKeywords?.length) return false;
  const memberTokens = new Set([
    ...normalizeText(member.title || ''),
    ...normalizeText(member?.seoData?.focusKeyword || member?.seoData?.focuskw || ''),
  ]);
  if (memberTokens.size === 0) return false;
  const sim = jaccardSimilarity(Array.from(memberTokens), homepageKeywords);
  return sim >= BRAND_ALIGNMENT_THRESHOLD;
}

function mkGap(from, to, type, severity) {
  return {
    fromEntityId: from.id,
    fromTitle: from.title,
    fromUrl: from.url,
    toEntityId: to.id,
    toTitle: to.title,
    toUrl: to.url,
    type,
    severity,
  };
}

/**
 * Emit the four typed internal-link gaps for a cluster's members.
 *
 * @param {Object} params
 * @param {Array}  params.members           - hydrated SiteEntity rows (must include content + url)
 * @param {string} [params.pillarId]        - this cluster's pillarEntityId (drives PARENT)
 * @param {Object} [params.rootPillar]      - root-of-tree pillar entity {id,title,url} (drives ANCESTOR; pass null for roots)
 * @param {Object} [params.homepage]        - hydrated homepage SiteEntity (drives BRAND)
 * @param {string[]} [params.homepageKeywords] - pre-tokenized brand keywords
 */
function buildLinkGaps({ members, pillarId, rootPillar, homepage, homepageKeywords }) {
  const urlToId = new Map();
  for (const m of members) {
    const norm = normalizeUrl(m.url);
    if (norm) urlToId.set(norm, m.id);
  }
  if (homepage?.url) {
    const norm = normalizeUrl(homepage.url);
    if (norm && !urlToId.has(norm)) urlToId.set(norm, homepage.id);
  }
  if (rootPillar?.url) {
    const norm = normalizeUrl(rootPillar.url);
    if (norm && !urlToId.has(norm)) urlToId.set(norm, rootPillar.id);
  }

  const memberById = new Map(members.map((m) => [m.id, m]));
  const pillar = pillarId ? memberById.get(pillarId) : null;
  // ANCESTOR is meaningful only when (a) a root pillar exists and (b) it's
  // distinct from this cluster's own pillar (otherwise PARENT covers it).
  const ancestor = rootPillar && rootPillar.id !== pillarId ? rootPillar : null;

  const outgoingByMember = new Map();
  for (const m of members) {
    if (!m.content || m.content.length < 50) continue;
    const set = new Set();
    for (const href of extractOutgoingHrefs(m.content)) {
      const targetId = urlToId.get(normalizeUrl(href));
      if (targetId) set.add(targetId);
    }
    outgoingByMember.set(m.id, set);
  }

  const gaps = [];

  for (const m of members) {
    const links = outgoingByMember.get(m.id);
    if (!links) continue;

    // PARENT (HIGH) — own pillar.
    if (pillar && m.id !== pillar.id && !links.has(pillar.id)) {
      gaps.push(mkGap(m, pillar, 'PARENT', 'HIGH'));
    }

    // ANCESTOR (MEDIUM) — root-of-tree pillar.
    if (ancestor && m.id !== ancestor.id && !links.has(ancestor.id)) {
      gaps.push(mkGap(m, ancestor, 'ANCESTOR', 'MEDIUM'));
    }

    // BRAND (LOW) — homepage, only when topically aligned.
    if (
      homepage &&
      m.id !== homepage.id &&
      isBrandAligned(m, homepageKeywords) &&
      !links.has(homepage.id)
    ) {
      gaps.push(mkGap(m, homepage, 'BRAND', 'LOW'));
    }

    // SIBLING (LOW) — co-members. Skipped against the pillar (PARENT covers
    // that already) and against any of the higher-priority targets we just
    // emitted gaps for.
    for (const other of members) {
      if (other.id === m.id) continue;
      if (pillarId && other.id === pillarId) continue;
      if (!links.has(other.id)) {
        gaps.push(mkGap(m, other, 'SIBLING', 'LOW'));
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
 * Phase 4 additions:
 *   - rootPillar: { id, title, url, content? } — the pillar of THIS cluster's tree root.
 *                                                Pass null/undefined for root clusters.
 *                                                When provided, emits ANCESTOR-type gaps.
 *   - homepage:   { id, title, url, content?, seoData? } — the site's homepage entity.
 *                                                When provided AND a member is brand-aligned,
 *                                                emits BRAND-type gaps. Pass null to skip.
 *   - homepageKeywords: pre-tokenized keywords (computed once per request by caller).
 *
 * Backwards compatible: all new params are optional. When omitted, only PARENT
 * + SIBLING gaps are emitted (matching v1+v2 behavior, except severity for
 * member-to-member is downgraded HIGH→MEDIUM→LOW since SIBLING is now LOW).
 *
 * @returns {Promise<{
 *   clusterId: string,
 *   linkGaps: Array<{ ..., type: 'PARENT'|'ANCESTOR'|'BRAND'|'SIBLING', severity: 'HIGH'|'MEDIUM'|'LOW' }>,
 *   staleness: Array,
 *   cannibalizations: Array,
 *   totals: {
 *     linkGaps: number, staleness: number, cannibalizations: number, all: number,
 *     linkGapsByType: { PARENT, ANCESTOR, BRAND, SIBLING },
 *   },
 * }>}
 */
export async function analyzeClusterHealth({
  clusterId,
  daysStaleThreshold = STALE_THRESHOLD_DAYS,
  topN = null,
  rootPillar = null,
  homepage = null,
  homepageKeywords = null,
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
      totals: {
        linkGaps: 0,
        staleness: 0,
        cannibalizations: 0,
        all: 0,
        linkGapsByType: { PARENT: 0, ANCESTOR: 0, BRAND: 0, SIBLING: 0 },
      },
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
          seoData: true,
          updatedAt: true,
          publishedAt: true,
        },
      })
    : [];

  // If brand keywords weren't pre-computed but a homepage was passed, derive now.
  // (Caller usually pre-computes — saves repeat work across many clusters.)
  const brandKeywords =
    homepageKeywords ?? (homepage ? extractHomepageKeywords(homepage) : []);

  const linkGaps = buildLinkGaps({
    members,
    pillarId: cluster.pillarEntityId,
    rootPillar,
    homepage,
    homepageKeywords: brandKeywords,
  });
  const staleness = findStaleMembers(members, daysStaleThreshold);
  const cannibalizations = await findCannibalizationsAffectingCluster(cluster.siteId, members);

  // Sort gaps so highest-severity surface first within the capped slice.
  const SEVERITY_RANK = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  linkGaps.sort((a, b) => (SEVERITY_RANK[a.severity] ?? 99) - (SEVERITY_RANK[b.severity] ?? 99));

  const cap = (arr) => (typeof topN === 'number' && topN >= 0 ? arr.slice(0, topN) : arr);

  // Per-type totals so the UI can render typed counts without re-counting.
  const linkGapsByType = { PARENT: 0, ANCESTOR: 0, BRAND: 0, SIBLING: 0 };
  for (const g of linkGaps) linkGapsByType[g.type] = (linkGapsByType[g.type] || 0) + 1;

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
      linkGapsByType,
    },
  };
}
