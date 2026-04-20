import { NextResponse } from 'next/server';
import { measureMaturedOutcomes } from '@/lib/agent-fix-outcomes.js';
import { purgeExpiredRejections } from '@/lib/agent-rejections.js';

function verifyAuth(request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // dev mode
  return authHeader === `Bearer ${cronSecret}`;
}

/**
 * GET /api/cron/measure-fix-outcomes
 *
 * Daily cron: scores AgentFixOutcome rows whose 14-day measurement window
 * has matured. Also opportunistically purges expired AgentRejection rows
 * so the suppression set doesn't grow forever.
 */
export async function GET(request) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const result = await measureMaturedOutcomes({ batchLimit: 250 });
    const purged = await purgeExpiredRejections().catch(() => 0);
    const elapsed = Date.now() - startedAt;
    console.log(`[CronMeasureOutcomes] measured=${result.measured} inconclusive=${result.inconclusive} due=${result.dueCount} purgedRejections=${purged} elapsed=${elapsed}ms`);
    return NextResponse.json({ ...result, purgedRejections: purged, elapsedMs: elapsed });
  } catch (err) {
    console.error('[CronMeasureOutcomes] failed:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
