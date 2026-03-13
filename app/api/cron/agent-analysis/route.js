import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { runSiteAnalysis, expireStaleInsights, getLastRunDate } from '@/lib/agent-analysis';

// ─── Security ────────────────────────────────────────────────────────
function verifyAuth(request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // dev mode
  return authHeader === `Bearer ${cronSecret}`;
}

// Plan slug → minimum interval in hours between runs
const PLAN_FREQUENCY = {
  basic: 7 * 24,        // weekly
  professional: 24,     // daily
  business: 24,         // daily
  enterprise: 24,       // daily
};
const DEFAULT_FREQUENCY_HOURS = 7 * 24; // weekly fallback

/**
 * GET /api/cron/agent-analysis
 * 
 * Cron job that runs the AI Agent analysis for all eligible sites.
 * Respects plan-based frequency: weekly for basic, daily for pro+.
 */
export async function GET(request) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[CronAgent] Starting agent analysis cron...');

  try {
    // First, expire old insights
    const expiredCount = await expireStaleInsights();
    if (expiredCount > 0) {
      console.log(`[CronAgent] Expired ${expiredCount} stale insights`);
    }

    // Find all active sites with their account subscription/plan
    const sites = await prisma.site.findMany({
      where: { isActive: true },
      select: {
        id: true,
        accountId: true,
        name: true,
        toolSettings: true,
        account: {
          select: {
            subscription: {
              select: {
                status: true,
                plan: { select: { slug: true } },
              },
            },
          },
        },
      },
    });

    const results = [];

    for (const site of sites) {
      const planSlug = site.account?.subscription?.plan?.slug;
      const subStatus = site.account?.subscription?.status;

      // Skip sites without active subscription
      if (!subStatus || !['ACTIVE', 'TRIALING'].includes(subStatus)) {
        continue;
      }

      // Skip sites with agent disabled
      const agentConfig = site.toolSettings?.agentConfig;
      if (agentConfig && agentConfig.enabled === false) {
        continue;
      }

      // Check frequency based on plan
      const frequencyHours = PLAN_FREQUENCY[planSlug] || DEFAULT_FREQUENCY_HOURS;
      const lastRun = await getLastRunDate(site.id);

      if (lastRun) {
        const hoursSinceLastRun = (Date.now() - new Date(lastRun).getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastRun < frequencyHours) {
          continue; // Not yet time for this site
        }
      }

      // Run analysis
      console.log(`[CronAgent] Analyzing site: ${site.name} (${site.id})`);
      try {
        const result = await runSiteAnalysis(site.id, site.accountId, 'cron');
        results.push({ siteId: site.id, siteName: site.name, ...result });
      } catch (error) {
        console.error(`[CronAgent] Failed for site ${site.id}:`, error.message);
        results.push({ siteId: site.id, siteName: site.name, error: error.message });
      }
    }

    console.log(`[CronAgent] Completed. Processed ${results.length} sites.`);

    return NextResponse.json({
      success: true,
      expired: expiredCount,
      sitesProcessed: results.length,
      results,
    });
  } catch (error) {
    console.error('[CronAgent] Cron failed:', error);
    return NextResponse.json({ error: 'Agent analysis cron failed', details: error.message }, { status: 500 });
  }
}
