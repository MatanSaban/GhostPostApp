import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { processChunk } from '@/lib/audit/site-auditor';

export const maxDuration = 300;

/**
 * POST /api/audit/continue?auditId=X
 *
 * Drains the next chunk of pendingUrls, then either re-triggers itself for
 * the next chunk or hands off to /api/audit/finalize. Self-triggered by:
 *   • the initial /api/audit POST (after discovery finishes)
 *   • each previous /api/audit/continue invocation (if hasMore)
 *   • the watchdog (GET stale detector + cron) when an audit's heartbeat
 *     has been silent for >5 min
 *
 * Auth: none. The caller is always our own server (or a watchdog cron).
 * If we ever expose this externally, gate by a shared secret + auditId
 * existence — for now the audit-id-as-capability shape is fine on a
 * private internal route.
 */
export async function POST(request) {
  try {
    const { searchParams } = new URL(request.url);
    const auditId = searchParams.get('auditId');
    if (!auditId) {
      return NextResponse.json({ error: 'auditId required' }, { status: 400 });
    }

    const { ok, hasMore, processed, reason } = await processChunk(auditId);

    if (!ok) {
      // Don't retry from inside this handler — let the watchdog re-fire if
      // it's a transient state issue. Emit a non-error status so the caller
      // (which doesn't read it anyway) doesn't trip its retry logic.
      console.warn(`[API/audit/continue] Chunk skipped for ${auditId}: ${reason}`);
      return NextResponse.json({ ok: false, reason });
    }

    // Self-trigger the next stage. Fire-and-forget — we don't await the
    // response; the next instance is its own POST.
    const origin = request.nextUrl.origin;
    const nextPath = hasMore ? '/api/audit/continue' : '/api/audit/finalize';
    fetch(`${origin}${nextPath}?auditId=${auditId}`, {
      method: 'POST',
      // No body needed; auditId carries the state. Cookie not forwarded —
      // these routes are server-to-server.
      headers: { 'Content-Type': 'application/json' },
    }).catch((err) => {
      console.error(`[API/audit/continue] Self-trigger to ${nextPath} failed:`, err.message);
    });

    return NextResponse.json({ ok: true, processed, hasMore });
  } catch (error) {
    console.error('[API/audit/continue] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
