import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

function verifyAuth(request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  return authHeader === `Bearer ${cronSecret}`;
}

/**
 * POST /api/cron/expire-impersonation
 *
 * Sweeps stale impersonation state:
 *   - Grants past their `expiresAt` are flipped from ACTIVE → EXPIRED so they
 *     can't be redeemed. Belt-and-suspenders with the inline check in /start.
 *   - Sessions whose `expiresAt` has passed (and that haven't been ended yet)
 *     are marked ended with reason="expired".
 *   - Sessions tied to a now-revoked or expired grant are also force-ended,
 *     even if the session itself hasn't aged out yet.
 *
 * Runs every 5 minutes - small enough to feel responsive, large enough that we
 * don't pay a write storm. The resolver's per-request checks are still the
 * authoritative gate; this cron just keeps the DB tidy and makes audit views
 * accurate without waiting for the next request.
 */
export async function POST(request) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();

    const expiredGrants = await prisma.impersonationGrant.updateMany({
      where: { status: 'ACTIVE', expiresAt: { lte: now } },
      data: { status: 'EXPIRED' },
    });

    const expiredSessions = await prisma.impersonationSession.updateMany({
      where: { endedAt: null, expiresAt: { lte: now } },
      data: { endedAt: now, endReason: 'expired' },
    });

    // Force-end live sessions whose grant is no longer ACTIVE/USED. Two-step
    // because Prisma updateMany can't traverse relations on Mongo - we read
    // the candidate ids first, then end them in a single update.
    const orphanedSessions = await prisma.impersonationSession.findMany({
      where: {
        endedAt: null,
        grant: { status: { in: ['REVOKED', 'EXPIRED'] } },
      },
      select: { id: true, grant: { select: { status: true } } },
    });
    let orphanEnded = 0;
    if (orphanedSessions.length) {
      const result = await prisma.impersonationSession.updateMany({
        where: { id: { in: orphanedSessions.map((s) => s.id) } },
        data: { endedAt: now, endReason: 'grant_revoked' },
      });
      orphanEnded = result.count;
    }

    const summary = {
      expiredGrants: expiredGrants.count,
      expiredSessions: expiredSessions.count,
      orphanedSessions: orphanEnded,
    };
    console.log('[Cron ExpireImpersonation]', summary);
    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    console.error('[Cron ExpireImpersonation] Error:', error);
    return NextResponse.json({ error: 'Expiry sweep failed' }, { status: 500 });
  }
}

export const GET = POST;
