import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { invalidateAudit } from '@/lib/cache/invalidate.js';
import { triggerStage } from '@/lib/audit/internal-trigger';

export const maxDuration = 60;

// Same shape as the GET /api/audit stale detector. The detector handles
// audits a user is actively viewing; this cron handles everyone else —
// audits whose tab isn't open or whose initiator already navigated away.
const STALE_MS = 5 * 60 * 1000;
const HARD_LIMIT_MS = 4 * 60 * 60 * 1000;
const FINAL_HARD_LIMIT_MS = 30 * 60 * 1000;

function verifyAuth(request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // dev mode
  return authHeader === `Bearer ${cronSecret}`;
}

/**
 * GET /api/cron/audit-watchdog
 *
 * Runs every 5 minutes (configured in vercel.json). Scans for in-flight
 * audits whose heartbeat (`updatedAt`) is older than 5 minutes and either:
 *   • re-triggers the next stage if they're in a resumable phase, or
 *   • marks them FAILED if they've blown past the hard wall-time limit
 *     or were on the legacy single-shot path.
 *
 * Self-trigger uses absolute URLs constructed from VERCEL_URL or
 * NEXT_PUBLIC_BASE_URL — needed because cron has no request origin.
 */
export async function GET(request) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Resolve our own origin for self-trigger fetches. Vercel sets VERCEL_URL
  // (host without protocol) for us; fall back to a configured base URL.
  const origin = (() => {
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
    if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
    // Local dev — request.url has the right host
    try { return new URL(request.url).origin; } catch { return null; }
  })();

  if (!origin) {
    return NextResponse.json({ error: 'Origin unresolvable' }, { status: 500 });
  }

  // Pull a window of in-flight audits. We don't need the heavy fields here.
  const since = new Date(Date.now() - STALE_MS);
  const stale = await prisma.siteAudit.findMany({
    where: {
      status: { in: ['PENDING', 'RUNNING'] },
      updatedAt: { lt: since },
    },
    select: {
      id: true, siteId: true, status: true, phase: true, deviceType: true,
      progress: true, startedAt: true, createdAt: true, updatedAt: true,
      chunkLeaseUntil: true,
    },
    take: 50, // soft cap so a backlog doesn't blow the cron's 60s budget
  });

  const now = Date.now();
  let nudgedScanning = 0, nudgedFinalizing = 0, failed = 0;

  for (const audit of stale) {
    const startedAt = audit.startedAt || audit.createdAt;
    const totalAge = now - new Date(startedAt).getTime();
    const phase = audit.phase || null;

    if (phase === 'scanning' && totalAge < HARD_LIMIT_MS) {
      // Same lease check the GET stale detector applies. Don't spawn a
      // competitor while a real chunk is mid-scan.
      if (audit.chunkLeaseUntil && audit.chunkLeaseUntil > new Date()) {
        continue;
      }
      console.warn(`[CronAuditWatchdog] Nudging stalled scanning audit ${audit.id}`);
      triggerStage(origin, `/api/audit/continue?auditId=${audit.id}`, { tag: 'cron→continue' });
      nudgedScanning++;
      continue;
    }
    if (phase === 'finalizing' && totalAge < FINAL_HARD_LIMIT_MS) {
      console.warn(`[CronAuditWatchdog] Nudging stalled finalizing audit ${audit.id}`);
      triggerStage(origin, `/api/audit/finalize?auditId=${audit.id}`, { tag: 'cron→finalize' });
      nudgedFinalizing++;
      continue;
    }

    // Legacy / discovery / over-budget — give up.
    const p = audit.progress || {};
    console.warn(`[CronAuditWatchdog] FAILing stale audit ${audit.id} (phase=${phase || 'legacy'}, age=${Math.round(totalAge/60000)}min)`);
    await prisma.siteAudit.update({
      where: { id: audit.id },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        score: 0,
        issues: [{
          type: 'technical',
          severity: 'error',
          message: 'audit.issues.auditTimedOut',
          suggestion: 'audit.suggestions.retryAudit',
          source: 'system',
          details: JSON.stringify({
            stuckAt: p.labelKey || 'unknown',
            currentStep: p.currentStep ?? null,
            totalSteps: p.totalSteps ?? null,
            deviceType: audit.deviceType || null,
            phase,
          }),
        }],
      },
    }).catch((err) => console.error(`[CronAuditWatchdog] FAIL update for ${audit.id} failed:`, err));
    invalidateAudit(audit.siteId);
    failed++;
  }

  return NextResponse.json({
    success: true,
    examined: stale.length,
    nudgedScanning,
    nudgedFinalizing,
    failed,
  });
}
