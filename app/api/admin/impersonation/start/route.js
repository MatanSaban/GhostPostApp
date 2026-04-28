import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { verifySuperAdmin } from '@/lib/superadmin-auth';
import {
  hashImpersonationCode,
  generateSessionToken,
  SESSION_TTL_MS,
  MIN_REASON_LEN,
  MAX_REASON_LEN,
} from '@/lib/impersonation';
import { IMPERSONATION_COOKIE } from '@/lib/impersonation-context';

function clientMeta(request) {
  const fwd = request.headers.get('x-forwarded-for');
  const ip = fwd ? fwd.split(',')[0].trim() : request.headers.get('x-real-ip') || null;
  const ua = request.headers.get('user-agent') || null;
  return { ip, ua };
}

/**
 * POST /api/admin/impersonation/start
 * Body: { code: string, reason: string }
 *
 * Redeems a user-issued impersonation code, creates a session, and sets the
 * impersonation cookie for the responding admin. All subsequent user-side API
 * calls from this admin will resolve as the target user (subject to scope
 * enforcement) until the session ends or the cookie is cleared.
 *
 * Reason is required (and audited) so we always have a "why" attached to a
 * session - operationally useful, also a soft deterrent against casual access.
 */
export async function POST(request) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json().catch(() => ({}));
    const codeInput = typeof payload.code === 'string' ? payload.code : '';
    const reason = typeof payload.reason === 'string' ? payload.reason.trim() : '';

    if (!codeInput) {
      return NextResponse.json({ error: 'Code is required' }, { status: 400 });
    }
    if (reason.length < MIN_REASON_LEN || reason.length > MAX_REASON_LEN) {
      return NextResponse.json(
        { error: `Reason must be ${MIN_REASON_LEN}–${MAX_REASON_LEN} characters` },
        { status: 400 },
      );
    }

    const codeHash = hashImpersonationCode(codeInput);

    const grant = await prisma.impersonationGrant.findUnique({
      where: { codeHash },
      include: {
        user: { select: { id: true, isActive: true, isSuperAdmin: true } },
      },
    });

    if (!grant) {
      // Constant-ish response so we don't leak whether ANY grant matches.
      return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 });
    }

    const now = Date.now();
    if (grant.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 });
    }
    if (new Date(grant.expiresAt).getTime() <= now) {
      // Lazy-expire so the row reflects reality.
      await prisma.impersonationGrant.update({
        where: { id: grant.id },
        data: { status: 'EXPIRED' },
      });
      return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 });
    }
    if (grant.usedCount >= grant.maxUses) {
      return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 });
    }
    if (!grant.user || !grant.user.isActive) {
      return NextResponse.json({ error: 'Target user is not available' }, { status: 400 });
    }
    if (grant.user.isSuperAdmin) {
      // Defense-in-depth: code generation already blocks this, but if a user
      // was promoted to admin after issuing a code, refuse to honor it.
      return NextResponse.json(
        { error: 'Cannot impersonate another admin' },
        { status: 403 },
      );
    }

    const meta = clientMeta(request);
    const sessionToken = generateSessionToken();
    const sessionExpiry = new Date(now + SESSION_TTL_MS);

    // Atomically: create the session, bump usedCount + flip grant to USED if
    // we hit maxUses, AND end any prior live session this admin had so the
    // cookie always points to a single active session.
    const txResult = await prisma.$transaction(async (tx) => {
      await tx.impersonationSession.updateMany({
        where: { adminUserId: admin.id, endedAt: null },
        data: { endedAt: new Date(), endReason: 'superseded' },
      });

      const session = await tx.impersonationSession.create({
        data: {
          grantId: grant.id,
          adminUserId: admin.id,
          targetUserId: grant.userId,
          targetAccountId: grant.accountId,
          scope: grant.scope,
          adminReason: reason,
          sessionToken,
          startedAt: new Date(),
          expiresAt: sessionExpiry,
          ipAddress: meta.ip,
          userAgent: meta.ua,
        },
        select: {
          id: true,
          startedAt: true,
          expiresAt: true,
          scope: true,
          targetUserId: true,
          targetAccountId: true,
        },
      });

      const newUsedCount = grant.usedCount + 1;
      await tx.impersonationGrant.update({
        where: { id: grant.id },
        data: {
          usedCount: newUsedCount,
          status: newUsedCount >= grant.maxUses ? 'USED' : 'ACTIVE',
        },
      });

      return session;
    });

    const cookieStore = await cookies();
    cookieStore.set(IMPERSONATION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      // The cookie's max-age matches the hard session cap. The resolver also
      // re-checks expiresAt server-side, so an early-expired session is
      // refused even if the cookie is still warm.
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
      path: '/',
    });

    return NextResponse.json({
      session: {
        id: txResult.id,
        scope: txResult.scope,
        startedAt: txResult.startedAt,
        expiresAt: txResult.expiresAt,
        targetUserId: txResult.targetUserId,
        targetAccountId: txResult.targetAccountId,
      },
    });
  } catch (error) {
    console.error('[API/admin/impersonation/start] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
