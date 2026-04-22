import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { getActiveImpersonation, IMPERSONATION_COOKIE, SESSION_COOKIE } from '@/lib/impersonation-context';

/**
 * GET /api/impersonation/status
 *
 * Returns whether the current request is inside an active impersonation
 * session, and (if so) who's the admin and who's the target. Designed to be
 * polled by the global ImpersonationBanner.
 *
 * Auth model: anyone with a session cookie can call this. We ONLY return data
 * if the impersonation cookie matches a real session whose adminUserId is the
 * caller's real user (the resolver enforces this). For users who aren't being
 * impersonated, the response is `{ active: false }`.
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const realUserId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!realUserId) {
      return NextResponse.json({ active: false });
    }

    const ctx = await getActiveImpersonation();
    if (!ctx) {
      // Cookie may be stale (session ended/expired since last request) — clear
      // it so the browser stops sending it.
      const stale = cookieStore.get(IMPERSONATION_COOKIE)?.value;
      if (stale) {
        cookieStore.delete(IMPERSONATION_COOKIE);
      }
      return NextResponse.json({ active: false });
    }

    const [admin, target] = await Promise.all([
      prisma.user.findUnique({
        where: { id: ctx.adminUserId },
        select: { id: true, firstName: true, lastName: true, email: true },
      }),
      prisma.user.findUnique({
        where: { id: ctx.targetUserId },
        select: { id: true, firstName: true, lastName: true, email: true },
      }),
    ]);

    return NextResponse.json({
      active: true,
      sessionId: ctx.sessionId,
      scope: ctx.scope,
      startedAt: ctx.startedAt,
      expiresAt: ctx.expiresAt,
      admin,
      target,
      targetAccountId: ctx.targetAccountId,
    });
  } catch (error) {
    console.error('[API/impersonation/status] error:', error);
    return NextResponse.json({ active: false });
  }
}
