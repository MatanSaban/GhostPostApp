import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { verifySuperAdmin } from '@/lib/superadmin-auth';
import { IMPERSONATION_COOKIE } from '@/lib/impersonation-context';

/**
 * POST /api/admin/impersonation/end
 * Ends the admin's currently-active impersonation session and clears the cookie.
 *
 * Idempotent: if no active session exists, this just clears the cookie.
 *
 * Note: this is intentionally allowed under READ_ONLY scope (see
 * `READ_ONLY_ALLOWED_MUTATING_PREFIXES` in impersonation-context) — admins
 * must always be able to escape their own impersonation.
 */
export async function POST(request) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const cookieStore = await cookies();
    const token = cookieStore.get(IMPERSONATION_COOKIE)?.value;

    let endReason = 'admin_ended';
    try {
      const body = await request.json().catch(() => ({}));
      if (typeof body.reason === 'string' && body.reason.trim().length > 0) {
        endReason = body.reason.trim().slice(0, 100);
      }
    } catch {
      // ignore — body is optional
    }

    if (token) {
      // Only end sessions that belong to *this* admin. Prevents accidental
      // cross-admin termination if cookies got muddled.
      await prisma.impersonationSession.updateMany({
        where: { sessionToken: token, adminUserId: admin.id, endedAt: null },
        data: { endedAt: new Date(), endReason },
      });
    }

    cookieStore.delete(IMPERSONATION_COOKIE);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[API/admin/impersonation/end] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
