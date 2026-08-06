/**
 * Interview Post-Completion Orchestrator
 *
 * After the interview wizard completes: makes sure the site has SiteEntity
 * rows (plugin sync when connected, sitemap population otherwise), then
 * kicks off the first AI agent run for the site.
 */

import { after } from 'next/server';
import prisma from '@/lib/prisma';
import { performEntitySync } from '@/lib/entity-sync';
import { populateEntitiesFromSitemaps } from '@/lib/entity-populate';
import { runSiteAnalysis } from '@/lib/agent-analysis';

/**
 * Schedule the post-completion work without blocking the response.
 * Uses Next.js `after()` so the work survives the response being sent
 * (durable on serverless, unlike a plain fire-and-forget promise);
 * falls back to firing the promise directly if `after()` is unavailable.
 */
export function scheduleInterviewPostCompletion({ siteId, accountId, userId, entitiesSelection }) {
  const task = () =>
    runInterviewPostCompletion({ siteId, accountId, userId, entitiesSelection }).catch((e) => {
      console.error('[InterviewPostCompletion] Post-completion work failed:', e);
    });

  try {
    after(task);
  } catch (e) {
    console.error('[InterviewPostCompletion] after() unavailable, firing directly:', e);
    task();
  }
}

/**
 * Step 1: populate entities if the site has none.
 * Step 2: create and run the first agent analysis (idempotent).
 */
export async function runInterviewPostCompletion({ siteId, accountId, userId, entitiesSelection }) {
  if (!siteId || !accountId) return;

  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site) return;

  // Step 1: entities
  try {
    const entityCount = await prisma.siteEntity.count({ where: { siteId } });
    if (entityCount === 0) {
      if (site.connectionStatus === 'CONNECTED' && site.siteKey && site.siteSecret) {
        console.log(`[InterviewPostCompletion] Syncing entities via plugin for site ${siteId}`);
        await performEntitySync(site, { source: 'interview', notify: false });
      } else {
        console.log(`[InterviewPostCompletion] Populating entities from sitemaps for site ${siteId}`);
        await populateEntitiesFromSitemaps({
          siteId,
          accountId,
          selectedSlugs: Array.isArray(entitiesSelection) ? entitiesSelection : null,
          source: 'interview',
        });
      }
    }
  } catch (e) {
    console.error('[InterviewPostCompletion] Entity population failed:', e);
  }

  // Step 2: agent run
  try {
    // Idempotency: never double-run for a site that already has an
    // in-flight run or a previous interview-sourced run
    const existingRun = await prisma.agentRun.findFirst({
      where: { siteId, OR: [{ status: 'RUNNING' }, { source: 'interview' }] },
    });
    if (existingRun) {
      console.log(`[InterviewPostCompletion] Agent run already exists for site ${siteId}, skipping`);
      return;
    }

    // Relevance: a run with no entities and no GA/GSC has nothing to analyze
    const [entityCount, integration] = await Promise.all([
      prisma.siteEntity.count({ where: { siteId } }),
      prisma.googleIntegration.findUnique({ where: { siteId } }),
    ]);
    const gaConnected = !!integration?.gaConnected;
    const gscConnected = !!integration?.gscConnected;
    if (entityCount === 0 && !gaConnected && !gscConnected) {
      console.log(`[InterviewPostCompletion] No entities and no GA/GSC for site ${siteId}, skipping agent run`);
      return;
    }

    const run = await prisma.agentRun.create({
      data: { siteId, accountId, source: 'interview' },
    });
    console.log(`[InterviewPostCompletion] Starting first agent run ${run.id} for site ${siteId}`);
    await runSiteAnalysis(siteId, accountId, 'interview', run.id, userId);
  } catch (e) {
    console.error('[InterviewPostCompletion] Agent run failed:', e);
  }
}
