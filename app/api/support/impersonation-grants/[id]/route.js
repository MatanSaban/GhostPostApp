import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember } from '@/lib/auth-permissions';

/**
 * DELETE /api/support/impersonation-grants/:id
 * Revoke an active grant. Idempotent: revoking an already-terminal grant is a no-op.
 *
 * Also ends any live sessions spawned from this grant - the resolver checks
 * grant.status before allowing a session to remain valid.
 */
export async function DELETE(_request, context) {
  try {
    const auth = await getCurrentAccountMember();
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    const grant = await prisma.impersonationGrant.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true },
    });
    if (!grant) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (grant.userId !== auth.member.userId) {
      // Don't leak existence of other users' grants.
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (grant.status !== 'ACTIVE') {
      // Already used/expired/revoked - nothing to do.
      return NextResponse.json({ ok: true, alreadyTerminal: true });
    }

    const now = new Date();
    await prisma.$transaction([
      prisma.impersonationGrant.update({
        where: { id: grant.id },
        data: { status: 'REVOKED', revokedAt: now, revokedReason: 'user_revoked' },
      }),
      prisma.impersonationSession.updateMany({
        where: { grantId: grant.id, endedAt: null },
        data: { endedAt: now, endReason: 'grant_revoked' },
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[API/support/impersonation-grants/:id] DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
