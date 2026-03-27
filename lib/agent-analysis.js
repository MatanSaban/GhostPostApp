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
} from '@/lib/google-integration';

// ─── Constants ───────────────────────────────────────────────────────

const INSIGHT_EXPIRY_DAYS = 30;
const LOW_CTR_THRESHOLD = 2;       // 2% (GSC returns ctr as string percentage like "1.5")
const HIGH_IMPRESSION_THRESHOLD = 100;  // Lowered from 500 to catch more opportunities
const POSITION_STRIKE_ZONE = { min: 4, max: 20 }; // positions where a push could reach top 3
const TRAFFIC_DROP_THRESHOLD = -10; // -10% (lowered from -20 to catch smaller drops early)
const STALE_CONTENT_DAYS = 120;     // 4 months (lowered from 6 to be more proactive)

// Expected CTR by position range - if actual CTR is less than half expected, flag it
const EXPECTED_CTR_BY_POSITION = [
  { min: 1, max: 1, expected: 28 },
  { min: 2, max: 2, expected: 15 },
  { min: 3, max: 3, expected: 10 },
  { min: 4, max: 5, expected: 6 },
  { min: 6, max: 10, expected: 2.5 },
];

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

      // Check if notifications are enabled for this site
      const notifyEnabled = site.toolSettings?.agentConfig?.notifyInsights !== false;
      if (notifyEnabled) {
        const hasAlerts = newInsights.some(i => i.type === 'ALERT');
        await notifyAccountMembers(accountId, {
          type: hasAlerts ? 'agent_alert' : 'agent_insights',
          title: 'notifications.agentInsights.title',
          message: 'notifications.agentInsights.message',
          link: '/dashboard/agent',
          data: { siteId, count: newInsights.length, hasAlerts },
        });
      }
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

    // Check for significant traffic drops
    // fetchGSCReport returns clicksChange as integer percentage (e.g. -25 means -25%)
    if (report?.clicksChange && report.clicksChange < TRAFFIC_DROP_THRESHOLD) {
      insights.push({
        category: 'TRAFFIC',
        type: 'ALERT',
        priority: report.clicksChange < -50 ? 'CRITICAL' : 'HIGH',
        titleKey: 'agent.insights.trafficDrop.title',
        descriptionKey: 'agent.insights.trafficDrop.description',
        data: {
          clicks: report.clicks,
          change: report.clicksChange / 100, // normalize to decimal for translation placeholder
          impressions: report.impressions,
          impressionsChange: report.impressionsChange,
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
        insights.push({
          category: 'CONTENT',
          type: 'DISCOVERY',
          priority: 'MEDIUM',
          titleKey: 'agent.insights.decliningPages.title',
          descriptionKey: 'agent.insights.decliningPages.description',
          data: {
            count: decliningPages.length,
            pages: decliningPages.slice(0, 5).map(p => ({
              page: p.page,
              clicks: p.clicks,
              clicksChange: p.clicksChange,
            })),
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

    // Check for significant visitor drops
    // visitorsChange is integer percentage (e.g. -25 means -25%)
    if (report.visitorsChange && report.visitorsChange < TRAFFIC_DROP_THRESHOLD) {
      insights.push({
        category: 'TRAFFIC',
        type: 'ALERT',
        priority: report.visitorsChange < -50 ? 'CRITICAL' : 'HIGH',
        titleKey: 'agent.insights.visitorsDrop.title',
        descriptionKey: 'agent.insights.visitorsDrop.description',
        data: {
          visitors: report.visitors,
          change: report.visitorsChange / 100, // normalize to decimal for translation placeholder
          sessions: report.sessions,
          sessionsChange: report.sessionsChange,
        },
      });
    }

    // Positive growth discovery
    if (report.visitorsChange && report.visitorsChange > 20) {
      insights.push({
        category: 'TRAFFIC',
        type: 'DISCOVERY',
        priority: 'LOW',
        titleKey: 'agent.insights.trafficGrowth.title',
        descriptionKey: 'agent.insights.trafficGrowth.description',
        data: {
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

// ─── Cannibalization Detection ──────────────────────────────────────

/**
 * Detect keyword cannibalization - multiple pages ranking for the same query.
 * This dilutes ranking power and confuses search engines.
 */
async function analyzeCannibalization(site, batchId) {
  const insights = [];
  const { googleIntegration } = site;

  if (!googleIntegration?.gscConnected || !googleIntegration?.gscSiteUrl) return insights;

  const accessToken = await getValidAccessToken(googleIntegration);
  if (!accessToken) return insights;

  try {
    const pairs = await fetchGSCQueryPagePairs(accessToken, googleIntegration.gscSiteUrl, 30);

    if (!pairs || pairs.length === 0) return insights;

    // Group by query to find queries appearing on multiple pages
    const queryPages = new Map();
    for (const row of pairs) {
      if (!queryPages.has(row.query)) queryPages.set(row.query, []);
      queryPages.get(row.query).push(row);
    }

    // Find queries ranking with 2+ pages, both with meaningful impressions
    const cannibalized = [];
    for (const [query, pages] of queryPages) {
      if (pages.length < 2) continue;
      // Both pages need at least some impressions to be a real cannibalization issue
      const meaningful = pages.filter(p => p.impressions >= 5);
      if (meaningful.length >= 2) {
        cannibalized.push({
          query,
          pages: meaningful
            .sort((a, b) => parseFloat(a.position) - parseFloat(b.position))
            .map(p => ({ page: p.page, position: p.position, clicks: p.clicks, impressions: p.impressions })),
        });
      }
    }

    if (cannibalized.length > 0) {
      // Sort by total impressions (biggest impact first)
      cannibalized.sort((a, b) => {
        const aImp = a.pages.reduce((s, p) => s + p.impressions, 0);
        const bImp = b.pages.reduce((s, p) => s + p.impressions, 0);
        return bImp - aImp;
      });

      insights.push({
        category: 'KEYWORDS',
        type: 'ALERT',
        priority: cannibalized.length >= 5 ? 'HIGH' : 'MEDIUM',
        titleKey: 'agent.insights.cannibalization.title',
        descriptionKey: 'agent.insights.cannibalization.description',
        data: {
          count: cannibalized.length,
          queries: cannibalized.slice(0, 5).map(c => ({
            query: c.query,
            pageCount: c.pages.length,
            pages: c.pages.slice(0, 3),
          })),
        },
      });
    }
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

// ─── Helpers ────────────────────────────────────────────────────────

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
