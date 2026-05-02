import { NextResponse } from 'next/server';
import { runFinalization } from '@/lib/audit/site-auditor';

export const maxDuration = 300;

/**
 * POST /api/audit/finalize?auditId=X
 *
 * Runs cross-page analysis + AI Vision + scoring + summary, then marks the
 * audit COMPLETED. Self-triggered by /api/audit/continue when its chunk
 * empties the pendingUrls queue. The watchdog also re-fires this if an audit
 * sits in phase='finalizing' with a stale heartbeat.
 *
 * Auth: same shape as /continue — internal-only, auditId-as-capability.
 */
export async function POST(request) {
  try {
    const { searchParams } = new URL(request.url);
    const auditId = searchParams.get('auditId');
    if (!auditId) {
      return NextResponse.json({ error: 'auditId required' }, { status: 400 });
    }

    const result = await runFinalization(auditId);
    if (!result.ok) {
      console.warn(`[API/audit/finalize] Finalize incomplete for ${auditId}: ${result.reason}`);
      // Leave phase='finalizing' so the watchdog can retry. Return 200 so
      // the caller (continue route's fire-and-forget) doesn't double-log.
      return NextResponse.json({ ok: false, reason: result.reason });
    }
    return NextResponse.json({ ok: true, score: result.score, pages: result.pages });
  } catch (error) {
    console.error('[API/audit/finalize] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
