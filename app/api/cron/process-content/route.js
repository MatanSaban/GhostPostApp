import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { signWorkerPayload } from '@/lib/worker-auth';

const BATCH_SIZE = 50; // Fan-out: dispatch up to 50 workers per cron run

// ─── Security ────────────────────────────────────────────────────────
function verifyAuth(request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  return authHeader === `Bearer ${cronSecret}`;
}

// ─── Dispatcher: Fetch & Lock ────────────────────────────────────────
/**
 * Atomically find SCHEDULED content that is due and lock it for processing.
 * Uses a two-step fetch-then-lock pattern with a WHERE guard to prevent
 * race conditions between concurrent cron invocations.
 */
async function acquireBatch() {
  const now = new Date();

  // 1. Find candidates
  const candidates = await prisma.content.findMany({
    where: {
      status: 'SCHEDULED',
      scheduledAt: { lte: now },
      processingAttempts: { lt: 3 },
      OR: [
        { campaign: { status: { in: ['ACTIVE', 'COMPLETED'] } } },
        { campaignId: null },
      ],
    },
    orderBy: { scheduledAt: 'asc' },
    take: BATCH_SIZE,
    select: { id: true, campaignId: true },
  });

  if (candidates.length === 0) return [];

  const ids = candidates.map((c) => c.id);

  // 2. Atomic lock — only flip to PROCESSING if still SCHEDULED
  await prisma.content.updateMany({
    where: {
      id: { in: ids },
      status: 'SCHEDULED',
    },
    data: {
      status: 'PROCESSING',
      lastAttemptAt: now,
    },
  });

  // 3. Return the IDs we successfully locked
  const locked = await prisma.content.findMany({
    where: {
      id: { in: ids },
      status: 'PROCESSING',
    },
    select: { id: true, campaignId: true },
  });

  return locked;
}

// ─── Worker Dispatch ─────────────────────────────────────────────────
/**
 * Dispatch a single worker invocation via fetch.
 * Returns a promise — callers must await all dispatches before
 * the route handler returns (serverless runtimes kill unawaited promises).
 */
function dispatchWorker(contentId) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  const { token, timestamp } = signWorkerPayload(contentId);

  return fetch(`${baseUrl}/api/worker/generate-article`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-worker-token': token,
      'x-worker-timestamp': String(timestamp),
      'x-worker-content-id': contentId,
    },
    body: JSON.stringify({ contentId }),
    signal: AbortSignal.timeout(120_000), // 2 min safety net
  })
    .then(async (res) => {
      const body = await res.json().catch(() => ({}));
      return { contentId, ok: res.ok, status: res.status, ...body };
    })
    .catch((err) => {
      console.error(`[process-content] Dispatch failed for ${contentId}:`, err.message);
      return { contentId, ok: false, error: err.message };
    });
}

// ─── Stale Lock Recovery ─────────────────────────────────────────────
/**
 * Find content stuck in PROCESSING for > 10 minutes (worker crashed or
 * timed out) and reset it back to SCHEDULED for retry.
 */
async function recoverStaleLocks() {
  const staleThreshold = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago

  const stale = await prisma.content.updateMany({
    where: {
      status: 'PROCESSING',
      lastAttemptAt: { lt: staleThreshold },
      processingAttempts: { lt: 3 },
    },
    data: {
      status: 'SCHEDULED',
      errorMessage: 'Recovered from stale PROCESSING state',
    },
  });

  if (stale.count > 0) {
    console.log(`[process-content] Recovered ${stale.count} stale PROCESSING records`);
  }
}

// ─── Auto-Complete Campaigns ─────────────────────────────────────────
async function autoCompleteCampaigns(campaignIds) {
  if (campaignIds.length === 0) return;

  for (const campaignId of campaignIds) {
    const remaining = await prisma.content.count({
      where: {
        campaignId,
        status: { in: ['SCHEDULED', 'PROCESSING', 'READY_TO_PUBLISH'] },
      },
    });

    if (remaining === 0) {
      await prisma.campaign.updateMany({
        where: { id: campaignId, status: 'ACTIVE' },
        data: { status: 'COMPLETED' },
      });
      console.log(`[process-content] Campaign ${campaignId} auto-completed.`);
    }
  }
}

// ─── API Route Handler (Dispatcher) ──────────────────────────────────
export async function GET(request) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  try {
    // 1. Recover any stale locks from crashed workers
    await recoverStaleLocks();

    // 2. Acquire a batch of SCHEDULED content
    const batch = await acquireBatch();

    if (batch.length === 0) {
      return NextResponse.json({ ok: true, message: 'No content to process', dispatched: 0 });
    }

    // 3. Fan-out: dispatch all workers in parallel and wait for them
    const workerPromises = batch.map((item) => dispatchWorker(item.id));
    const workerResults = await Promise.allSettled(workerPromises);

    // 4. Summarize results
    const campaignIds = [...new Set(batch.map(c => c.campaignId).filter(Boolean))];

    // Best-effort campaign auto-completion check
    try {
      await autoCompleteCampaigns(campaignIds);
    } catch (err) {
      console.error('[process-content] autoCompleteCampaigns error:', err);
    }

    const summary = {
      ok: true,
      dispatched: batch.length,
      contentIds: batch.map(c => c.id),
      results: workerResults.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason?.message }),
    };

    console.log('[process-content] Dispatcher complete:', JSON.stringify(summary));
    return NextResponse.json(summary);
  } catch (err) {
    console.error('[process-content] Dispatcher error:', err);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
