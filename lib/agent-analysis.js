/**
 * AI Agent Analysis Engine
 * 
 * Analyzes site data (GSC, GA, entities, keywords, competitors) and generates
 * AgentInsight records with actionable suggestions, discoveries, and alerts.
 */

import prisma from '@/lib/prisma';
import { z } from 'zod';
import { BOT_FETCH_HEADERS } from '@/lib/bot-identity';
import { generateStructuredResponse } from '@/lib/ai/gemini.js';
import { performEntitySync, acquireSyncLock, releaseSyncLock } from '@/lib/entity-sync';
import { notifyAccountMembers } from '@/lib/notifications';
import { syncWidgetData } from '@/lib/widget-sync';
import {
  refreshAccessToken,
  fetchGSCReport,
  fetchGSCTopQueries,
  fetchGSCTopPages,
  fetchGSCQueryPagePairs,
  fetchGAReport,
  fetchGADailyTraffic,
  fetchGASpikeSourceContext,
  fetchAITrafficStats,
  listGSCSitemaps,
} from '@/lib/google-integration';
import { runCannibalizationEngine } from '@/lib/cannibalization-engine';
import { invalidateAgentInsights } from '@/lib/cache/invalidate.js';
import { buildDedupKey, getActiveRejectedKeys } from '@/lib/agent-rejections.js';

// ─── Constants ───────────────────────────────────────────────────────

const INSIGHT_EXPIRY_DAYS = 30;
const LOW_CTR_THRESHOLD = 2;       // 2% (GSC returns ctr as string percentage like "1.5")
const HIGH_IMPRESSION_THRESHOLD = 100;  // Lowered from 500 to catch more opportunities
const POSITION_STRIKE_ZONE = { min: 4, max: 20 }; // positions where a push could reach top 3
const TRAFFIC_DROP_THRESHOLD = -10; // -10% (lowered from -20 to catch smaller drops early)
const STALE_CONTENT_DAYS = 120;     // 4 months (lowered from 6 to be more proactive)
const WEEKEND_SKEW_THRESHOLD = 0.4;     // 40%+ difference between weekday and weekend avg triggers insight
const SPIKE_STDDEV_MULTIPLIER = 2.5;    // Daily traffic > mean + 2.5*stddev is a spike
const TRAFFIC_CONCENTRATION_THRESHOLD = 0.7; // 70% of clicks on top 3 pages = concentration risk
const AI_TRAFFIC_GROWTH_THRESHOLD = 30; // 30% AI traffic change triggers insight
const IMPRESSION_CLICK_GAP_THRESHOLD = 15; // impressions grow 15%+ more than clicks
const CANNIBAL_MIN_PAGE_IMPRESSIONS = 8; // each competing page needs some visibility (lowered to catch new content)
const CANNIBAL_MIN_QUERY_IMPRESSIONS = 25; // enough data to be meaningful but catch early cannibalization
const CANNIBAL_MAX_POSITION_GAP = 15; // new content may rank far from established pages
const CANNIBAL_MIN_SECONDARY_SHARE = 0.12; // secondary page just needs to show up (12% of primary)
const CANNIBAL_MAX_DOMINANT_SHARE = 0.92; // allow flagging even when primary dominates (up to 92%)
const MIN_GA_COMPARE_VISITORS = 120; // avoid GA trend insights on tiny traffic sites
const MIN_GSC_COMPARE_IMPRESSIONS = 600; // avoid GSC trend insights with weak sample size
const MIN_GSC_COMPARE_CLICKS = 25;
const MIN_AI_TRAFFIC_SESSIONS = 12; // avoid AI trend noise from tiny counts
const MIN_PATTERN_DAYS = 21; // at least ~3 weeks before pattern detection
const MIN_PATTERN_ACTIVE_DAYS = 10; // days with non-trivial traffic
const MIN_PATTERN_TOTAL_VISITORS = 180;
const MIN_PATTERN_AVG_VISITORS = 8;
const MIN_CONCENTRATION_CLICKS = 80;

// Meta title & description length rules
const META_TITLE_MIN_LENGTH = 30;
const META_TITLE_MAX_LENGTH = 60;
const META_DESC_MIN_LENGTH = 70;
const META_DESC_MAX_LENGTH = 160;

// SGE / AI Overviews zero-click detection
const SGE_MAX_POSITION = 5;                   // Query must rank in top 5
const SGE_MAX_POSITION_VARIANCE = 1.5;        // Position must be stable (change <= 1.5)
const SGE_MIN_IMPRESSIONS = 300;              // Sufficient search demand
const SGE_MAX_IMPRESSIONS_DROP = -10;         // Impressions must NOT have dropped > 10%
const SGE_MIN_CTR_DROP_PERCENT = 35;          // CTR must have dropped >= 35% relatively
const SGE_GA_SESSIONS_DROP_THRESHOLD = -25;   // GA4 organic sessions drop > 25% = confidence boost
const SGE_BASE_CONFIDENCE = 82;               // Base confidence score without GA4 cross-ref
const SGE_BOOSTED_CONFIDENCE = 99;            // Confidence when GA4 confirms the drop

// Expected CTR by position range - if actual CTR is less than half expected, flag it
const EXPECTED_CTR_BY_POSITION = [
  { min: 1, max: 1, expected: 28 },
  { min: 2, max: 2, expected: 15 },
  { min: 3, max: 3, expected: 10 },
  { min: 4, max: 5, expected: 6 },
  { min: 6, max: 10, expected: 2.5 },
];

// ─── Period Helpers ──────────────────────────────────────────────────

/**
 * Build period date ranges for comparison insights.
 * GSC data has a ~3-day delay, so its endDate is offset.
 * Returns ISO date strings (YYYY-MM-DD) for both current and previous periods.
 */
function getComparisonPeriods(days = 30, { gscOffset = false } = {}) {
  const end = new Date();
  if (gscOffset) end.setDate(end.getDate() - 3);
  const start = new Date(end);
  start.setDate(start.getDate() - days);

  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - days);

  const fmt = d => d.toISOString().slice(0, 10);
  return {
    periodStart: fmt(start),
    periodEnd: fmt(end),
    comparePeriodStart: fmt(prevStart),
    comparePeriodEnd: fmt(prevEnd),
  };
}

// ─── Main Entry Point ────────────────────────────────────────────────
// Note: buildDedupKey now lives in lib/agent-rejections.js so the rejection
// route and the cron compute identical keys. Don't redefine it here.

/**
 * Check if two cannibalization dedup keys overlap significantly.
 * Returns true if the URL sets share at least one URL in common.
 * This handles partial fixes where some URLs were removed but the cluster persists.
 */
function cannibalizationKeysOverlap(keyA, keyB) {
  // Only compare keys with the same titleKey prefix
  const prefixA = keyA.split(':')[0];
  const prefixB = keyB.split(':')[0];
  if (prefixA !== prefixB) return false;

  const urlsA = keyA.split(':').slice(1).join(':').split('|').filter(Boolean);
  const urlsB = keyB.split(':').slice(1).join(':').split('|').filter(Boolean);
  if (urlsA.length === 0 || urlsB.length === 0) return false;

  const setA = new Set(urlsA);
  return urlsB.some(url => setA.has(url));
}

/**
 * Run a full analysis for a single site.
 * Creates an AgentRun record (unless existingRunId provided) and generates AgentInsight records.
 * 
 * @param {string} siteId 
 * @param {string} accountId 
 * @param {string} source - "cron" | "manual"
 * @param {string} [existingRunId] - If provided, reuse this run record instead of creating a new one
 * @param {string} [userId] - Optional user ID for Ai-GCoin tracking (null for cron jobs)
 * @returns {{ runId: string, insightsCount: number, resolvedCount: number }}
 */
export async function runSiteAnalysis(siteId, accountId, source = 'cron', existingRunId = null, userId = null, options = {}) {
  let run;
  if (existingRunId) {
    run = await prisma.agentRun.findUnique({ where: { id: existingRunId } });
    if (!run) throw new Error(`AgentRun ${existingRunId} not found`);
  } else {
    run = await prisma.agentRun.create({
      data: { siteId, accountId, source },
    });
  }

  const batchId = run.id;
  const insights = [];

  try {
    // Gather site context
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      include: { googleIntegration: true },
    });

    if (!site) throw new Error(`Site ${siteId} not found`);

    // Sync entities before analysis to ensure data freshness
    if (site.siteKey && site.siteSecret) {
      try {
        const lockAcquired = await acquireSyncLock(siteId, 'agent-analysis');
        if (lockAcquired) {
          console.log(`[AgentAnalysis] Syncing entities for site ${siteId} before analysis...`);
          await performEntitySync(site, { source: 'agent-analysis', notify: false });
          await releaseSyncLock(siteId, 'COMPLETED');
          console.log(`[AgentAnalysis] Entity sync completed for site ${siteId}`);
        } else {
          console.log(`[AgentAnalysis] Entity sync already in progress for site ${siteId}, proceeding with existing data`);
        }
      } catch (syncError) {
        console.error(`[AgentAnalysis] Entity sync failed for site ${siteId}:`, syncError.message);
        await releaseSyncLock(siteId, 'FAILED', syncError.message).catch(() => {});
      }
    }

    // Check agent config - skip disabled modules
    const agentConfig = site.toolSettings?.agentConfig || {};
    const modules = agentConfig.modules || { content: true, traffic: true, keywords: true, competitors: true, technical: true };

    // Run analysis modules in parallel where possible
    const allResults = await Promise.allSettled([
      modules.keywords ? analyzeKeywords(site, batchId) : Promise.resolve([]),
      modules.content ? analyzeContent(site, batchId, userId) : Promise.resolve([]),
      modules.traffic ? analyzeGSCData(site, batchId) : Promise.resolve([]),
      modules.traffic ? analyzeGAData(site, batchId) : Promise.resolve([]),
      modules.competitors ? analyzeCompetitors(site, batchId) : Promise.resolve([]),
      modules.traffic ? analyzeCannibalization(site, batchId) : Promise.resolve([]),
      modules.keywords && modules.traffic ? analyzeNewKeywordOpportunities(site, batchId) : Promise.resolve([]),
      modules.traffic ? analyzeCtrByPosition(site, batchId) : Promise.resolve([]),
      modules.content && modules.traffic ? analyzeContentWithoutTraffic(site, batchId) : Promise.resolve([]),
      modules.traffic ? analyzeWeekendPattern(site, batchId) : Promise.resolve([]),
      modules.traffic ? analyzeTrafficSpikes(site, batchId) : Promise.resolve([]),
      modules.traffic ? analyzeImpressionClickGap(site, batchId) : Promise.resolve([]),
      modules.traffic ? analyzeAITrafficTrend(site, batchId) : Promise.resolve([]),
      modules.traffic ? analyzeAiEngineCoverage(site, batchId) : Promise.resolve([]),
      modules.traffic ? analyzeTrafficConcentration(site, batchId) : Promise.resolve([]),
      modules.traffic ? analyzeSgeTrafficTheft(site, batchId) : Promise.resolve([]),
      modules.content ? analyzePostImages(site, batchId) : Promise.resolve([]),
      modules.technical !== false ? analyzeGscSitemapSubmission(site, batchId) : Promise.resolve([]),
      modules.content ? analyzeH1Tags(site, batchId) : Promise.resolve([]),
      modules.technical !== false ? analyzeNumericSlugSuffix(site, batchId) : Promise.resolve([]),
    ]);

    // Collect all successful insights
    for (const result of allResults) {
      if (result.status === 'fulfilled' && result.value?.length > 0) {
        insights.push(...result.value);
      }
    }

    // Build dedup keys for all insights found in this run
    const currentDedupKeys = new Set(insights.map(i => buildDedupKey(i.titleKey, i.data)));
    // Map from dedup key → new insight data (for updating stale data on existing insights)
    const currentInsightByKey = new Map(insights.map(i => [buildDedupKey(i.titleKey, i.data), i]));

    // Fetch all active (non-terminal) insights for this site
    const existingInsights = await prisma.agentInsight.findMany({
      where: { siteId, status: { in: ['PENDING', 'EXECUTED', 'APPROVED', 'FAILED'] } },
      select: { id: true, titleKey: true, data: true, status: true },
    });

    // Separate existing into: still-relevant (re-found) vs stale (not re-found)
    const staleInsightIds = [];
    const existingKeys = new Set();
    const insightsToUpdate = []; // existing insights whose data needs refreshing
    for (const e of existingInsights) {
      const key = buildDedupKey(e.titleKey, e.data);
      if (currentDedupKeys.has(key)) {
        // Exact match - insight still detected. Refresh data + actionPayload so the user sees the current page list, not a snapshot from when the insight was first created.
        existingKeys.add(key);
        const fresh = currentInsightByKey.get(key);
        if (fresh) {
          insightsToUpdate.push({ id: e.id, data: fresh.data, actionPayload: fresh.actionPayload });
        }
      } else if (e.status === 'EXECUTED' && e.titleKey?.includes('cannibalization')) {
        // EXECUTED cannibalization insight with changed URL set (partial fix).
        // Check if a newly detected cannibalization overlaps with this old one.
        // If so, update the existing insight with the new (smaller) URL set
        // instead of resolving the old and creating a duplicate new one.
        let overlappingKey = null;
        for (const currentKey of currentDedupKeys) {
          if (currentKey.includes('cannibalization') && cannibalizationKeysOverlap(key, currentKey)) {
            overlappingKey = currentKey;
            break;
          }
        }
        if (overlappingKey) {
          // Remaining URLs still cannibalize - update existing insight with new data
          existingKeys.add(overlappingKey);
          const fresh = currentInsightByKey.get(overlappingKey);
          if (fresh) {
            insightsToUpdate.push({
              id: e.id,
              data: fresh.data,
              actionPayload: fresh.actionPayload,
              // Reset to PENDING so user sees it needs attention again
              status: 'PENDING',
            });
          }
        } else {
          // No overlap found - truly resolved
          staleInsightIds.push(e.id);
        }
      } else {
        staleInsightIds.push(e.id);
      }
    }

    // Mark stale insights as RESOLVED (no longer detected) - covers PENDING, EXECUTED, APPROVED, FAILED
    if (staleInsightIds.length > 0) {
      await prisma.agentInsight.updateMany({
        where: { id: { in: staleInsightIds } },
        data: { status: 'RESOLVED', resolvedAt: new Date() },
      });
    }

    // Update data on existing insights that are still relevant but have stale data
    for (const upd of insightsToUpdate) {
      const updatePayload = { data: upd.data, actionPayload: upd.actionPayload };
      // If the insight was EXECUTED but still has cannibalization, reset to PENDING
      if (upd.status) {
        updatePayload.status = upd.status;
        updatePayload.executedAt = null;
        updatePayload.executionResult = null;
      }
      await prisma.agentInsight.update({
        where: { id: upd.id },
        data: updatePayload,
      });
    }

    // Create only genuinely new insights (not already tracked).
    // Also drop anything the user has explicitly rejected/dismissed within
    // the rejection TTL (60d) - see lib/agent-rejections.js. Without this
    // filter, rejected suggestions came back on every cron run, eroding
    // user trust in the agent.
    const rejectedKeys = await getActiveRejectedKeys(siteId).catch(() => new Set());
    const newInsights = insights.filter(i => {
      const key = buildDedupKey(i.titleKey, i.data);
      if (existingKeys.has(key)) return false;
      if (rejectedKeys.has(key)) return false;
      return true;
    });
    const suppressedByRejection = insights.filter(i => {
      const key = buildDedupKey(i.titleKey, i.data);
      return !existingKeys.has(key) && rejectedKeys.has(key);
    }).length;

    if (newInsights.length > 0) {
      await prisma.agentInsight.createMany({
        data: newInsights.map(insight => ({
          siteId,
          accountId,
          batchId,
          expiresAt: new Date(Date.now() + INSIGHT_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
          ...insight,
        })),
      });
    }

    // Any of the above writes (resolve stale, update existing, create new) warrant
    // invalidating the insight list cache for this site.
    if (staleInsightIds.length > 0 || insightsToUpdate.length > 0 || newInsights.length > 0) {
      invalidateAgentInsights(siteId);
    }

    // Always send notification when analysis completes
    const notifyEnabled = site.toolSettings?.agentConfig?.notifyInsights !== false;
    if (notifyEnabled) {
      const hasAlerts = newInsights.some(i => i.type === 'ALERT');
      const hasNewInsights = newInsights.length > 0;
      await notifyAccountMembers(accountId, {
        type: hasAlerts ? 'agent_alert' : 'agent_insights',
        title: hasNewInsights ? 'notifications.agentInsights.title' : 'notifications.agentInsights.titleNoNew',
        message: hasNewInsights ? 'notifications.agentInsights.message' : 'notifications.agentInsights.messageNoNew',
        link: '/dashboard/agent',
        data: { siteId, siteName: site.name, count: newInsights.length, hasAlerts },
      });
    }

    // Update summary
    const summary = {
      discoveries: newInsights.filter(i => i.type === 'DISCOVERY').length,
      suggestions: newInsights.filter(i => i.type === 'SUGGESTION').length,
      actions: newInsights.filter(i => i.type === 'ACTION').length,
      alerts: newInsights.filter(i => i.type === 'ALERT').length,
      analyses: newInsights.filter(i => i.type === 'ANALYSIS').length,
      skippedDuplicates: insights.length - newInsights.length - suppressedByRejection,
      suppressedByRejection,
      resolved: staleInsightIds.length,
    };

    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        insightsCount: newInsights.length,
        summary,
      },
    });

    // Push updated widget data to WordPress plugin
    syncWidgetData(siteId).catch(() => {}); // fire-and-forget

    // Chat follow-up: if this scan was kicked off from the AI chat, post a
    // "scan finished, X insights" message back into that conversation.
    if (options.chatConversationId) {
      postAgentScanChatFollowUp(options.chatConversationId, {
        siteId,
        success: true,
        insightsCount: newInsights.length,
      }).catch(() => {});
    }

    return { runId: run.id, insightsCount: newInsights.length, resolvedCount: staleInsightIds.length };
  } catch (error) {
    console.error(`[Agent] Analysis failed for site ${siteId}:`, error);

    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        error: error.message,
      },
    });

    if (options.chatConversationId) {
      postAgentScanChatFollowUp(options.chatConversationId, {
        siteId,
        success: false,
        error: error.message,
      }).catch(() => {});
    }

    return { runId: run.id, insightsCount: 0, error: error.message };
  }
}

/**
 * Post a follow-up assistant message into a chat conversation when an agent
 * analysis run finishes. Mirrors the audit follow-up - bilingual (HE/EN
 * detected from recent user messages), best-effort, bumps updatedAt.
 */
async function postAgentScanChatFollowUp(conversationId, { siteId, success, insightsCount, error }) {
  if (!conversationId) return;
  try {
    const recent = await prisma.chatMessage.findMany({
      where: { conversationId, role: 'USER' },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { content: true },
    });
    const text = recent.map((m) => m.content).join(' ');
    const isHe = (text.match(/[֐-׿]/g) || []).length > 5;

    const link = `/dashboard/agent?siteId=${siteId}`;
    let content;
    if (success) {
      content = isHe
        ? `### ✅ סריקת AI Agent הסתיימה\n\nנוצרו **${insightsCount}** תובנות חדשות. לחץ על [לוח ה-Agent](${link}) כדי לעבור עליהן. תרצה שאסביר לך את השלוש הכי חשובות?`
        : `### ✅ AI agent scan finished\n\nGenerated **${insightsCount}** new insight(s). Open the [agent dashboard](${link}) to review them. Want me to walk you through the top three?`;
    } else {
      const errMsg = error ? String(error).slice(0, 240) : (isHe ? 'שגיאה לא ידועה' : 'Unknown error');
      content = isHe
        ? `### ❌ סריקת AI Agent נכשלה\n\nשגיאה: ${errMsg}\n\nלחץ על [לוח ה-Agent](${link}) או בקש ממני להריץ סריקה חדשה.`
        : `### ❌ AI agent scan failed\n\nError: ${errMsg}\n\nOpen the [agent dashboard](${link}) or ask me to run a new scan.`;
    }

    await prisma.chatMessage.create({
      data: { conversationId, role: 'ASSISTANT', content },
    });
    await prisma.chatConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
  } catch (err) {
    console.warn('[Agent] postAgentScanChatFollowUp failed:', err.message);
  }
}

// ─── Google Token Helper ─────────────────────────────────────────────

async function getValidAccessToken(googleIntegration) {
  if (!googleIntegration) return null;

  const { accessToken, refreshToken, tokenExpiresAt } = googleIntegration;

  // Check if token is still valid (5-min buffer)
  if (tokenExpiresAt && new Date(tokenExpiresAt) > new Date(Date.now() + 5 * 60 * 1000)) {
    return accessToken;
  }

  // Refresh the token
  if (!refreshToken) return null;

  try {
    const result = await refreshAccessToken(refreshToken);
    const newExpiry = new Date(Date.now() + (result.expires_in - 60) * 1000);

    await prisma.googleIntegration.update({
      where: { id: googleIntegration.id },
      data: { accessToken: result.access_token, tokenExpiresAt: newExpiry },
    });

    return result.access_token;
  } catch {
    console.error('[Agent] Token refresh failed for integration', googleIntegration.id);
    return null;
  }
}

// ─── Keyword Analysis ────────────────────────────────────────────────

async function analyzeKeywords(site, batchId) {
  const insights = [];

  const keywords = await prisma.keyword.findMany({
    where: { siteId: site.id, status: { in: ['TRACKING', 'TARGETING', 'RANKING'] } },
  });

  if (keywords.length === 0) return insights;

  // Find keywords in "strike zone" (pos 4-20)
  const strikeZoneKeywords = keywords.filter(
    k => k.position && k.position >= POSITION_STRIKE_ZONE.min && k.position <= POSITION_STRIKE_ZONE.max && (k.searchVolume || 0) > 10
  );

  for (const kw of strikeZoneKeywords.slice(0, 5)) {
    insights.push({
      category: 'KEYWORDS',
      type: 'SUGGESTION',
      priority: kw.position <= 10 ? 'HIGH' : 'MEDIUM',
      titleKey: 'agent.insights.keywordStrikeZone.title',
      descriptionKey: 'agent.insights.keywordStrikeZone.description',
      data: {
        keyword: kw.keyword,
        position: kw.position,
        searchVolume: kw.searchVolume,
        url: kw.url,
        keywordId: kw.id,
      },
    });
  }

  // Find keywords with no URL (not ranking for any page)
  const unlinkedKeywords = keywords.filter(k => !k.url && (k.searchVolume || 0) > 20);

  if (unlinkedKeywords.length > 0) {
    insights.push({
      category: 'KEYWORDS',
      type: 'DISCOVERY',
      priority: 'MEDIUM',
      titleKey: 'agent.insights.unlinkedKeywords.title',
      descriptionKey: 'agent.insights.unlinkedKeywords.description',
      data: {
        count: unlinkedKeywords.length,
        keywords: unlinkedKeywords.slice(0, 10).map(k => ({
          keyword: k.keyword,
          searchVolume: k.searchVolume,
        })),
      },
    });
  }

  return insights;
}

// ─── Content Health Analysis ────────────────────────────────────────

async function analyzeContent(site, batchId, userId = null) {
  const insights = [];

  // Get published entities (only of currently enabled types - disabled types must be invisible to analysis)
  const rawEntities = await prisma.siteEntity.findMany({
    where: { siteId: site.id, status: 'PUBLISHED', entityType: { isEnabled: true } },
    select: { id: true, title: true, slug: true, url: true, seoData: true, updatedAt: true, publishedAt: true, metadata: true },
  });

  // Deduplicate by URL (prefer entity with seoData or most recently updated)
  const urlMap = new Map();
  for (const e of rawEntities) {
    const key = e.url?.replace(/^https?:\/\//, '').replace(/\/$/, '') || e.id;
    const existing = urlMap.get(key);
    if (!existing || (e.seoData && !existing.seoData) || (e.updatedAt > existing.updatedAt)) {
      urlMap.set(key, e);
    }
  }
  const entities = [...urlMap.values()];

  if (entities.length === 0) return insights;

  // Find stale content (not updated in 6+ months)
  const staleDate = new Date(Date.now() - STALE_CONTENT_DAYS * 24 * 60 * 60 * 1000);
  const staleEntities = entities.filter(e => {
    const lastUpdate = e.updatedAt || e.publishedAt;
    return lastUpdate && new Date(lastUpdate) < staleDate;
  });

  if (staleEntities.length > 0) {
    insights.push({
      category: 'CONTENT',
      type: 'SUGGESTION',
      priority: staleEntities.length > 10 ? 'HIGH' : 'MEDIUM',
      titleKey: 'agent.insights.staleContent.title',
      descriptionKey: 'agent.insights.staleContent.description',
      data: {
        count: staleEntities.length,
        oldestPages: staleEntities
          .sort((a, b) => new Date(a.updatedAt || a.publishedAt) - new Date(b.updatedAt || b.publishedAt))
          .slice(0, 5)
          .map(e => ({ title: e.title, slug: e.slug, url: e.url, updatedAt: e.updatedAt })),
      },
    });
  }

  // Find pages missing SEO metadata
  // seoData uses 'description' (not 'metaDesc') from both bulk sync and individual API
  // If a SEO plugin is detected (source field), the title/desc may be template-resolved
  const missingSeo = entities.filter(e => {
    const seo = e.seoData;
    if (!seo) return true;
    // If an SEO plugin is present, both title and description should be populated
    // (the WP plugin resolves templates, so empty means truly missing)
    return !seo.title || !seo.description;
  });

  if (missingSeo.length > 0) {
    // Use AI to assess SEO priority of each page
    const scored = await assessSeoRelevance(missingSeo.slice(0, 15), site, userId);
    const relevant = scored.filter(p => p.seoPriority !== 'skip');

    if (relevant.length > 0) {
      // Sort: high > medium > low
      const order = { high: 0, medium: 1, low: 2 };
      relevant.sort((a, b) => (order[a.seoPriority] ?? 2) - (order[b.seoPriority] ?? 2));

      const topPages = relevant.slice(0, 10);
      const highCount = topPages.filter(p => p.seoPriority === 'high').length;

      insights.push({
        category: 'TECHNICAL',
        type: 'ACTION',
        priority: highCount >= 3 ? 'HIGH' : relevant.length > 5 ? 'HIGH' : 'MEDIUM',
        titleKey: 'agent.insights.missingSeo.title',
        descriptionKey: 'agent.insights.missingSeo.description',
        data: {
          count: relevant.length,
          pages: topPages.map(p => ({ title: p.title, slug: p.slug, url: p.url, seoPriority: p.seoPriority })),
        },
        actionType: 'generate_meta',
        actionPayload: { entityIds: topPages.map(p => p.id) },
      });
    }
  }

  // Find pages with meta title/description length issues
  const seoLengthIssues = [];
  for (const e of entities) {
    const seo = e.seoData;
    if (!seo) continue; // already flagged by missingSeo check
    const issues = [];
    if (seo.title) {
      const len = seo.title.length;
      if (len < META_TITLE_MIN_LENGTH) issues.push({ field: 'title', issue: 'too_short', length: len, min: META_TITLE_MIN_LENGTH, max: META_TITLE_MAX_LENGTH });
      else if (len > META_TITLE_MAX_LENGTH) issues.push({ field: 'title', issue: 'too_long', length: len, min: META_TITLE_MIN_LENGTH, max: META_TITLE_MAX_LENGTH });
    }
    if (seo.description) {
      const len = seo.description.length;
      if (len < META_DESC_MIN_LENGTH) issues.push({ field: 'description', issue: 'too_short', length: len, min: META_DESC_MIN_LENGTH, max: META_DESC_MAX_LENGTH });
      else if (len > META_DESC_MAX_LENGTH) issues.push({ field: 'description', issue: 'too_long', length: len, min: META_DESC_MIN_LENGTH, max: META_DESC_MAX_LENGTH });
    }
    if (issues.length > 0) {
      seoLengthIssues.push({ title: e.title, slug: e.slug, url: e.url, id: e.id, issues });
    }
  }

  if (seoLengthIssues.length > 0) {
    const titleTooShort = seoLengthIssues.filter(e => e.issues.some(i => i.field === 'title' && i.issue === 'too_short'));
    const titleTooLong = seoLengthIssues.filter(e => e.issues.some(i => i.field === 'title' && i.issue === 'too_long'));
    const descTooShort = seoLengthIssues.filter(e => e.issues.some(i => i.field === 'description' && i.issue === 'too_short'));
    const descTooLong = seoLengthIssues.filter(e => e.issues.some(i => i.field === 'description' && i.issue === 'too_long'));

    if (titleTooShort.length > 0) {
      insights.push({
        category: 'TECHNICAL', type: 'SUGGESTION',
        priority: titleTooShort.length > 10 ? 'HIGH' : 'MEDIUM',
        titleKey: 'agent.insights.metaTitleTooShort.title',
        descriptionKey: 'agent.insights.metaTitleTooShort.description',
        data: {
          count: titleTooShort.length, minLength: META_TITLE_MIN_LENGTH, maxLength: META_TITLE_MAX_LENGTH,
          pages: titleTooShort.slice(0, 10).map(e => ({ title: e.title, slug: e.slug, url: e.url, length: e.issues.find(i => i.field === 'title').length })),
        },
      });
    }
    if (titleTooLong.length > 0) {
      insights.push({
        category: 'TECHNICAL', type: 'SUGGESTION',
        priority: titleTooLong.length > 10 ? 'HIGH' : 'MEDIUM',
        titleKey: 'agent.insights.metaTitleTooLong.title',
        descriptionKey: 'agent.insights.metaTitleTooLong.description',
        data: {
          count: titleTooLong.length, minLength: META_TITLE_MIN_LENGTH, maxLength: META_TITLE_MAX_LENGTH,
          pages: titleTooLong.slice(0, 10).map(e => ({ title: e.title, slug: e.slug, url: e.url, length: e.issues.find(i => i.field === 'title').length })),
        },
      });
    }
    if (descTooShort.length > 0) {
      insights.push({
        category: 'TECHNICAL', type: 'SUGGESTION',
        priority: descTooShort.length > 10 ? 'HIGH' : 'MEDIUM',
        titleKey: 'agent.insights.metaDescTooShort.title',
        descriptionKey: 'agent.insights.metaDescTooShort.description',
        data: {
          count: descTooShort.length, minLength: META_DESC_MIN_LENGTH, maxLength: META_DESC_MAX_LENGTH,
          pages: descTooShort.slice(0, 10).map(e => ({ title: e.title, slug: e.slug, url: e.url, length: e.issues.find(i => i.field === 'description').length })),
        },
      });
    }
    if (descTooLong.length > 0) {
      insights.push({
        category: 'TECHNICAL', type: 'SUGGESTION',
        priority: descTooLong.length > 10 ? 'HIGH' : 'MEDIUM',
        titleKey: 'agent.insights.metaDescTooLong.title',
        descriptionKey: 'agent.insights.metaDescTooLong.description',
        data: {
          count: descTooLong.length, minLength: META_DESC_MIN_LENGTH, maxLength: META_DESC_MAX_LENGTH,
          pages: descTooLong.slice(0, 10).map(e => ({ title: e.title, slug: e.slug, url: e.url, length: e.issues.find(i => i.field === 'description').length })),
        },
      });
    }
  }

  // Find published pages with noindex set
  const noindexPages = entities.filter(e => e.seoData?.noIndex === true);

  if (noindexPages.length > 0) {
    insights.push({
      category: 'TECHNICAL',
      type: 'ALERT',
      priority: noindexPages.length > 5 ? 'HIGH' : 'MEDIUM',
      titleKey: 'agent.insights.noindexDetected.title',
      descriptionKey: 'agent.insights.noindexDetected.description',
      data: {
        count: noindexPages.length,
        pages: noindexPages.slice(0, 10).map(e => ({
          title: e.title,
          slug: e.slug,
          url: e.url,
        })),
      },
    });
  }

  return insights;
}

// ─── Post Image Analysis ────────────────────────────────────────────

const WORDS_PER_IMAGE = 500; // Expect at least 1 content image per 500 words
const MIN_WORD_COUNT_FOR_IMAGES = 300; // Only check posts with 300+ words

async function analyzePostImages(site, batchId) {
  const insights = [];

  // Fetch published entities with content and featuredImage (enabled types only)
  const rawEntities = await prisma.siteEntity.findMany({
    where: { siteId: site.id, status: 'PUBLISHED', entityType: { isEnabled: true } },
    select: {
      id: true, title: true, slug: true, url: true,
      content: true, featuredImage: true, externalId: true,
      entityType: { select: { slug: true } },
    },
  });

  // Only analyze posts/articles (skip pages, categories, etc.)
  const postTypes = new Set(['post', 'posts', 'article', 'articles', 'blog', 'blog-post']);
  const entities = rawEntities.filter(e => {
    const typeSlug = e.entityType?.slug?.toLowerCase();
    return typeSlug && postTypes.has(typeSlug);
  });

  if (entities.length === 0) return insights;

  // ── 1) Missing Featured Image ──
  const missingFeatured = entities.filter(e => !e.featuredImage);

  if (missingFeatured.length > 0) {
    insights.push({
      category: 'CONTENT',
      type: 'ACTION',
      priority: missingFeatured.length > 5 ? 'HIGH' : 'MEDIUM',
      titleKey: 'agent.insights.missingFeaturedImage.title',
      descriptionKey: 'agent.insights.missingFeaturedImage.description',
      data: {
        count: missingFeatured.length,
        pages: missingFeatured.map(e => ({
          id: e.id,
          title: e.title,
          slug: e.slug,
          url: e.url,
          externalId: e.externalId,
        })),
      },
      actionType: 'generate_featured_image',
      actionPayload: { entityIds: missingFeatured.map(e => e.id) },
    });
  }

  // ── 2) Insufficient Content Images ──
  const insufficientImages = [];

  for (const entity of entities) {
    if (!entity.content) continue;

    // Count words in content (strip HTML first)
    const textContent = entity.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const wordCount = textContent.split(/\s+/).length;

    if (wordCount < MIN_WORD_COUNT_FOR_IMAGES) continue;

    // Count existing images in content
    const imgMatches = entity.content.match(/<img\s/gi) || [];
    const imageCount = imgMatches.length;

    // Calculate recommended image count
    const recommendedImages = Math.max(1, Math.floor(wordCount / WORDS_PER_IMAGE));

    if (imageCount < recommendedImages) {
      insufficientImages.push({
        id: entity.id,
        title: entity.title,
        slug: entity.slug,
        url: entity.url,
        externalId: entity.externalId,
        wordCount,
        imageCount,
        recommendedImages,
        deficit: recommendedImages - imageCount,
      });
    }
  }

  if (insufficientImages.length > 0) {
    // Sort by largest deficit first
    insufficientImages.sort((a, b) => b.deficit - a.deficit);

    insights.push({
      category: 'CONTENT',
      type: 'SUGGESTION',
      priority: insufficientImages.length > 10 ? 'HIGH' : 'MEDIUM',
      titleKey: 'agent.insights.insufficientContentImages.title',
      descriptionKey: 'agent.insights.insufficientContentImages.description',
      data: {
        count: insufficientImages.length,
        pages: insufficientImages.map(p => ({
          id: p.id,
          title: p.title,
          slug: p.slug,
          url: p.url,
          externalId: p.externalId,
          wordCount: p.wordCount,
          imageCount: p.imageCount,
          recommendedImages: p.recommendedImages,
        })),
      },
      actionType: 'generate_content_images',
      actionPayload: { entityIds: insufficientImages.map(p => p.id) },
    });
  }

  return insights;
}

// ─── AI SEO Relevance Assessment ────────────────────────────────────

const SeoRelevanceSchema = z.object({
  pages: z.array(z.object({
    index: z.number(),
    seoPriority: z.enum(['high', 'medium', 'low', 'skip']),
  })),
});

/**
 * Use AI to assess how important each page is for SEO.
 * Pages like accessibility statements, thank-you pages, privacy policies etc.
 * are deprioritized. Content-rich pages, blog posts, service/product pages are prioritized.
 */
async function assessSeoRelevance(pages, site, userId = null) {
  try {
    const pageList = pages.map((e, i) => `${i}. "${e.title}" - ${e.slug} - ${e.url || 'no url'}`).join('\n');

    const result = await generateStructuredResponse({
      system: `You are an SEO expert. Assess the SEO importance of website pages.
Classify each page's SEO priority:
- "high": Core content pages that drive organic traffic - blog posts, service pages, product pages, landing pages, portfolio items, about page, main category pages.
- "medium": Somewhat useful for SEO - category archives, tag pages, author pages, FAQ pages.
- "low": Minor SEO value - contact page, generic informational pages.
- "skip": No SEO value - accessibility statements, privacy policies, terms of service, cookie policies, thank-you/confirmation pages, 404 pages, login/register pages, admin pages, legal disclaimers, sitemaps, search results pages.

Consider the website context: "${site.name}" (${site.url}).
Be decisive - most content pages should be "high", utility/legal pages should be "skip".`,
      prompt: `Classify these pages by SEO priority:\n\n${pageList}`,
      schema: SeoRelevanceSchema,
      temperature: 0.2,
      operation: 'AGENT_ANALYSIS',
      metadata: { subOperation: 'seo-relevance', siteId: site.id, pageCount: pages.length },
      accountId: site.accountId,
      siteId: site.id,
      userId,
    });

    // Merge AI scores back into page data
    const scored = pages.map((e, i) => {
      const aiResult = result?.pages?.find(p => p.index === i);
      return { ...e, seoPriority: aiResult?.seoPriority || 'medium' };
    });

    return scored;
  } catch (err) {
    console.error('[Agent Analysis] SEO relevance assessment failed, using all pages:', err.message);
    // Fallback: return all pages as medium priority
    return pages.map(e => ({ ...e, seoPriority: 'medium' }));
  }
}

// ─── GSC Data Analysis ──────────────────────────────────────────────

async function analyzeGSCData(site, batchId) {
  const insights = [];
  const { googleIntegration } = site;

  if (!googleIntegration?.gscConnected || !googleIntegration?.gscSiteUrl) return insights;

  const accessToken = await getValidAccessToken(googleIntegration);
  if (!accessToken) return insights;

  try {
    // Fetch current period (last 30 days) vs previous 30 days
    const [report, topQueries, topPages] = await Promise.all([
      fetchGSCReport(accessToken, googleIntegration.gscSiteUrl, 30),
      fetchGSCTopQueries(accessToken, googleIntegration.gscSiteUrl, 30),
      fetchGSCTopPages(accessToken, googleIntegration.gscSiteUrl, 30),
    ]);

    const gscPeriod = getComparisonPeriods(30, { gscOffset: true });
    const hasGscComparisonSignal = hasSufficientGscComparisonData(report);

    // Check for significant traffic drops
    // fetchGSCReport returns clicksChange as integer percentage (e.g. -25 means -25%)
    if (hasGscComparisonSignal && report?.clicksChange && report.clicksChange < TRAFFIC_DROP_THRESHOLD) {
      // Get top declining pages to show which pages are affected
      const decliningPagesForAlert = topPages?.filter(
        p => p.clicksChange && p.clicksChange < 0
      ).slice(0, 5).map(p => ({
        page: p.page,
        title: p.title || null,
        clicks: p.clicks,
        clicksChange: p.clicksChange,
      })) || [];

      insights.push({
        category: 'TRAFFIC',
        type: 'ALERT',
        priority: report.clicksChange < -50 ? 'CRITICAL' : 'HIGH',
        titleKey: 'agent.insights.trafficDrop.title',
        descriptionKey: 'agent.insights.trafficDrop.description',
        data: {
          ...gscPeriod,
          clicks: report.clicks,
          change: report.clicksChange / 100, // normalize to decimal for translation placeholder
          impressions: report.impressions,
          impressionsChange: report.impressionsChange,
          pages: decliningPagesForAlert,
        },
      });
    }

    // Find high-impression low-CTR queries (optimization opportunities)
    // fetchGSCTopQueries returns ctr as string percentage (e.g. "1.5" means 1.5%)
    if (topQueries?.length > 0) {
      const lowCtrHighImp = topQueries.filter(
        q => q.impressions >= HIGH_IMPRESSION_THRESHOLD && parseFloat(q.ctr) < LOW_CTR_THRESHOLD
      );

      if (lowCtrHighImp.length > 0) {
        insights.push({
          category: 'KEYWORDS',
          type: 'SUGGESTION',
          priority: 'HIGH',
          titleKey: 'agent.insights.lowCtrQueries.title',
          descriptionKey: 'agent.insights.lowCtrQueries.description',
          data: {
            count: lowCtrHighImp.length,
            queries: lowCtrHighImp.slice(0, 5).map(q => ({
              query: q.query,
              impressions: q.impressions,
              ctr: q.ctr,
              position: q.position,
            })),
          },
        });
      }
    }

    // Find pages with declining clicks
    // fetchGSCTopPages returns clicksChange as integer percentage (e.g. -30 means -30%)
    if (topPages?.length > 0) {
      const decliningPages = topPages.filter(
        p => p.clicksChange && p.clicksChange < TRAFFIC_DROP_THRESHOLD && p.clicks > 3
      );

      if (decliningPages.length > 0) {
        // Fetch entities to match URLs for edit links and titles (enabled types only)
        const entities = await prisma.siteEntity.findMany({
          where: { siteId: site.id, status: 'PUBLISHED', entityType: { isEnabled: true } },
          select: { id: true, entityType: { select: { slug: true } }, url: true, title: true },
        });
        
        // Build URL to entity map (normalize URLs for matching)
        const urlToEntity = new Map();
        for (const e of entities) {
          if (e.url) {
            // Normalize: remove protocol, trailing slash
            const normalized = e.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
            urlToEntity.set(normalized, { id: e.id, entityType: e.entityType?.slug, title: e.title });
          }
        }

        insights.push({
          category: 'CONTENT',
          type: 'DISCOVERY',
          priority: 'MEDIUM',
          titleKey: 'agent.insights.decliningPages.title',
          descriptionKey: 'agent.insights.decliningPages.description',
          data: {
            ...gscPeriod,
            count: decliningPages.length,
            pages: decliningPages.slice(0, 5).map(p => {
              // Try to match GSC URL to entity
              const normalizedUrl = p.page?.replace(/^https?:\/\//, '').replace(/\/$/, '');
              const entity = urlToEntity.get(normalizedUrl);
              return {
                page: p.page,
                title: entity?.title || null,
                clicks: p.clicks,
                clicksChange: p.clicksChange,
                entityId: entity?.id || null,
                entityType: entity?.entityType || null,
              };
            }),
          },
        });
      }
    }
  } catch (error) {
    console.error('[Agent] GSC analysis failed:', error.message);
  }

  return insights;
}

// ─── GA Data Analysis ───────────────────────────────────────────────

async function analyzeGAData(site, batchId) {
  const insights = [];
  const { googleIntegration } = site;

  if (!googleIntegration?.gaConnected || !googleIntegration?.gaPropertyId) return insights;

  const accessToken = await getValidAccessToken(googleIntegration);
  if (!accessToken) return insights;

  try {
    const gaData = await fetchGAReport(accessToken, googleIntegration.gaPropertyId, 30);
    // fetchGAReport returns { rows, comparison: { visitors, visitorsChange, ... } }
    const report = gaData?.comparison;
    if (!report) return insights;

    const gaPeriod = getComparisonPeriods(30);
    const hasGaComparisonSignal = hasSufficientGaComparisonData(report);

    // Check for significant visitor drops
    // visitorsChange is integer percentage (e.g. -25 means -25%)
    if (hasGaComparisonSignal && report.visitorsChange && report.visitorsChange < TRAFFIC_DROP_THRESHOLD) {
      insights.push({
        category: 'TRAFFIC',
        type: 'ALERT',
        priority: report.visitorsChange < -50 ? 'CRITICAL' : 'HIGH',
        titleKey: 'agent.insights.visitorsDrop.title',
        descriptionKey: 'agent.insights.visitorsDrop.description',
        data: {
          ...gaPeriod,
          visitors: report.visitors,
          change: report.visitorsChange / 100, // normalize to decimal for translation placeholder
          sessions: report.sessions,
          sessionsChange: report.sessionsChange,
        },
      });
    }

    // Positive growth discovery
    if (hasGaComparisonSignal && report.visitorsChange && report.visitorsChange > 20) {
      insights.push({
        category: 'TRAFFIC',
        type: 'DISCOVERY',
        priority: 'LOW',
        titleKey: 'agent.insights.trafficGrowth.title',
        descriptionKey: 'agent.insights.trafficGrowth.description',
        data: {
          ...gaPeriod,
          visitors: report.visitors,
          change: report.visitorsChange / 100, // normalize to decimal for translation placeholder
          pageViews: report.pageViews,
        },
      });
    }
  } catch (error) {
    console.error('[Agent] GA analysis failed:', error.message);
  }

  return insights;
}

// ─── Competitor Analysis ────────────────────────────────────────────

async function analyzeCompetitors(site, batchId) {
  const insights = [];

  const competitors = await prisma.competitor.findMany({
    where: { siteId: site.id, scanStatus: 'COMPLETED' },
    select: {
      id: true, url: true, domain: true, name: true,
      wordCount: true, h1Count: true, h2Count: true, imageCount: true,
      topicsCovered: true, contentGaps: true, lastScannedAt: true,
    },
  });

  if (competitors.length === 0) return insights;

  // Find competitors with content gaps to exploit
  const withGaps = competitors.filter(c => c.contentGaps && Array.isArray(c.contentGaps) && c.contentGaps.length > 0);

  if (withGaps.length > 0) {
    const allGaps = withGaps.flatMap(c =>
      (c.contentGaps || []).map(gap => ({ gap, competitor: c.domain }))
    );

    if (allGaps.length > 0) {
      insights.push({
        category: 'COMPETITORS',
        type: 'SUGGESTION',
        priority: 'MEDIUM',
        titleKey: 'agent.insights.contentGaps.title',
        descriptionKey: 'agent.insights.contentGaps.description',
        data: {
          gapsCount: allGaps.length,
          competitorsAnalyzed: withGaps.length,
          topGaps: allGaps.slice(0, 5),
        },
      });
    }
  }

  // Flag stale competitor scans (older than 30 days)
  const staleScanDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const staleScans = competitors.filter(c => c.lastScannedAt && new Date(c.lastScannedAt) < staleScanDate);

  if (staleScans.length > 0) {
    insights.push({
      category: 'COMPETITORS',
      type: 'SUGGESTION',
      priority: 'LOW',
      titleKey: 'agent.insights.staleCompetitorScans.title',
      descriptionKey: 'agent.insights.staleCompetitorScans.description',
      data: {
        count: staleScans.length,
        competitors: staleScans.slice(0, 5).map(c => ({ domain: c.domain, lastScannedAt: c.lastScannedAt })),
      },
    });
  }

  return insights;
}

// ─── Cannibalization Detection (3-Layer Engine) ─────────────────────

/**
 * Detect keyword cannibalization using the 3-layer engine:
 *   - Layer 1: Proactive (content/database analysis - no GSC needed)
 *   - Layer 2: Reactive (GSC data with relative thresholds)
 *   - Layer 3: Semantic (AI-powered intent detection)
 *
 * Creates ONE insight per cannibalization pair/cluster so each can be
 * individually resolved. The dedup key includes sorted URLs so partial
 * fixes don't accidentally resolve unrelated clusters.
 */
async function analyzeCannibalization(site, batchId) {
  const insights = [];

  try {
    // Run the hybrid cannibalization engine (Track 1 + Track 2 → AI Verification)
    const { issues, stats } = await runCannibalizationEngine(site, getValidAccessToken, {
      runProactive: true,
      runReactive: true,
      runAIVerification: true,
      skipDeduplication: false
    });

    if (issues.length === 0) return insights;

    // Map engine issue type → insight metadata
    const typeConfig = {
      PROACTIVE: {
        category: 'CONTENT',
        titleKey: 'agent.insights.cannibalization.proactive.title',
        descriptionKey: 'agent.insights.cannibalization.proactive.description',
      },
      REACTIVE_GSC: {
        category: 'KEYWORDS',
        titleKey: 'agent.insights.cannibalization.title',
        descriptionKey: 'agent.insights.cannibalization.description',
      },
      // SEMANTIC_AI, AI_VERIFIED, MULTI_TRACK all map to semantic
      SEMANTIC: {
        category: 'CONTENT',
        titleKey: 'agent.insights.cannibalization.semantic.title',
        descriptionKey: 'agent.insights.cannibalization.semantic.description',
      },
    };

    function getTypeGroup(issueType) {
      if (issueType === 'PROACTIVE') return 'PROACTIVE';
      if (issueType === 'REACTIVE_GSC') return 'REACTIVE_GSC';
      return 'SEMANTIC'; // SEMANTIC_AI, AI_VERIFIED, MULTI_TRACK
    }

    // Create one insight per cannibalization issue (pair/cluster)
    for (const issue of issues) {
      const group = getTypeGroup(issue.type);
      const config = typeConfig[group];

      const issueData = {
        urls: issue.urlsInvolved || issue.urls,
        entities: issue.data?.entities || issue.entities,
        confidence: issue.confidenceScore,
        action: issue.recommendedAction,
        reason: issue.reason,
        reasonKey: issue.reasonKey,
        reasonParams: issue.reasonParams,
        // Legacy pair support
        entityA: issue.data?.entities?.[0] || issue.data?.entityA,
        entityB: issue.data?.entities?.[1] || issue.data?.entityB,
        pairs: issue.data?.pairs,
        ...issue.data,
      };

      // Add type-specific fields
      if (group === 'REACTIVE_GSC') {
        issueData.query = issue.data?.query;
      }
      if (group === 'SEMANTIC') {
        issueData.sharedIntent = issue.data?.sharedIntent;
        issueData.semanticSignals = issue.data?.semanticSignals;
        issueData.sources = issue.data?.sources;
        issueData.proactiveScore = issue.data?.proactiveScore;
        issueData.gscScore = issue.data?.gscScore;
      }

      const issueUrls = issue.urlsInvolved || issue.urls || [];

      insights.push({
        category: config.category,
        type: 'ALERT',
        priority: issue.confidenceScore >= 80 ? 'HIGH' : 'MEDIUM',
        titleKey: config.titleKey,
        descriptionKey: config.descriptionKey,
        data: {
          count: issueUrls.length || 2,
          issues: [issueData],
        },
      });
    }

    console.log(`[Agent] Cannibalization engine completed: ${issues.length} issues found (P:${stats.proactiveCount}, R:${stats.reactiveCount}, S:${stats.semanticCount}) in ${stats.totalRuntime}ms`);

  } catch (error) {
    console.error('[Agent] Cannibalization analysis failed:', error.message);
  }

  return insights;
}

// ─── New Keyword Discovery ──────────────────────────────────────────

/**
 * Find GSC queries that drive traffic but aren't tracked as keywords.
 * These are missed opportunities for strategic keyword targeting.
 */
async function analyzeNewKeywordOpportunities(site, batchId) {
  const insights = [];
  const { googleIntegration } = site;

  if (!googleIntegration?.gscConnected || !googleIntegration?.gscSiteUrl) return insights;

  const accessToken = await getValidAccessToken(googleIntegration);
  if (!accessToken) return insights;

  try {
    const [topQueries, trackedKeywords] = await Promise.all([
      fetchGSCTopQueries(accessToken, googleIntegration.gscSiteUrl, 30),
      prisma.keyword.findMany({
        where: { siteId: site.id },
        select: { keyword: true },
      }),
    ]);

    if (!topQueries || topQueries.length === 0) return insights;

    const trackedSet = new Set(trackedKeywords.map(k => k.keyword.toLowerCase().trim()));

    // Find queries performing well in GSC that aren't tracked
    const untrackedQueries = topQueries.filter(q => {
      const normalized = q.query.toLowerCase().trim();
      // Skip brand queries (contain site name or domain)
      const siteName = (site.name || '').toLowerCase();
      const domain = (site.url || '').replace(/^https?:\/\//, '').replace(/\/$/, '').split('.')[0].toLowerCase();
      if (siteName && normalized.includes(siteName)) return false;
      if (domain && normalized.includes(domain)) return false;
      // Must not be tracked already
      return !trackedSet.has(normalized);
    });

    // Only flag if they have decent impressions
    const worthTracking = untrackedQueries.filter(q => q.impressions >= 20 || q.clicks >= 2);

    if (worthTracking.length > 0) {
      insights.push({
        category: 'KEYWORDS',
        type: 'DISCOVERY',
        priority: worthTracking.length >= 5 ? 'HIGH' : 'MEDIUM',
        titleKey: 'agent.insights.newKeywordOpportunities.title',
        descriptionKey: 'agent.insights.newKeywordOpportunities.description',
        data: {
          count: worthTracking.length,
          queries: worthTracking.slice(0, 8).map(q => ({
            query: q.query,
            clicks: q.clicks,
            impressions: q.impressions,
            ctr: q.ctr,
            position: q.position,
          })),
        },
      });
    }
  } catch (error) {
    console.error('[Agent] New keyword opportunity analysis failed:', error.message);
  }

  return insights;
}

// ─── CTR vs Position Analysis ───────────────────────────────────────

/**
 * Identify pages where CTR is significantly below the expected CTR for their position.
 * This usually indicates poor titles or meta descriptions that need improvement.
 */
async function analyzeCtrByPosition(site, batchId) {
  const insights = [];
  const { googleIntegration } = site;

  if (!googleIntegration?.gscConnected || !googleIntegration?.gscSiteUrl) return insights;

  const accessToken = await getValidAccessToken(googleIntegration);
  if (!accessToken) return insights;

  try {
    const topPages = await fetchGSCTopPages(accessToken, googleIntegration.gscSiteUrl, 30);

    if (!topPages || topPages.length === 0) return insights;

    const underperformingPages = [];

    for (const page of topPages) {
      const pos = parseFloat(page.position);
      const ctr = parseFloat(page.ctr);
      if (isNaN(pos) || isNaN(ctr) || page.impressions < 30) continue;

      // Find expected CTR for this position
      const range = EXPECTED_CTR_BY_POSITION.find(r => pos >= r.min && pos <= r.max);
      if (!range) continue;

      // Flag if CTR is less than half the expected CTR
      if (ctr < range.expected * 0.5) {
        underperformingPages.push({
          page: page.page,
          position: page.position,
          actualCtr: page.ctr,
          expectedCtr: range.expected.toString(),
          impressions: page.impressions,
          clicks: page.clicks,
        });
      }
    }

    if (underperformingPages.length > 0) {
      insights.push({
        category: 'CONTENT',
        type: 'SUGGESTION',
        priority: 'HIGH',
        titleKey: 'agent.insights.lowCtrForPosition.title',
        descriptionKey: 'agent.insights.lowCtrForPosition.description',
        data: {
          count: underperformingPages.length,
          pages: underperformingPages.slice(0, 5),
        },
      });
    }
  } catch (error) {
    console.error('[Agent] CTR by position analysis failed:', error.message);
  }

  return insights;
}

// ─── Content Without Organic Traffic ────────────────────────────────

/**
 * Find published content pages that get zero or near-zero organic traffic.
 * Cross-references published entities with GSC top pages data.
 */
async function analyzeContentWithoutTraffic(site, batchId) {
  const insights = [];
  const { googleIntegration } = site;

  if (!googleIntegration?.gscConnected || !googleIntegration?.gscSiteUrl) return insights;

  const accessToken = await getValidAccessToken(googleIntegration);
  if (!accessToken) return insights;

  try {
    // Fetch all GSC pages (use a broader query with higher row limit via query+page pairs)
    const [gscPairs, entities] = await Promise.all([
      fetchGSCQueryPagePairs(accessToken, googleIntegration.gscSiteUrl, 30),
      prisma.siteEntity.findMany({
        where: { siteId: site.id, status: 'PUBLISHED', entityType: { isEnabled: true } },
        select: { id: true, title: true, slug: true, url: true, publishedAt: true },
      }),
    ]);

    if (!entities || entities.length === 0) return insights;

    // Build a set of all pages with any GSC impressions
    const gscPageUrls = new Set();
    for (const row of gscPairs) {
      // Normalize URL for matching
      gscPageUrls.add(row.page.replace(/\/$/, '').toLowerCase());
    }

    // Find entities published over 30 days ago with no organic visibility
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const invisibleContent = entities.filter(e => {
      if (!e.url || !e.publishedAt) return false;
      // Must be published for at least 30 days (give new content time to rank)
      if (new Date(e.publishedAt) > thirtyDaysAgo) return false;
      const normalizedUrl = e.url.replace(/\/$/, '').toLowerCase();
      return !gscPageUrls.has(normalizedUrl);
    });

    if (invisibleContent.length > 0) {
      insights.push({
        category: 'CONTENT',
        type: 'DISCOVERY',
        priority: invisibleContent.length >= 10 ? 'HIGH' : 'MEDIUM',
        titleKey: 'agent.insights.contentWithoutTraffic.title',
        descriptionKey: 'agent.insights.contentWithoutTraffic.description',
        data: {
          count: invisibleContent.length,
          pages: invisibleContent.slice(0, 8).map(e => ({
            title: e.title,
            slug: e.slug,
            url: e.url,
            publishedAt: e.publishedAt,
          })),
        },
      });
    }
  } catch (error) {
    console.error('[Agent] Content without traffic analysis failed:', error.message);
  }

  return insights;
}

// ─── Weekend vs Weekday Traffic Pattern ─────────────────────────────

/**
 * Detect significant differences between weekday and weekend traffic.
 * Helps users understand their audience (B2B tends to be weekday-heavy,
 * B2C often has stronger weekends).
 */
async function analyzeWeekendPattern(site, batchId) {
  const insights = [];
  const { googleIntegration } = site;

  if (!googleIntegration?.gaConnected || !googleIntegration?.gaPropertyId) return insights;

  const accessToken = await getValidAccessToken(googleIntegration);
  if (!accessToken) return insights;

  try {
    const dailyData = await fetchGADailyTraffic(accessToken, googleIntegration.gaPropertyId, 30);
    const rows = dailyData?.rows;
    if (!hasSufficientDailyPatternData(rows)) return insights;

    // Separate weekday vs weekend traffic
    const weekday = [];
    const weekend = [];

    for (const row of rows) {
      // row.date is YYYYMMDD
      const y = parseInt(row.date.slice(0, 4));
      const m = parseInt(row.date.slice(4, 6)) - 1;
      const d = parseInt(row.date.slice(6, 8));
      const dayOfWeek = new Date(y, m, d).getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        weekend.push(row.visitors);
      } else {
        weekday.push(row.visitors);
      }
    }

    if (weekday.length === 0 || weekend.length === 0) return insights;

    const weekdayAvg = weekday.reduce((s, v) => s + v, 0) / weekday.length;
    const weekendAvg = weekend.reduce((s, v) => s + v, 0) / weekend.length;

    if (weekdayAvg === 0 && weekendAvg === 0) return insights;

    const maxAvg = Math.max(weekdayAvg, weekendAvg);
    const minAvg = Math.min(weekdayAvg, weekendAvg);
    const skewRatio = maxAvg > 0 ? (maxAvg - minAvg) / maxAvg : 0;

    if (skewRatio >= WEEKEND_SKEW_THRESHOLD) {
      const dominantPeriod = weekdayAvg > weekendAvg ? 'weekday' : 'weekend';
      insights.push({
        category: 'TRAFFIC',
        type: 'ANALYSIS',
        priority: 'LOW',
        titleKey: 'agent.insights.weekendTrafficPattern.title',
        descriptionKey: 'agent.insights.weekendTrafficPattern.description',
        data: {
          dominantPeriod,
          weekdayAvg: Math.round(weekdayAvg),
          weekendAvg: Math.round(weekendAvg),
          skewPercent: Math.round(skewRatio * 100),
        },
      });
    }
  } catch (error) {
    console.error('[Agent] Weekend pattern analysis failed:', error.message);
  }

  return insights;
}

// ─── Traffic Spike Detection ────────────────────────────────────────

/**
 * Detect unusual daily traffic spikes that stand out from the norm.
 * Could indicate viral content, external mentions, or successful campaigns.
 */
async function analyzeTrafficSpikes(site, batchId) {
  const insights = [];
  const { googleIntegration } = site;

  if (!googleIntegration?.gaConnected || !googleIntegration?.gaPropertyId) return insights;

  const accessToken = await getValidAccessToken(googleIntegration);
  if (!accessToken) return insights;

  try {
    const dailyData = await fetchGADailyTraffic(accessToken, googleIntegration.gaPropertyId, 30);
    const rows = dailyData?.rows;
    if (!hasSufficientDailyPatternData(rows)) return insights;

    const values = rows.map(r => r.visitors);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    if (mean < MIN_PATTERN_AVG_VISITORS) return insights; // still too little traffic for robust spikes

    const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
    const stddev = Math.sqrt(variance);
    const threshold = mean + SPIKE_STDDEV_MULTIPLIER * stddev;

    // Find days that exceed the spike threshold
    const spikeDays = rows
      .filter(r => r.visitors > threshold)
      .map(r => ({
        date: r.date,
        visitors: r.visitors,
        multiplier: Math.round((r.visitors / mean) * 10) / 10,
      }));

    if (spikeDays.length > 0) {
      const topSpikeDays = spikeDays.slice(0, 3);
      const enrichedSpikes = await Promise.all(topSpikeDays.map(async (spike) => {
        try {
          const context = await fetchGASpikeSourceContext(
            accessToken,
            googleIntegration.gaPropertyId,
            spike.date
          );

          const primary = context?.primarySource;
          const topPage = context?.topLandingPages?.[0];

          return {
            date: spike.date,
            visitors: spike.visitors,
            multiplier: spike.multiplier,
            source: primary?.source || null,
            medium: primary?.medium || null,
            sourceSessions: primary?.sessions || null,
            sourceSharePercent: primary?.sharePercent || null,
            sourceLift: primary?.lift || null,
            topLandingPage: topPage?.page || null,
            topLandingPageSessions: topPage?.sessions || null,
          };
        } catch {
          return {
            date: spike.date,
            visitors: spike.visitors,
            multiplier: spike.multiplier,
            source: null,
            medium: null,
            sourceSessions: null,
            sourceSharePercent: null,
            sourceLift: null,
            topLandingPage: null,
            topLandingPageSessions: null,
          };
        }
      }));

      const sourcesFound = enrichedSpikes.filter(s => s.source).length;

      insights.push({
        category: 'TRAFFIC',
        type: 'DISCOVERY',
        priority: 'MEDIUM',
        titleKey: 'agent.insights.trafficSpike.title',
        descriptionKey: 'agent.insights.trafficSpike.description',
        data: {
          count: spikeDays.length,
          avgDaily: Math.round(mean),
          sourcesFound,
          spikes: enrichedSpikes,
        },
      });
    }
  } catch (error) {
    console.error('[Agent] Traffic spike analysis failed:', error.message);
  }

  return insights;
}

// ─── Impression-Click Gap Analysis ──────────────────────────────────

/**
 * Detect when GSC impressions are growing but clicks are not keeping pace.
 * This signals that the site is gaining visibility but titles/descriptions
 * aren't compelling enough to convert impressions into clicks.
 */
async function analyzeImpressionClickGap(site, batchId) {
  const insights = [];
  const { googleIntegration } = site;

  if (!googleIntegration?.gscConnected || !googleIntegration?.gscSiteUrl) return insights;

  const accessToken = await getValidAccessToken(googleIntegration);
  if (!accessToken) return insights;

  try {
    const report = await fetchGSCReport(accessToken, googleIntegration.gscSiteUrl, 30);
    if (!report) return insights;
    if (!hasSufficientGscComparisonData(report)) return insights;

    const gscPeriod = getComparisonPeriods(30, { gscOffset: true });
    const { impressionsChange, clicksChange } = report;
    // Both must be defined integers
    if (impressionsChange == null || clicksChange == null) return insights;

    // Impressions growing significantly, but clicks not keeping up
    if (impressionsChange > 10 && (impressionsChange - clicksChange) >= IMPRESSION_CLICK_GAP_THRESHOLD) {
      insights.push({
        category: 'TRAFFIC',
        type: 'SUGGESTION',
        priority: 'HIGH',
        titleKey: 'agent.insights.impressionClickGap.title',
        descriptionKey: 'agent.insights.impressionClickGap.description',
        data: {
          ...gscPeriod,
          impressions: report.impressions,
          impressionsChange,
          clicks: report.clicks,
          clicksChange,
          gapPercent: impressionsChange - clicksChange,
        },
      });
    }
  } catch (error) {
    console.error('[Agent] Impression-click gap analysis failed:', error.message);
  }

  return insights;
}

// ─── AI Traffic Trend ───────────────────────────────────────────────

/**
 * Track growth or decline of AI-referred traffic (ChatGPT, Perplexity, etc.).
 * AI traffic is an emerging channel and significant changes should be highlighted.
 */
async function analyzeAITrafficTrend(site, batchId) {
  const insights = [];
  const { googleIntegration } = site;

  if (!googleIntegration?.gaConnected || !googleIntegration?.gaPropertyId) return insights;

  const accessToken = await getValidAccessToken(googleIntegration);
  if (!accessToken) return insights;

  try {
    const aiStats = await fetchAITrafficStats(accessToken, googleIntegration.gaPropertyId, 30);
    if (!aiStats) return insights;

    const gaPeriod = getComparisonPeriods(30);
    const { totalAiSessions, aiSessionsChange, aiSharePercent, engines } = aiStats;

    // Need at least some AI traffic to be meaningful
    if (!totalAiSessions || totalAiSessions < MIN_AI_TRAFFIC_SESSIONS) return insights;

    if (aiSessionsChange != null && Math.abs(aiSessionsChange) >= AI_TRAFFIC_GROWTH_THRESHOLD) {
      const isGrowth = aiSessionsChange > 0;
      insights.push({
        category: 'TRAFFIC',
        type: isGrowth ? 'DISCOVERY' : 'ALERT',
        priority: isGrowth ? 'MEDIUM' : 'LOW',
        titleKey: isGrowth
          ? 'agent.insights.aiTrafficGrowth.title'
          : 'agent.insights.aiTrafficDrop.title',
        descriptionKey: isGrowth
          ? 'agent.insights.aiTrafficGrowth.description'
          : 'agent.insights.aiTrafficDrop.description',
        data: {
          ...gaPeriod,
          sessions: totalAiSessions,
          change: aiSessionsChange,
          sharePercent: aiSharePercent,
          topEngines: (engines || []).slice(0, 3).map(e => ({
            name: e.source,
            sessions: e.sessions,
          })),
        },
      });
    }
  } catch (error) {
    console.error('[Agent] AI traffic trend analysis failed:', error.message);
  }

  return insights;
}

// ─── AI Engine Coverage ─────────────────────────────────────────────

// AI-coverage analysis thresholds
const AI_ENGINE_CITED_SHARE = 15;        // engine share (%) to count as "cited by engine"
const AI_ENGINE_GAP_PRIMARY_SESSIONS = 30; // primary engine sessions to consider a page cited
const AI_ENGINE_GAP_SECONDARY_CAP = 2;     // secondary engines must have <= this sessions to flag a gap
const AI_PAGE_AUDIT_MAX_PAGES = 3;         // fetch at most N top AI landing pages per run
const AI_FIRST_PARA_WORD_LIMIT = 60;       // first <p> word count that triggers "not concise"

/**
 * Fetch a page's HTML for AI-answerability audit. Returns null on failure.
 * Kept intentionally lightweight - we only need the HTML head + first paragraph.
 */
async function fetchPageHtmlSafe(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: BOT_FETCH_HEADERS,
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html')) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function detectJsonLdSchema(html) {
  if (!html) return { hasSchema: false, types: [] };
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const types = [];
  let match;
  while ((match = re.exec(html)) !== null) {
    try {
      const raw = match[1].trim();
      const parsed = JSON.parse(raw);
      const nodes = Array.isArray(parsed) ? parsed : parsed['@graph'] || [parsed];
      for (const n of nodes) {
        const t = n && n['@type'];
        if (Array.isArray(t)) types.push(...t);
        else if (t) types.push(t);
      }
    } catch { /* ignore unparseable blocks */ }
  }
  return { hasSchema: types.length > 0, types };
}

function extractFirstParagraphText(html) {
  if (!html) return '';
  // Strip scripts/styles that the <p> regex could otherwise swallow words from
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
  const m = cleaned.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
  if (!m) return '';
  return m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function detectTldrOrFaqBlock(html) {
  if (!html) return false;
  // Headings containing TL;DR, summary, key takeaways, FAQ, quick answer, or Hebrew equivalents
  return /<h[1-6][^>]*>[\s\S]*?(tl;?dr|in short|quick answer|key takeaways?|summary|faq|frequently asked|בקצרה|תשובה מהירה|שאלות ותשובות|נפוצות)/i.test(html);
}

/**
 * Analyze per-engine AI-traffic coverage and page-level AI readiness.
 * Emits up to four insight types:
 *   - aiCitedByEngine     (DISCOVERY, positive) - engine holds ≥ 15% of AI sessions
 *   - aiEngineGap         (SUGGESTION)           - page cited by engine A, invisible to engine B
 *   - aiPageMissingSchema (ACTION, fixable)      - top AI-landing page without JSON-LD
 *   - aiAnswerableButNotConcise (ACTION, fixable)- dense first paragraph, no TL;DR / FAQ
 */
async function analyzeAiEngineCoverage(site, batchId) {
  const insights = [];
  const { googleIntegration } = site;

  if (!googleIntegration?.gaConnected || !googleIntegration?.gaPropertyId) return insights;

  const accessToken = await getValidAccessToken(googleIntegration);
  if (!accessToken) return insights;

  let aiStats;
  try {
    aiStats = await fetchAITrafficStats(accessToken, googleIntegration.gaPropertyId, 30);
  } catch (error) {
    console.error('[Agent] AI engine coverage: fetchAITrafficStats failed:', error.message);
    return insights;
  }
  if (!aiStats) return insights;

  const { totalAiSessions, engines = [], enginePages = {}, topLandingPages = [] } = aiStats;
  if (!totalAiSessions || totalAiSessions < MIN_AI_TRAFFIC_SESSIONS) return insights;

  const gaPeriod = getComparisonPeriods(30);

  // ── 1. aiCitedByEngine (one insight per high-share engine) ──
  for (const engine of engines) {
    if (!engine?.name || engine.name === 'other' || engine.name === 'organic_search') continue;
    if ((engine.share || 0) < AI_ENGINE_CITED_SHARE) continue;
    const topPages = (enginePages[engine.name] || []).slice(0, 3);
    insights.push({
      category: 'TRAFFIC',
      type: 'DISCOVERY',
      priority: 'LOW',
      titleKey: 'agent.insights.aiCitedByEngine.title',
      descriptionKey: 'agent.insights.aiCitedByEngine.description',
      data: {
        ...gaPeriod,
        engine: engine.name,
        sessions: engine.sessions,
        sharePercent: engine.share,
        topPages: topPages.map(p => ({ page: p.page, sessions: p.sessions })),
      },
    });
  }

  // ── 2. aiEngineGap: pages with strong coverage from one engine and none from others ──
  // Build a cross-engine map: { pagePath: { engineName: sessions } }
  const pageByEngine = {};
  for (const [engineName, pages] of Object.entries(enginePages)) {
    if (engineName === 'other' || engineName === 'organic_search') continue;
    for (const p of pages) {
      if (!pageByEngine[p.page]) pageByEngine[p.page] = {};
      pageByEngine[p.page][engineName] = p.sessions;
    }
  }
  const knownEngineNames = engines
    .map(e => e.name)
    .filter(n => n && n !== 'other' && n !== 'organic_search');
  if (knownEngineNames.length >= 2) {
    for (const [pagePath, perEngine] of Object.entries(pageByEngine)) {
      const primary = Object.entries(perEngine).sort((a, b) => b[1] - a[1])[0];
      if (!primary || primary[1] < AI_ENGINE_GAP_PRIMARY_SESSIONS) continue;
      const missingFrom = knownEngineNames.filter(
        e => e !== primary[0] && (perEngine[e] || 0) <= AI_ENGINE_GAP_SECONDARY_CAP,
      );
      if (missingFrom.length === 0) continue;
      insights.push({
        category: 'TRAFFIC',
        type: 'SUGGESTION',
        priority: 'MEDIUM',
        titleKey: 'agent.insights.aiEngineGap.title',
        descriptionKey: 'agent.insights.aiEngineGap.description',
        data: {
          ...gaPeriod,
          page: pagePath,
          primaryEngine: primary[0],
          primarySessions: primary[1],
          missingEngines: missingFrom,
        },
      });
    }
  }

  // ── 3 & 4. Page-level audits (JSON-LD + first-paragraph conciseness) ──
  const siteOrigin = (() => {
    try { return new URL(site.url).origin; } catch { return null; }
  })();

  const auditPages = topLandingPages.slice(0, AI_PAGE_AUDIT_MAX_PAGES);
  for (const page of auditPages) {
    const pagePath = page?.page;
    if (!pagePath || !siteOrigin) continue;
    if (isSystemPageUrl(pagePath)) continue;

    let fullUrl;
    try {
      fullUrl = new URL(pagePath.startsWith('http') ? pagePath : pagePath, siteOrigin).toString();
    } catch { continue; }

    const html = await fetchPageHtmlSafe(fullUrl);
    if (!html) continue;

    // aiPageMissingSchema
    const { hasSchema, types } = detectJsonLdSchema(html);
    if (!hasSchema) {
      insights.push({
        category: 'TECHNICAL',
        type: 'ACTION',
        priority: 'MEDIUM',
        titleKey: 'agent.insights.aiPageMissingSchema.title',
        descriptionKey: 'agent.insights.aiPageMissingSchema.description',
        actionType: 'generate_schema',
        data: {
          page: pagePath,
          url: fullUrl,
          aiSessions: page.sessions,
          existingTypes: types,
        },
        actionPayload: { url: fullUrl },
      });
    }

    // aiAnswerableButNotConcise
    const firstPara = extractFirstParagraphText(html);
    const wordCount = firstPara ? firstPara.split(/\s+/).filter(Boolean).length : 0;
    const hasTldr = detectTldrOrFaqBlock(html);
    if (firstPara && wordCount > AI_FIRST_PARA_WORD_LIMIT && !hasTldr) {
      insights.push({
        category: 'CONTENT',
        type: 'ACTION',
        priority: 'MEDIUM',
        titleKey: 'agent.insights.aiAnswerableButNotConcise.title',
        descriptionKey: 'agent.insights.aiAnswerableButNotConcise.description',
        actionType: 'add_tldr_block',
        data: {
          page: pagePath,
          url: fullUrl,
          aiSessions: page.sessions,
          firstParaWords: wordCount,
        },
        actionPayload: { url: fullUrl },
      });
    }
  }

  return insights;
}

// ─── Traffic Concentration Risk ─────────────────────────────────────

/**
 * Detect when the majority of search clicks come from very few pages.
 * Over-reliance on a small number of pages creates vulnerability - if one page
 * drops in rankings, the site loses a disproportionate share of traffic.
 */
async function analyzeTrafficConcentration(site, batchId) {
  const insights = [];
  const { googleIntegration } = site;

  if (!googleIntegration?.gscConnected || !googleIntegration?.gscSiteUrl) return insights;

  const accessToken = await getValidAccessToken(googleIntegration);
  if (!accessToken) return insights;

  try {
    const topPages = await fetchGSCTopPages(accessToken, googleIntegration.gscSiteUrl, 30);
    if (!topPages || topPages.length < 5) return insights; // too few pages for concentration analysis

    const totalClicks = topPages.reduce((s, p) => s + (p.clicks || 0), 0);
    if (totalClicks < MIN_CONCENTRATION_CLICKS) return insights; // avoid concentration claims on tiny samples

    // Sort by clicks descending
    const sorted = [...topPages].sort((a, b) => (b.clicks || 0) - (a.clicks || 0));

    // Calculate clicks share of top 3 pages
    const top3Clicks = sorted.slice(0, 3).reduce((s, p) => s + (p.clicks || 0), 0);
    const concentrationRatio = top3Clicks / totalClicks;

    if (concentrationRatio >= TRAFFIC_CONCENTRATION_THRESHOLD) {
      insights.push({
        category: 'TRAFFIC',
        type: 'SUGGESTION',
        priority: 'MEDIUM',
        titleKey: 'agent.insights.trafficConcentration.title',
        descriptionKey: 'agent.insights.trafficConcentration.description',
        data: {
          concentrationPercent: Math.round(concentrationRatio * 100),
          totalPages: topPages.length,
          topPages: sorted.slice(0, 3).map(p => ({
            page: p.page,
            clicks: p.clicks,
            sharePercent: Math.round(((p.clicks || 0) / totalClicks) * 100),
          })),
        },
      });
    }
  } catch (error) {
    console.error('[Agent] Traffic concentration analysis failed:', error.message);
  }

  return insights;
}

// ─── SGE / AI-Overview Zero-Click Detection ─────────────────────────

/**
 * Detects "zero-click" traffic theft caused by Google's AI Overviews (SGE).
 *
 * Signal pattern: keyword holds top-5 position with stable/growing impressions,
 * yet CTR crashes ≥ 35% relative - classic sign that an AI Overview is absorbing
 * clicks above the organic results.
 *
 * Optional GA4 cross-reference: if organic sessions to the landing page also
 * dropped > 25%, confidence is boosted to 99%.
 */
async function analyzeSgeTrafficTheft(site, batchId) {
  const insights = [];
  const { googleIntegration } = site;

  if (!googleIntegration?.gscConnected || !googleIntegration?.gscSiteUrl)
    return insights;

  const accessToken = await getValidAccessToken(googleIntegration);
  if (!accessToken) return insights;

  try {
    // Fetch top queries (with comparison data) and query→page mapping in parallel
    const [topQueries, queryPagePairs] = await Promise.all([
      fetchGSCTopQueries(accessToken, googleIntegration.gscSiteUrl, 30),
      fetchGSCQueryPagePairs(accessToken, googleIntegration.gscSiteUrl, 30),
    ]);
    if (!topQueries || topQueries.length === 0) return insights;

    // Build query → page URL lookup from GSC query-page pairs
    // Use the page with the highest impressions for each query
    const queryToPage = new Map();
    for (const pair of (queryPagePairs || [])) {
      const key = pair.query.toLowerCase();
      const existing = queryToPage.get(key);
      if (!existing || pair.impressions > existing.impressions) {
        queryToPage.set(key, pair.page);
      }
    }

    const gscPeriod = getComparisonPeriods(30, { gscOffset: true });

    // ── Phase 1: Filter candidates using GSC data only ──
    const candidates = [];

    for (const q of topQueries) {
      const position = parseFloat(q.position);
      const ctr = parseFloat(q.ctr);
      const ctrChange = q.ctrChange;                  // integer % (e.g. -40 = −40%)
      const impressionsChange = q.impressionsChange;   // integer % (e.g. 5 = +5%)
      const posChange = Math.abs(q.positionChange || 0);

      if (isNaN(position) || isNaN(ctr)) continue;

      // ── Filter 1: Must rank in top 5 ──
      if (position > SGE_MAX_POSITION) continue;

      // ── Filter 2: Position must be stable (variance ≤ 1.5) ──
      if (posChange > SGE_MAX_POSITION_VARIANCE) continue;

      // ── Filter 3: Sufficient & stable impressions ──
      if (q.impressions < SGE_MIN_IMPRESSIONS) continue;
      if (impressionsChange < SGE_MAX_IMPRESSIONS_DROP) continue;

      // ── Filter 4: CTR crashed ≥ 35% relatively ──
      if (ctrChange > -SGE_MIN_CTR_DROP_PERCENT) continue;

      const pageUrl = queryToPage.get(q.query.toLowerCase()) || null;
      candidates.push({ ...q, impressionsChange, pageUrl });
    }

    if (candidates.length === 0) return insights;

    // ── Phase 2: Page-level GA4 cross-reference ──
    // Fetch session drops per unique landing page (not site-level)
    const gaEnabled = googleIntegration?.gaConnected && googleIntegration?.gaPropertyId;
    const pageSessionDrops = new Map(); // pageUrl → sessionsChange (integer %)

    if (gaEnabled) {
      const uniquePages = [...new Set(candidates.map(c => c.pageUrl).filter(Boolean))];
      const gaPropertyId = googleIntegration.gaPropertyId.replace('properties/', '');

      await Promise.all(uniquePages.map(async (pageUrl) => {
        try {
          const pagePath = new URL(pageUrl).pathname;
          const sessionsChange = await fetchGAPageSessionsDrop(
            accessToken, gaPropertyId, pagePath, 30
          );
          if (sessionsChange !== null) {
            pageSessionDrops.set(pageUrl, sessionsChange);
          }
        } catch {
          // GA4 page lookup failed for this page - proceed without it
        }
      }));
    }

    // ── Phase 3: Build final stolen queries with per-page confidence ──
    const stolenQueries = [];

    for (const c of candidates) {
      const pageSessionsChange = c.pageUrl ? (pageSessionDrops.get(c.pageUrl) ?? null) : null;
      const ga4Confirmed = pageSessionsChange !== null && pageSessionsChange <= SGE_GA_SESSIONS_DROP_THRESHOLD;
      const confidence = ga4Confirmed ? SGE_BOOSTED_CONFIDENCE : SGE_BASE_CONFIDENCE;

      stolenQueries.push({
        query: c.query,
        position: c.position,
        impressions: c.impressions,
        impressionsChange: c.impressionsChange,
        clicks: c.clicks,
        ctr: c.ctr,
        ctrChange: c.ctrChange,
        positionChange: c.positionChange,
        pageUrl: c.pageUrl,
        pageSessionsChange,
        confidence,
        ga4Confirmed,
      });
    }

    // Sort by CTR drop severity (most severe first)
    stolenQueries.sort((a, b) => a.ctrChange - b.ctrChange);

    const hasGa4Boost = stolenQueries.some(q => q.ga4Confirmed);

    insights.push({
      category: 'TRAFFIC',
      type: 'ALERT',
      priority: 'HIGH',
      titleKey: 'agent.insights.sgeTrafficTheft.title',
      descriptionKey: 'agent.insights.sgeTrafficTheft.description',
      data: {
        ...gscPeriod,
        count: stolenQueries.length,
        totalClicksLost: stolenQueries.reduce((sum, q) => {
          const currentCtr = parseFloat(q.ctr) / 100;
          const ctrDropFactor = Math.abs(q.ctrChange) / 100;
          const previousCtr = currentCtr / (1 - ctrDropFactor);
          return sum + Math.round(q.impressions * (previousCtr - currentCtr));
        }, 0),
        ga4Available: gaEnabled && pageSessionDrops.size > 0,
        ga4Confirmed: hasGa4Boost,
        maxConfidence: hasGa4Boost ? SGE_BOOSTED_CONFIDENCE : SGE_BASE_CONFIDENCE,
        queries: stolenQueries.slice(0, 10),
        advice: 'Inject personal experience, proprietary data, or strong opinions into these pages to combat AI-generated answers.',
      },
    });
  } catch (error) {
    console.error('[Agent] SGE traffic theft analysis failed:', error.message);
  }

  return insights;
}

/**
 * Fetch GA4 sessions for a specific landing page, comparing current vs previous period.
 * Returns the % change in sessions (integer), or null if unavailable.
 */
async function fetchGAPageSessionsDrop(accessToken, gaPropertyId, pagePath, days = 30) {
  const fmt = (d) => d.toISOString().split('T')[0];
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const diffMs = endDate.getTime() - startDate.getTime();
  const prevEndDate = new Date(startDate);
  prevEndDate.setDate(prevEndDate.getDate() - 1);
  const prevStartDate = new Date(prevEndDate.getTime() - diffMs);

  const body = {
    dateRanges: [
      { startDate: fmt(startDate), endDate: fmt(endDate) },
      { startDate: fmt(prevStartDate), endDate: fmt(prevEndDate) },
    ],
    metrics: [{ name: 'sessions' }],
    dimensionFilter: {
      filter: {
        fieldName: 'landingPagePlusQueryString',
        stringFilter: {
          matchType: 'BEGINS_WITH',
          value: pagePath,
          caseSensitive: false,
        },
      },
    },
  };

  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${gaPropertyId}:runReport`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) return null;

  const data = await res.json();
  const rows = data.rows || [];
  const current = Number(rows[0]?.metricValues?.[0]?.value || 0);
  const previous = Number(rows[1]?.metricValues?.[0]?.value || 0);

  if (!previous) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

// ─── Helpers ────────────────────────────────────────────────────────

function normalizeQuery(query) {
  if (!query) return '';
  return query.toLowerCase().replace(/\s+/g, ' ').trim();
}

function hasSufficientDailyPatternData(rows) {
  if (!rows || rows.length < MIN_PATTERN_DAYS) return false;

  const activeDays = rows.filter((r) => Number(r.visitors || 0) >= 3).length;
  if (activeDays < MIN_PATTERN_ACTIVE_DAYS) return false;

  const totalVisitors = rows.reduce((sum, r) => sum + Number(r.visitors || 0), 0);
  if (totalVisitors < MIN_PATTERN_TOTAL_VISITORS) return false;

  const avgVisitors = totalVisitors / rows.length;
  if (avgVisitors < MIN_PATTERN_AVG_VISITORS) return false;

  return true;
}

function hasSufficientGaComparisonData(report) {
  if (!report) return false;

  const visitors = Number(report.visitors || 0);
  const sessions = Number(report.sessions || 0);
  return visitors >= MIN_GA_COMPARE_VISITORS && sessions >= MIN_GA_COMPARE_VISITORS;
}

function hasSufficientGscComparisonData(report) {
  if (!report) return false;

  const impressions = Number(report.impressions || 0);
  const clicks = Number(report.clicks || 0);
  return impressions >= MIN_GSC_COMPARE_IMPRESSIONS && clicks >= MIN_GSC_COMPARE_CLICKS;
}

function normalizePageUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    const path = (u.pathname || '/').replace(/\/$/, '') || '/';
    return `${host}${path}`.toLowerCase();
  } catch {
    return String(url).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
  }
}

function isSystemPageUrl(url) {
  if (!url) return true;
  const normalized = normalizePageUrl(url);
  return /(\/wp-admin|\/wp-login|\/login|\/signin|\/sign-in|\/signup|\/sign-up|\/register|\/cart|\/checkout|\/account|\/privacy|\/terms|\/tag\/|\/author\/|\/feed|\/search)/i.test(normalized);
}

function getBrandTokens(site) {
  const tokens = new Set();
  const siteName = (site?.name || '').toLowerCase().trim();
  const domain = (site?.url || '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
  const domainRoot = domain.split('.')[0];

  if (siteName) {
    siteName.split(/\s+/).filter(Boolean).forEach((t) => tokens.add(t));
  }
  if (domainRoot) tokens.add(domainRoot);

  return tokens;
}

function isLikelyNavigationalQuery(query, brandTokens) {
  if (!query) return true;
  const tokens = query.split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) return true;
  if (tokens.some((t) => brandTokens.has(t))) return true;
  return /(login|sign in|contact|about|homepage|home page)/i.test(query);
}

function isLikelyHierarchyPair(urlA, urlB) {
  const pathFromUrl = (url) => {
    try {
      return new URL(url).pathname.replace(/\/$/, '').split('/').filter(Boolean);
    } catch {
      return String(url).replace(/^https?:\/\//, '').replace(/^www\./, '').split('/').slice(1).filter(Boolean);
    }
  };

  const a = pathFromUrl(urlA);
  const b = pathFromUrl(urlB);
  if (a.length < 2 || b.length < 2) return false;

  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  const isPrefix = shorter.every((segment, i) => segment === longer[i]);
  return isPrefix;
}

/**
 * Expire old insights that have passed their expiresAt date.
 */
export async function expireStaleInsights() {
  const result = await prisma.agentInsight.updateMany({
    where: {
      status: 'PENDING',
      expiresAt: { lt: new Date() },
    },
    data: { status: 'EXPIRED' },
  });

  return result.count;
}

/**
 * Get the last run date for a site.
 */
export async function getLastRunDate(siteId) {
  const lastRun = await prisma.agentRun.findFirst({
    where: { siteId, status: 'COMPLETED' },
    orderBy: { startedAt: 'desc' },
    select: { startedAt: true },
  });

  return lastRun?.startedAt || null;
}

// ─── GSC Sitemap Submission Check ───────────────────────────────────

/**
 * Check if the site's sitemaps are submitted to Google Search Console.
 * If GSC is connected and has data (meaning the site is working), but no
 * sitemaps are submitted, flag this as a TECHNICAL issue with a quick-fix action.
 */
const H1_FETCH_TIMEOUT_MS = 10000;
const H1_FETCH_MAX_BYTES = 1_500_000;

async function countH1InRenderedHtml(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), H1_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: BOT_FETCH_HEADERS,
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!res.ok) return null;

    const reader = res.body?.getReader();
    if (!reader) {
      const html = await res.text();
      return matchH1Count(html);
    }

    const decoder = new TextDecoder('utf-8', { fatal: false });
    let html = '';
    let received = 0;
    while (received < H1_FETCH_MAX_BYTES) {
      const { value, done } = await reader.read();
      if (done) break;
      received += value.byteLength;
      html += decoder.decode(value, { stream: true });
    }
    try { reader.cancel(); } catch { /* noop */ }
    return matchH1Count(html);
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function matchH1Count(html) {
  if (!html) return 0;
  // Strip <script>/<style> blocks so we don't count H1s in inlined source/JSON.
  const cleaned = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  const matches = cleaned.match(/<h1[\s>]/gi) || [];
  return matches.length;
}

async function runWithConcurrency(items, concurrency, worker) {
  const queue = items.slice();
  const runners = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      try { await worker(item); } catch { /* swallow per-item failures */ }
    }
  });
  await Promise.all(runners);
}

async function analyzeH1Tags(site, batchId) {
  const insights = [];

  const entities = await prisma.siteEntity.findMany({
    where: { siteId: site.id, status: 'PUBLISHED', entityType: { isEnabled: true } },
    select: {
      id: true, title: true, slug: true, url: true,
      externalId: true,
      entityType: { select: { slug: true } },
    },
  });

  if (entities.length === 0) return insights;

  const missingH1 = [];
  const multipleH1 = [];

  // Check rendered HTML, not post_content — the H1 is usually output by the theme template (the_title()), not stored in the editor's content.
  await runWithConcurrency(entities, 5, async (entity) => {
    if (!entity.url) return;

    const h1Count = await countH1InRenderedHtml(entity.url);
    if (h1Count === null) return;

    const row = {
      id: entity.id,
      title: entity.title,
      slug: entity.slug,
      url: entity.url,
      externalId: entity.externalId,
      type: entity.entityType?.slug,
      h1Count,
    };

    if (h1Count === 0) missingH1.push(row);
    else if (h1Count > 1) multipleH1.push(row);
  });

  if (missingH1.length > 0) {
    insights.push({
      category: 'CONTENT',
      type: 'ACTION',
      priority: missingH1.length > 5 ? 'HIGH' : 'MEDIUM',
      titleKey: 'agent.insights.missingH1Tag.title',
      descriptionKey: 'agent.insights.missingH1Tag.description',
      data: {
        count: missingH1.length,
        pages: missingH1.map(e => ({
          id: e.id,
          title: e.title,
          slug: e.slug,
          url: e.url,
          externalId: e.externalId,
          type: e.type,
          h1Count: e.h1Count,
        })),
      },
    });
  }

  if (multipleH1.length > 0) {
    insights.push({
      category: 'CONTENT',
      type: 'ACTION',
      priority: multipleH1.length > 5 ? 'HIGH' : 'MEDIUM',
      titleKey: 'agent.insights.multipleH1Tags.title',
      descriptionKey: 'agent.insights.multipleH1Tags.description',
      data: {
        count: multipleH1.length,
        pages: multipleH1.map(e => ({
          id: e.id,
          title: e.title,
          slug: e.slug,
          url: e.url,
          externalId: e.externalId,
          type: e.type,
          h1Count: e.h1Count,
        })),
      },
    });
  }

  return insights;
}

// Detect orphaned WordPress auto-numbered slugs (`-2`/`-3`/…). When the clean-slug sibling no longer exists, the suffix is leftover cruft from a prior duplicate; cannibalization owns the case where the sibling still exists, so we skip those here.
async function analyzeNumericSlugSuffix(site, batchId) {
  const insights = [];

  const entities = await prisma.siteEntity.findMany({
    where: { siteId: site.id, status: 'PUBLISHED', entityType: { isEnabled: true } },
    select: {
      id: true, title: true, slug: true, url: true, externalId: true,
      entityTypeId: true,
      entityType: { select: { slug: true } },
    },
  });

  if (entities.length === 0) return insights;

  const candidates = entities
    .map(e => {
      const m = e.slug?.match(/^(.+?)-(\d+)$/);
      if (!m || parseInt(m[2], 10) < 2) return null;
      return { entity: e, baseSlug: m[1], suffix: m[2] };
    })
    .filter(Boolean);

  if (candidates.length === 0) return insights;

  const baseLookup = await prisma.siteEntity.findMany({
    where: {
      siteId: site.id,
      status: 'PUBLISHED',
      OR: candidates.map(c => ({ entityTypeId: c.entity.entityTypeId, slug: c.baseSlug })),
    },
    select: { slug: true, entityTypeId: true },
  });
  const baseExists = new Set(baseLookup.map(b => `${b.entityTypeId}|${b.slug}`));

  const candidateUrls = candidates.map(c => c.entity.url).filter(Boolean);
  const existingRedirects = candidateUrls.length > 0
    ? await prisma.redirection.findMany({
        where: {
          siteId: site.id,
          OR: [
            { sourceUrl: { in: candidateUrls } },
            { targetUrl: { in: candidateUrls } },
          ],
        },
        select: { sourceUrl: true, targetUrl: true, isActive: true },
      })
    : [];

  const orphans = [];
  for (const c of candidates) {
    if (baseExists.has(`${c.entity.entityTypeId}|${c.baseSlug}`)) continue;
    if (!c.entity.url) continue;

    let cleanUrl;
    try {
      const u = new URL(c.entity.url);
      const trailing = u.pathname.endsWith('/') ? '/' : '';
      const segs = u.pathname.replace(/\/$/, '').split('/');
      segs[segs.length - 1] = c.baseSlug;
      u.pathname = segs.join('/') + trailing;
      cleanUrl = u.toString();
    } catch {
      continue;
    }

    // Skip when the clean URL already redirects elsewhere — renaming would conflict with the existing 301.
    const conflict = existingRedirects.find(r =>
      r.isActive && r.sourceUrl === cleanUrl && r.targetUrl !== c.entity.url
    );
    if (conflict) continue;

    const alreadyRedirected = existingRedirects.some(r =>
      r.isActive && r.sourceUrl === cleanUrl && r.targetUrl === c.entity.url
    );

    orphans.push({
      id: c.entity.id,
      title: c.entity.title,
      slug: c.entity.slug,
      url: c.entity.url,
      externalId: c.entity.externalId,
      type: c.entity.entityType?.slug,
      suggestedSlug: c.baseSlug,
      suggestedUrl: cleanUrl,
      alreadyRedirected,
    });
  }

  if (orphans.length === 0) return insights;

  insights.push({
    category: 'TECHNICAL',
    type: 'ACTION',
    priority: orphans.length > 5 ? 'HIGH' : 'MEDIUM',
    titleKey: 'agent.insights.numericSlugSuffix.title',
    descriptionKey: 'agent.insights.numericSlugSuffix.description',
    data: {
      count: orphans.length,
      pages: orphans,
    },
    actionPayload: {
      entityIds: orphans.map(o => o.id),
      slugMap: Object.fromEntries(orphans.map(o => [o.id, o.suggestedSlug])),
    },
  });

  return insights;
}

async function analyzeGscSitemapSubmission(site, batchId) {
  const insights = [];
  const { googleIntegration } = site;

  // Only check if GSC is connected and the site URL is known
  if (!googleIntegration?.gscConnected || !googleIntegration?.gscSiteUrl) return insights;

  const accessToken = await getValidAccessToken(googleIntegration);
  if (!accessToken) return insights;

  try {
    const submittedSitemaps = await listGSCSitemaps(accessToken, googleIntegration.gscSiteUrl);

    // If sitemaps are already submitted, no issue
    if (submittedSitemaps.length > 0) {
      console.log(`[Agent] GSC has ${submittedSitemaps.length} sitemaps for ${site.url} - no action needed`);
      return insights;
    }

    // GSC connected but zero sitemaps submitted - flag as issue
    console.log(`[Agent] No GSC sitemaps found for ${site.url} - creating insight`);

    insights.push({
      category: 'TECHNICAL',
      type: 'ACTION',
      priority: 'HIGH',
      titleKey: 'agent.insights.sitemapsNotSubmitted.title',
      descriptionKey: 'agent.insights.sitemapsNotSubmitted.description',
      actionType: 'submit_sitemaps_to_gsc',
      data: {
        gscSiteUrl: googleIntegration.gscSiteUrl,
        siteUrl: site.url,
        isWordPress: !!(site.siteKey && site.connectionStatus === 'CONNECTED'),
      },
    });
  } catch (error) {
    console.error('[Agent] GSC sitemap submission check failed:', error.message);
  }

  return insights;
}
