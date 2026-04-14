/**
 * Widget Data Sync — pushes fresh widget data to the WordPress plugin.
 * 
 * Called after key platform events:
 *   - Site audit completes (score changes)
 *   - Agent insights created (pending count changes)
 *   - Agent run completes (recent activity changes)
 */

import prisma from '@/lib/prisma';
import { pushWidgetData } from '@/lib/wp-api-client';

/**
 * Build fresh widget data for a site and push it to the WordPress plugin.
 * Fire-and-forget — never throws.
 * 
 * @param {string} siteId - The site ID
 */
export async function syncWidgetData(siteId) {
  try {
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: {
        url: true,
        siteKey: true,
        siteSecret: true,
        connectionStatus: true,
      },
    });

    if (!site || site.connectionStatus !== 'CONNECTED' || !site.siteKey || !site.siteSecret) {
      return;
    }

    const [latestAudit, pendingInsightsCount, recentRun] = await Promise.all([
      prisma.siteAudit.findFirst({
        where: { siteId },
        orderBy: { createdAt: 'desc' },
        select: { score: true },
      }),
      prisma.agentInsight.count({
        where: { siteId, status: 'PENDING' },
      }),
      prisma.agentRun.findFirst({
        where: { siteId, status: 'COMPLETED' },
        orderBy: { completedAt: 'desc' },
        select: { summary: true },
      }),
    ]);

    let recentActivity = '';
    if (recentRun?.summary) {
      const summary = typeof recentRun.summary === 'string'
        ? JSON.parse(recentRun.summary)
        : recentRun.summary;
      if (summary.discoveries) {
        recentActivity = `${summary.discoveries} discoveries found`;
      }
    }

    await pushWidgetData(site, {
      auditScore: latestAudit?.score ?? null,
      pendingInsights: pendingInsightsCount,
      recentActivity,
    });
  } catch (err) {
    console.warn(`[WidgetSync] Failed for site ${siteId}: ${err.message}`);
  }
}
