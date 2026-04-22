import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifySuperAdmin } from '@/lib/superadmin-auth';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

/**
 * GET /api/admin/impersonation/sessions
 *
 * Returns the most recent impersonation sessions across the system. Restricted
 * to SuperAdmins. Supports a few light filters; we don't paginate via cursors
 * yet because the volume here is low.
 *
 * Query params:
 *   - limit: 1..100 (default 25)
 *   - adminUserId / targetUserId: filter by either side
 *   - active: 'true' to only return live sessions
 */
export async function GET(request) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const limitRaw = parseInt(url.searchParams.get('limit') || '', 10);
    const limit = Math.min(MAX_LIMIT, Math.max(1, isNaN(limitRaw) ? DEFAULT_LIMIT : limitRaw));
    const adminUserId = url.searchParams.get('adminUserId') || undefined;
    const targetUserId = url.searchParams.get('targetUserId') || undefined;
    const onlyActive = url.searchParams.get('active') === 'true';

    const where = {};
    if (adminUserId) where.adminUserId = adminUserId;
    if (targetUserId) where.targetUserId = targetUserId;
    if (onlyActive) {
      where.endedAt = null;
      where.expiresAt = { gt: new Date() };
    }

    const sessions = await prisma.impersonationSession.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        scope: true,
        adminReason: true,
        startedAt: true,
        expiresAt: true,
        endedAt: true,
        endReason: true,
        ipAddress: true,
        targetAccountId: true,
        adminUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        targetUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        _count: { select: { actions: true } },
      },
    });

    return NextResponse.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        scope: s.scope,
        reason: s.adminReason,
        startedAt: s.startedAt,
        expiresAt: s.expiresAt,
        endedAt: s.endedAt,
        endReason: s.endReason,
        ipAddress: s.ipAddress,
        admin: s.adminUser,
        target: s.targetUser,
        targetAccountId: s.targetAccountId,
        actionCount: s._count.actions,
        active: !s.endedAt && new Date(s.expiresAt).getTime() > Date.now(),
      })),
    });
  } catch (error) {
    console.error('[API/admin/impersonation/sessions] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
