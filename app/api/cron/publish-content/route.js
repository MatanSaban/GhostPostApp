import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { signWorkerPayload } from '@/lib/worker-auth';

const MAX_PUBLISH_ATTEMPTS = 3;
const MAX_PER_SITE = 1; // Tenant throttle: max 1 publish per site per cron run

// ─── Security ────────────────────────────────────────────────────────
function verifyAuth(request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  return authHeader === `Bearer ${cronSecret}`;
}

// ─── Fetch Ready Content (Grouped by Site) ───────────────────────────
/**
 * Fetch READY_TO_PUBLISH content, then apply tenant throttling:
 * only ONE item per siteId per cron run to avoid overwhelming
 * client WordPress sites with concurrent requests.
 */
async function fetchThrottledContent() {
  const now = new Date();

  // Fetch a generous batch — we'll filter down per-site
  const candidates = await prisma.content.findMany({
    where: {
      status: 'READY_TO_PUBLISH',
      scheduledAt: { lte: now },
      publishAttempts: { lt: MAX_PUBLISH_ATTEMPTS },
      OR: [
        { campaign: { status: { in: ['ACTIVE', 'PAUSED', 'COMPLETED'] } } },
        { campaignId: null },
      ],
    },
    orderBy: { scheduledAt: 'asc' },
    take: 100, // Over-fetch so we can pick 1 per site
    select: {
      id: true,
      siteId: true,
      campaignId: true,
    },
  });

  if (candidates.length === 0) return [];

  // ── Tenant Throttle: pick MAX_PER_SITE items per site ──────────
  const siteCount = new Map();
  const throttled = [];

  for (const item of candidates) {
    const count = siteCount.get(item.siteId) || 0;
    if (count < MAX_PER_SITE) {
      throttled.push(item);
      siteCount.set(item.siteId, count + 1);
    }
  }

  return throttled;
}

// ─── Worker Dispatch ─────────────────────────────────────────────────
function dispatchPublishWorker(contentId) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  const { token, timestamp } = signWorkerPayload(contentId);

  return fetch(`${baseUrl}/api/worker/publish-article`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-worker-token': token,
      'x-worker-timestamp': String(timestamp),
      'x-worker-content-id': contentId,
    },
    body: JSON.stringify({ contentId }),
    signal: AbortSignal.timeout(60_000),
  })
    .then(async (res) => {
      const body = await res.json().catch(() => ({}));
      return { contentId, ok: res.ok, status: res.status, ...body };
    })
    .catch((err) => {
      console.error(`[publish-content] Dispatch failed for ${contentId}:`, err.message);
      return { contentId, ok: false, error: err.message };
    });
}

// ─── Stale Lock Recovery ─────────────────────────────────────────────
/**
 * Content stuck in READY_TO_PUBLISH with a recent lastAttemptAt but
 * no status change doesn't need recovery — it stays READY_TO_PUBLISH
 * and the next cron run will retry it. This is already safe by design.
 *
 * However, we do recover items that got stuck in limbo (e.g., worker
 * crashed mid-flight and left publishAttempts incremented but no status change).
 * Those are naturally retried on the next cron pass since they're still READY_TO_PUBLISH.
 */

// ─── Auto-Complete Campaigns ─────────────────────────────────────────
async function autoCompleteCampaigns(campaignIds) {
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
      console.log(`[publish-content] Campaign ${campaignId} auto-completed.`);
    }
  }
}

// ─── API Route Handler (Dispatcher) ──────────────────────────────────
export async function GET(request) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  try {
    const now = new Date();
    console.log(`[publish-content] Starting at ${now.toISOString()}`);

    const batch = await fetchThrottledContent();
    console.log(`[publish-content] Dispatching ${batch.length} items (1 per site)`);

    if (batch.length === 0) {
      return NextResponse.json({
        ok: true,
        message: 'No content ready to publish',
        dispatched: 0,
      });
    }

    // Fan-out: dispatch all workers in parallel and wait for them
    const workerPromises = batch.map((item) => dispatchPublishWorker(item.id));
    const workerResults = await Promise.allSettled(workerPromises);

    // Best-effort campaign auto-completion
    const campaignIds = [...new Set(batch.map(c => c.campaignId).filter(Boolean))];
    try {
      await autoCompleteCampaigns(campaignIds);
    } catch (err) {
      console.error('[publish-content] autoCompleteCampaigns error:', err);
    }

    const summary = {
      ok: true,
      dispatched: batch.length,
      sites: [...new Set(batch.map(c => c.siteId))].length,
      contentIds: batch.map(c => c.id),
      results: workerResults.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason?.message }),
    };

    console.log('[publish-content] Dispatcher complete:', JSON.stringify(summary));
    return NextResponse.json(summary);
  } catch (err) {
    console.error('[publish-content] Dispatcher error:', err);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
