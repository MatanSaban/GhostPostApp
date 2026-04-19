import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember } from '@/lib/auth-permissions';
import { rejectAction } from '@/lib/chat/approval-manager';

/**
 * POST /api/chat/actions/[id]/reject
 * Reject a pending chat action.
 */
export async function POST(request, { params }) {
  const { authorized, member, error, isSuperAdmin } = await getCurrentAccountMember();
  if (!authorized) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const { id } = await params;

  const action = await prisma.chatAction.findUnique({ where: { id } });
  if (!action) {
    return NextResponse.json({ error: 'Action not found' }, { status: 404 });
  }
  if (!isSuperAdmin && action.accountId !== member.accountId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const result = await rejectAction(id, member.userId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
