import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifySuperAdmin } from '@/lib/superadmin-auth';

const ACTION_LIMIT = 500;

/**
 * GET /api/admin/impersonation/sessions/[id]
 * Returns a single session with its full action log (capped at 500 most recent
 * entries — sessions shouldn't normally generate that many; the cap protects
 * the response payload).
 */
export async function GET(_request, { params }) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const session = await prisma.impersonationSession.findUnique({
      where: { id },
      select: {
        id: true,
        scope: true,
        adminReason: true,
        startedAt: true,
        expiresAt: true,
        endedAt: true,
        endReason: true,
        ipAddress: true,
        userAgent: true,
        targetAccountId: true,
        adminUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        targetUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        grant: {
          select: {
            id: true,
            codePrefix: true,
            scope: true,
            reason: true,
            createdAt: true,
            expiresAt: true,
            status: true,
          },
        },
      },
    });

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const actions = await prisma.impersonationAction.findMany({
      where: { sessionId: id },
      orderBy: { createdAt: 'desc' },
      take: ACTION_LIMIT,
      select: {
        id: true,
        method: true,
        path: true,
        statusCode: true,
        bodyPreview: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      session: {
        id: session.id,
        scope: session.scope,
        reason: session.adminReason,
        startedAt: session.startedAt,
        expiresAt: session.expiresAt,
        endedAt: session.endedAt,
        endReason: session.endReason,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        admin: session.adminUser,
        target: session.targetUser,
        targetAccountId: session.targetAccountId,
        grant: session.grant,
        active: !session.endedAt && new Date(session.expiresAt).getTime() > Date.now(),
      },
      actions,
      truncated: actions.length === ACTION_LIMIT,
    });
  } catch (error) {
    console.error('[API/admin/impersonation/sessions/[id]] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
