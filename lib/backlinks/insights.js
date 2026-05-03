/**
 * Detection logic for Backlink Audit insights.
 *
 * Five insight types, all surfaced as `AgentInsightCategory.BACKLINKS`:
 *
 *   BACKLINK_TOXIC               — high-confidence harmful link, fixable via disavow
 *   BACKLINK_LOST_HIGH_VALUE     — recently-lost link from a strong domain
 *   BACKLINK_ANCHOR_OVER_OPT     — exact-match commercial anchor share too high on a target
 *   BACKLINK_BROKEN_TARGET       — your page that's being linked-to returns 4xx
 *   BACKLINK_OPPORTUNITY         — a domain links to a competitor but not to you
 *
 * Each detector returns a list of normalized insight payloads. The orchestrator
 * (`runBacklinkInsights`) deduplicates against existing AgentInsight rows and
 * batch-inserts new ones.
 *
 * The TOXIC detector is the only one that calls an LLM. Per the v1 spec,
 * the rule is "100% sure or don't surface" — encoded as a hard 0.95 confidence
 * floor combined with a hard spam_score signal. Below threshold, we silently
 * drop the candidate; we never raise a low-confidence "might be toxic" insight.
 */

import { z } from 'zod';
import prisma from '@/lib/prisma';
import { generateStructuredResponse } from '@/lib/ai/gemini';
import { fetchBacklinksForSite } from '@/lib/dataforseo/backlinks';

// ─── Tunables ──────────────────────────────────────────────────────────────
const TOXIC_SPAM_FLOOR = 12;          // DataForSEO spam_score (0-17 scale)
const TOXIC_CONFIDENCE_FLOOR = 0.95;  // LLM confidence required to surface
const TOXIC_BATCH_LIMIT = 30;         // Max candidates per LLM call (cost cap)

const LOST_DR_FLOOR = 40;             // Considered "high value"
const LOST_WINDOW_DAYS = 30;

const ANCHOR_TARGET_MIN_SAMPLE = 10;  // Need at least N links to a target before judging anchors
const ANCHOR_EXACT_MATCH_SHARE = 0.30;

const BROKEN_TARGETS_PER_RUN = 50;    // Cap HEAD checks per run
const BROKEN_HEAD_TIMEOUT_MS = 5000;

const OPPORTUNITY_COMPETITORS_PER_RUN = 2;
const OPPORTUNITY_DR_FLOOR = 30;
const OPPORTUNITY_MAX_INSIGHTS = 5;

// ─── Helpers ───────────────────────────────────────────────────────────────

function dedupKey(type, payload) {
  return `${type}:${payload}`;
}

// ─── Detector: TOXIC ────────────────────────────────────────────────────────

const ToxicJudgmentsSchema = z.object({
  judgments: z.array(z.object({
    backlinkId: z.string(),
    isToxic: z.boolean(),
    confidence: z.number().min(0).max(1),
    reason: z.string().max(240),
  })),
});

async function judgeToxicWithLLM(candidates, accountId, siteId) {
  if (candidates.length === 0) return [];
  const compact = candidates.map(c => ({
    id: c.id,
    domain: c.referringDomain,
    url: c.referringUrl,
    anchor: c.anchorText || '',
    spamScore: c.spamScore,
    domainRating: c.domainRating,
  }));

  const system = [
    'You evaluate inbound links to a website ("backlinks") for a tool that helps SEOs identify links so harmful they should be added to a Google disavow file.',
    'Be strictly conservative. Disavowing a legitimate link harms the website. Only mark as toxic links that are clearly part of link schemes, link farms, PBNs, scraper sites, hacked sites, mass-spam directories, or otherwise manipulative.',
    'Calibrate confidence carefully:',
    '  - 0.95+ : you are nearly certain this link is harmful and disavowing is the right action.',
    '  - 0.7-0.94: suspicious but you would not stake the user\'s rankings on it. Mark isToxic=false.',
    '  - <0.7   : insufficient signal. Mark isToxic=false.',
    'Never mark isToxic=true with confidence below 0.95. When in doubt, isToxic=false.',
    'Provide a short, user-facing reason in the same language the input is in (default English).',
    'Return one judgment per backlink, in the same order.',
  ].join('\n');

  const prompt = `Evaluate these ${compact.length} backlinks. Each has a domain, source URL, anchor text, DataForSEO spam score (0-17, higher = spammier), and domain rating (0-100, lower = weaker).\n\n${JSON.stringify(compact, null, 2)}`;

  const result = await generateStructuredResponse({
    system,
    prompt,
    schema: ToxicJudgmentsSchema,
    operation: 'AGENT_INSIGHT_BACKLINK_TOXIC',
    accountId,
    siteId,
  });

  return result?.judgments || [];
}

async function detectToxic({ siteId, accountId, backlinks }) {
  // Pre-filter to candidates worth burning AI on. Spam_score floor is the
  // primary signal; we also include very-low-DR links (PBN signature) only
  // when the spam score is non-trivial, to keep the candidate pool tight.
  const candidates = backlinks
    .filter(b => b.status === 'ACTIVE' && !b.isDisavowed && !b.isHidden && !b.isToxic)
    .filter(b =>
      (typeof b.spamScore === 'number' && b.spamScore >= TOXIC_SPAM_FLOOR) ||
      (typeof b.spamScore === 'number' && b.spamScore >= 8 && typeof b.domainRating === 'number' && b.domainRating < 5)
    )
    // Per-domain dedup before AI call: one candidate per domain (cheapest representative).
    .reduce((map, b) => {
      const k = b.referringDomain || b.referringUrl;
      if (!k) return map;
      const prev = map.get(k);
      if (!prev || (b.spamScore || 0) > (prev.spamScore || 0)) map.set(k, b);
      return map;
    }, new Map());

  const list = Array.from(candidates.values()).slice(0, TOXIC_BATCH_LIMIT);
  if (list.length === 0) return [];

  let judgments = [];
  try {
    judgments = await judgeToxicWithLLM(list, accountId, siteId);
  } catch (err) {
    // If credits run out or the model errors, drop the whole detector for
    // this run rather than failing the entire insights pass.
    console.warn('[backlink-insights/toxic] LLM call failed:', err?.message || err);
    return [];
  }

  const out = [];
  for (const j of judgments) {
    if (!j.isToxic) continue;
    if (j.confidence < TOXIC_CONFIDENCE_FLOOR) continue;
    const row = list.find(b => b.id === j.backlinkId);
    if (!row) continue;

    out.push({
      type: 'BACKLINK_TOXIC',
      category: 'BACKLINKS',
      insightType: 'ALERT',
      priority: 'HIGH',
      titleKey: 'agent.insights.backlinkToxic.title',
      descriptionKey: 'agent.insights.backlinkToxic.description',
      data: {
        backlinkId: row.id,
        referringDomain: row.referringDomain,
        referringUrl: row.referringUrl,
        spamScore: row.spamScore,
        domainRating: row.domainRating,
        confidence: j.confidence,
        reason: j.reason,
      },
      actionType: 'disavow_domain',
      actionPayload: { siteId, scope: 'DOMAIN', value: row.referringDomain, reason: j.reason },
      dedupKey: dedupKey('BACKLINK_TOXIC', row.referringDomain),
    });
  }
  return out;
}

// ─── Detector: LOST_HIGH_VALUE ─────────────────────────────────────────────

function detectLostHighValue({ siteId, backlinks }) {
  const cutoff = Date.now() - LOST_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const grouped = new Map();
  for (const b of backlinks) {
    if (b.status !== 'LOST') continue;
    if (!b.domainRating || b.domainRating < LOST_DR_FLOOR) continue;
    if (new Date(b.updatedAt).getTime() < cutoff) continue;
    if (!b.referringDomain) continue;
    const list = grouped.get(b.referringDomain) || [];
    list.push(b);
    grouped.set(b.referringDomain, list);
  }

  const out = [];
  for (const [domain, list] of grouped.entries()) {
    const avgDR = Math.round(list.reduce((s, b) => s + (b.domainRating || 0), 0) / list.length);
    out.push({
      type: 'BACKLINK_LOST_HIGH_VALUE',
      category: 'BACKLINKS',
      insightType: 'ALERT',
      priority: avgDR >= 70 ? 'HIGH' : 'MEDIUM',
      titleKey: 'agent.insights.backlinkLostHighValue.title',
      descriptionKey: 'agent.insights.backlinkLostHighValue.description',
      data: {
        referringDomain: domain,
        count: list.length,
        avgDR,
        backlinkIds: list.map(b => b.id),
      },
      actionType: null,
      actionPayload: null,
      dedupKey: dedupKey('BACKLINK_LOST_HIGH_VALUE', domain),
    });
  }
  return out;
}

// ─── Detector: ANCHOR_OVER_OPTIMIZED ───────────────────────────────────────

function isLikelyExactMatch(anchor, otherAnchor) {
  if (!anchor || !otherAnchor) return false;
  const norm = (s) => s.toLowerCase().trim();
  return norm(anchor) === norm(otherAnchor);
}

function detectAnchorOverOpt({ siteId, backlinks }) {
  // Per-target anchor distribution. Skip empty targetUrl (GSC shadow rows)
  // since they have no anchor info anyway.
  const byTarget = new Map();
  for (const b of backlinks) {
    if (b.status !== 'ACTIVE') continue;
    if (!b.targetUrl || b.targetUrl === '') continue;
    if (!b.anchorText) continue;
    const list = byTarget.get(b.targetUrl) || [];
    list.push(b);
    byTarget.set(b.targetUrl, list);
  }

  const out = [];
  for (const [target, links] of byTarget.entries()) {
    if (links.length < ANCHOR_TARGET_MIN_SAMPLE) continue;

    // Find the most common anchor and its share. Generic anchors ("click here",
    // brand name) are not commercial — skip them. Heuristic: 1-2 word non-URL
    // anchors that look like queries are commercial; we just trust whatever
    // the dominant one is and let the user judge.
    const counts = new Map();
    for (const l of links) {
      const a = l.anchorText.toLowerCase().trim();
      counts.set(a, (counts.get(a) || 0) + 1);
    }
    let topAnchor = null;
    let topCount = 0;
    for (const [a, c] of counts.entries()) {
      if (c > topCount) { topAnchor = a; topCount = c; }
    }
    const share = topCount / links.length;
    if (share < ANCHOR_EXACT_MATCH_SHARE) continue;

    out.push({
      type: 'BACKLINK_ANCHOR_OVER_OPT',
      category: 'BACKLINKS',
      insightType: 'SUGGESTION',
      priority: share >= 0.5 ? 'HIGH' : 'MEDIUM',
      titleKey: 'agent.insights.backlinkAnchorOverOpt.title',
      descriptionKey: 'agent.insights.backlinkAnchorOverOpt.description',
      data: {
        targetUrl: target,
        topAnchor,
        topAnchorCount: topCount,
        totalLinks: links.length,
        sharePct: Math.round(share * 100),
      },
      actionType: null,
      actionPayload: null,
      dedupKey: dedupKey('BACKLINK_ANCHOR_OVER_OPT', target),
    });
  }
  return out;
}

// ─── Detector: BROKEN_TARGET ───────────────────────────────────────────────

async function headStatus(url) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), BROKEN_HEAD_TIMEOUT_MS);
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: ctrl.signal });
    clearTimeout(timer);
    return res.status;
  } catch {
    return null; // network error or timeout — don't claim broken
  }
}

async function detectBrokenTargets({ siteId, backlinks }) {
  // Pick the highest-traffic target URLs to check, capped by BROKEN_TARGETS_PER_RUN.
  // We rank by inbound link count so we never spend HEAD requests on long-tail pages.
  const counts = new Map();
  for (const b of backlinks) {
    if (b.status !== 'ACTIVE') continue;
    if (!b.targetUrl || b.targetUrl === '') continue;
    counts.set(b.targetUrl, (counts.get(b.targetUrl) || 0) + 1);
  }
  const ranked = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, BROKEN_TARGETS_PER_RUN)
    .map(([url]) => url);

  const out = [];
  for (const url of ranked) {
    const status = await headStatus(url);
    if (status === null) continue;
    if (status >= 400 && status < 500) {
      out.push({
        type: 'BACKLINK_BROKEN_TARGET',
        category: 'BACKLINKS',
        insightType: 'ACTION',
        priority: 'HIGH',
        titleKey: 'agent.insights.backlinkBrokenTarget.title',
        descriptionKey: 'agent.insights.backlinkBrokenTarget.description',
        data: {
          targetUrl: url,
          httpStatus: status,
          inboundLinks: counts.get(url),
        },
        actionType: null,
        actionPayload: null,
        dedupKey: dedupKey('BACKLINK_BROKEN_TARGET', url),
      });
    }
  }
  return out;
}

// ─── Detector: OPPORTUNITY ─────────────────────────────────────────────────

async function detectOpportunities({ siteId, accountId, backlinks }) {
  const competitors = await prisma.competitor.findMany({
    where: { siteId },
    select: { id: true, url: true, name: true },
    take: OPPORTUNITY_COMPETITORS_PER_RUN,
  });
  if (competitors.length === 0) return [];

  // The set of domains already linking to this site — used to filter out
  // overlap so we only surface NEW opportunity domains.
  const ownDomains = new Set(
    backlinks
      .filter(b => b.status !== 'BROKEN' && b.referringDomain)
      .map(b => b.referringDomain)
  );

  const candidates = new Map(); // domain → { domain, dr, viaCompetitor }

  for (const competitor of competitors) {
    let competitorLinks = [];
    try {
      competitorLinks = await fetchBacklinksForSite(competitor.url);
    } catch (err) {
      console.warn(`[backlink-insights/opportunity] competitor ${competitor.url} fetch failed:`, err?.message || err);
      continue;
    }
    for (const link of competitorLinks) {
      if (!link.referringDomain) continue;
      if (ownDomains.has(link.referringDomain)) continue;
      if (typeof link.domainRating !== 'number' || link.domainRating < OPPORTUNITY_DR_FLOOR) continue;
      const prev = candidates.get(link.referringDomain);
      if (!prev || (link.domainRating || 0) > (prev.dr || 0)) {
        candidates.set(link.referringDomain, {
          domain: link.referringDomain,
          dr: link.domainRating,
          viaCompetitor: competitor.url,
          sampleSourceUrl: link.referringUrl,
        });
      }
    }
  }

  const top = Array.from(candidates.values())
    .sort((a, b) => (b.dr || 0) - (a.dr || 0))
    .slice(0, OPPORTUNITY_MAX_INSIGHTS);

  return top.map(c => ({
    type: 'BACKLINK_OPPORTUNITY',
    category: 'BACKLINKS',
    insightType: 'SUGGESTION',
    priority: c.dr >= 60 ? 'HIGH' : 'MEDIUM',
    titleKey: 'agent.insights.backlinkOpportunity.title',
    descriptionKey: 'agent.insights.backlinkOpportunity.description',
    data: {
      referringDomain: c.domain,
      domainRating: c.dr,
      viaCompetitor: c.viaCompetitor,
      sampleSourceUrl: c.sampleSourceUrl,
    },
    actionType: null,
    actionPayload: null,
    dedupKey: dedupKey('BACKLINK_OPPORTUNITY', c.domain),
  }));
}

// ─── Orchestrator ──────────────────────────────────────────────────────────

/**
 * Run all detectors for a site and persist new insights. Returns counts.
 * Designed to be safe to call repeatedly: deduplicates against existing
 * PENDING/EXECUTED insights of the same type+key.
 *
 * @param {object} params
 * @param {string} params.siteId
 * @param {string} params.accountId
 * @param {object} [params.options]
 * @param {boolean} [params.options.skipBroken=false] - skip HEAD checks
 * @param {boolean} [params.options.skipOpportunities=false] - skip competitor fetch
 * @param {boolean} [params.options.skipToxic=false] - skip LLM call
 */
export async function runBacklinkInsights({ siteId, accountId, options = {} }) {
  const backlinks = await prisma.backlink.findMany({
    where: { siteId, isHidden: false },
    select: {
      id: true,
      referringUrl: true,
      referringDomain: true,
      targetUrl: true,
      anchorText: true,
      isDofollow: true,
      domainRating: true,
      spamScore: true,
      status: true,
      isToxic: true,
      isDisavowed: true,
      updatedAt: true,
    },
  });

  const detectorResults = await Promise.all([
    options.skipToxic ? Promise.resolve([]) : detectToxic({ siteId, accountId, backlinks }),
    Promise.resolve(detectLostHighValue({ siteId, backlinks })),
    Promise.resolve(detectAnchorOverOpt({ siteId, backlinks })),
    options.skipBroken ? Promise.resolve([]) : detectBrokenTargets({ siteId, backlinks }),
    options.skipOpportunities ? Promise.resolve([]) : detectOpportunities({ siteId, accountId, backlinks }),
  ]);
  const all = detectorResults.flat();
  if (all.length === 0) {
    return { created: 0, deduped: 0, total: 0 };
  }

  // Dedup against existing OPEN insights for this site (PENDING / EXECUTED /
  // any non-terminal status). REJECTED/RESOLVED rows do NOT block us re-
  // raising — the underlying signal is fresh and the user opted out of an
  // older instance, not the entire signal type.
  const existing = await prisma.agentInsight.findMany({
    where: {
      siteId,
      category: 'BACKLINKS',
      status: { in: ['PENDING', 'APPROVED', 'EXECUTED'] },
    },
    select: { titleKey: true, data: true },
  });
  const existingKeys = new Set(
    existing.map(e => {
      const t = e.titleKey || '';
      const type = t.startsWith('agent.insights.') ? typeFromTitleKey(t) : null;
      const key = e.data?.dedupKey || dedupForExisting(type, e.data);
      return key;
    }).filter(Boolean)
  );

  const fresh = all.filter(ins => !existingKeys.has(ins.dedupKey));
  if (fresh.length === 0) {
    return { created: 0, deduped: all.length, total: all.length };
  }

  const batchId = `backlinks-${siteId}-${Date.now()}`;
  await prisma.agentInsight.createMany({
    data: fresh.map(ins => ({
      siteId,
      accountId,
      category: ins.category,
      type: ins.insightType,
      priority: ins.priority,
      titleKey: ins.titleKey,
      descriptionKey: ins.descriptionKey,
      data: { ...ins.data, dedupKey: ins.dedupKey, insightSubtype: ins.type },
      actionType: ins.actionType,
      actionPayload: ins.actionPayload,
      status: 'PENDING',
      source: 'cron',
      batchId,
    })),
  });

  return { created: fresh.length, deduped: all.length - fresh.length, total: all.length };
}

// Reverse-map a known titleKey to an insight subtype for the dedup check.
// Kept narrow on purpose — only the keys we ourselves emit.
function typeFromTitleKey(titleKey) {
  if (titleKey.includes('backlinkToxic')) return 'BACKLINK_TOXIC';
  if (titleKey.includes('backlinkLostHighValue')) return 'BACKLINK_LOST_HIGH_VALUE';
  if (titleKey.includes('backlinkAnchorOverOpt')) return 'BACKLINK_ANCHOR_OVER_OPT';
  if (titleKey.includes('backlinkBrokenTarget')) return 'BACKLINK_BROKEN_TARGET';
  if (titleKey.includes('backlinkOpportunity')) return 'BACKLINK_OPPORTUNITY';
  return null;
}

// Build a dedupKey for legacy rows that pre-date `data.dedupKey`.
function dedupForExisting(type, data) {
  if (!type || !data) return null;
  switch (type) {
    case 'BACKLINK_TOXIC':
    case 'BACKLINK_LOST_HIGH_VALUE':
    case 'BACKLINK_OPPORTUNITY':
      return data.referringDomain ? dedupKey(type, data.referringDomain) : null;
    case 'BACKLINK_ANCHOR_OVER_OPT':
    case 'BACKLINK_BROKEN_TARGET':
      return data.targetUrl ? dedupKey(type, data.targetUrl) : null;
    default:
      return null;
  }
}
