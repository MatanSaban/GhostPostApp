/**
 * AI Agent Analysis Engine
 * 
 * Analyzes site data (GSC, GA, entities, keywords, competitors) and generates
 * AgentInsight records with actionable suggestions, discoveries, and alerts.
 */

import prisma from '@/lib/prisma';
import { z } from 'zod';
import { generateStructuredResponse } from '@/lib/ai/gemini.js';
import { performEntitySync, acquireSyncLock, releaseSyncLock } from '@/lib/entity-sync';
import { notifyAccountMembers } from '@/lib/notifications';
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
} from '@/lib/google-integration';
import { runCannibalizationEngine } from '@/lib/cannibalization-engine';

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

/**
 * Build a deduplication key for an insight.
 * Per-item insights (e.g. keywordStrikeZone) include a distinguishing data field.
 * Aggregate insights (e.g. staleContent) use just the titleKey.
 */
function buildDedupKey(titleKey, data) {
  const d = data || {};
  // Per-keyword insights: include the keyword
  if (titleKey.includes('keywordStrikeZone')) return `${titleKey}:${d.keyword || ''}`;
  // Per-page insights don't repeat per-page - they aggregate, so titleKey alone is fine
  return titleKey;
}

/**
 * Run a full analysis for a single site.
 * Creates an AgentRun record (unless existingRunId provided) and generates AgentInsight records.
 * 
 * @param {string} siteId 
 * @param {string} accountId 
 * @param {string} source - "cron" | "manual"
 * @param {string} [existingRunId] - If provided, reuse this run record instead of creating a new one
 * @returns {{ runId: string, insightsCount: number, resolvedCount: number }}
 */
export async function runSiteAnalysis(siteId, accountId, source = 'cron', existingRunId = null) {
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
      modules.content ? analyzeContent(site, batchId) : Promise.resolve([]),
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
      modules.traffic ? analyzeTrafficConcentration(site, batchId) : Promise.resolve([]),
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
        existingKeys.add(key);
        // Update data on EXECUTED/APPROVED/FAILED insights so stale page lists are refreshed
        if (e.status !== 'PENDING') {
          const fresh = currentInsightByKey.get(key);
          if (fresh) {
            insightsToUpdate.push({ id: e.id, data: fresh.data, actionPayload: fresh.actionPayload });
          }
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
      await prisma.agentInsight.update({
        where: { id: upd.id },
        data: { data: upd.data, actionPayload: upd.actionPayload },
      });
    }

    // Create only genuinely new insights (not already tracked)
    const newInsights = insights.filter(i => !existingKeys.has(buildDedupKey(i.titleKey, i.data)));

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
      skippedDuplicates: insights.length - newInsights.length,
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

    return { runId: run.id, insightsCount: 0, error: error.message };
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

async function analyzeContent(site, batchId) {
  const insights = [];

  // Get published entities
  const rawEntities = await prisma.siteEntity.findMany({
    where: { siteId: site.id, status: 'PUBLISHED' },
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
          .map(e => ({ title: e.title, slug: e.slug, updatedAt: e.updatedAt })),
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
    const scored = await assessSeoRelevance(missingSeo.slice(0, 15), site);
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
async function assessSeoRelevance(pages, site) {
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
        // Fetch entities to match URLs for edit links and titles
        const entities = await prisma.siteEntity.findMany({
          where: { siteId: site.id, status: 'PUBLISHED' },
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

    // Group issues by type for display
    // New engine outputs AI_VERIFIED for all verified issues
    // Legacy types: PROACTIVE, REACTIVE_GSC, SEMANTIC_AI
    const proactiveIssues = issues.filter(i => i.type === 'PROACTIVE');
    const reactiveIssues = issues.filter(i => i.type === 'REACTIVE_GSC');
    const semanticIssues = issues.filter(i => 
      i.type === 'SEMANTIC_AI' || 
      i.type === 'AI_VERIFIED' || 
      i.type === 'MULTI_TRACK'
    );

    // Create insight for proactive issues (content-based, no GSC data needed)
    if (proactiveIssues.length > 0) {
      insights.push({
        category: 'CONTENT',
        type: 'ALERT',
        priority: proactiveIssues.some(i => i.confidenceScore >= 80) ? 'HIGH' : 'MEDIUM',
        titleKey: 'agent.insights.cannibalization.proactive.title',
        descriptionKey: 'agent.insights.cannibalization.proactive.description',
        data: {
          count: proactiveIssues.length,
          issues: proactiveIssues.slice(0, 5).map(issue => ({
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
            ...issue.data
          })),
        },
      });
    }

    // Create insight for reactive GSC issues
    if (reactiveIssues.length > 0) {
      insights.push({
        category: 'KEYWORDS',
        type: 'ALERT',
        priority: reactiveIssues.length >= 3 || reactiveIssues.some(i => i.confidenceScore >= 80) ? 'HIGH' : 'MEDIUM',
        titleKey: 'agent.insights.cannibalization.title',
        descriptionKey: 'agent.insights.cannibalization.description',
        data: {
          count: reactiveIssues.length,
          issues: reactiveIssues.slice(0, 5).map(issue => ({
            urls: issue.urlsInvolved || issue.urls,
            entities: issue.data?.entities || issue.entities,
            confidence: issue.confidenceScore,
            action: issue.recommendedAction,
            reason: issue.reason,
            reasonKey: issue.reasonKey,
            reasonParams: issue.reasonParams,
            query: issue.data?.query,
            // Legacy pair support
            entityA: issue.data?.entities?.[0] || issue.data?.entityA,
            entityB: issue.data?.entities?.[1] || issue.data?.entityB,
            pairs: issue.data?.pairs,
            ...issue.data
          })),
        },
      });
    }

    // Create insight for semantic AI issues
    if (semanticIssues.length > 0) {
      insights.push({
        category: 'CONTENT',
        type: 'ALERT',
        priority: semanticIssues.some(i => i.confidenceScore >= 80) ? 'HIGH' : 'MEDIUM',
        titleKey: 'agent.insights.cannibalization.semantic.title',
        descriptionKey: 'agent.insights.cannibalization.semantic.description',
        data: {
          count: semanticIssues.length,
          issues: semanticIssues.slice(0, 5).map(issue => ({
            urls: issue.urlsInvolved || issue.urls,
            entities: issue.data?.entities || issue.entities,
            confidence: issue.confidenceScore,
            action: issue.recommendedAction,
            reason: issue.reason,
            reasonKey: issue.reasonKey,
            reasonParams: issue.reasonParams,
            sharedIntent: issue.data?.sharedIntent,
            // Legacy pair support (if only 2 URLs)
            entityA: issue.data?.entities?.[0] || issue.data?.entityA,
            entityB: issue.data?.entities?.[1] || issue.data?.entityB,
            semanticSignals: issue.data?.semanticSignals,
            sources: issue.data?.sources,
            pairs: issue.data?.pairs,
            proactiveScore: issue.data?.proactiveScore,
            gscScore: issue.data?.gscScore
          })),
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
        where: { siteId: site.id, status: 'PUBLISHED' },
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

// ─── Traffic Concentration Risk ─────────────────────────────────────

/**
 * Detect when the majority of search clicks come from very few pages.
 * Over-reliance on a small number of pages creates vulnerability — if one page
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
