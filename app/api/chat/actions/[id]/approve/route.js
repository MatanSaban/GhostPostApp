import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember } from '@/lib/auth-permissions';
import { approveAction } from '@/lib/chat/approval-manager';

/**
 * POST /api/chat/actions/[id]/approve
 * Approve a pending chat action to trigger execution.
 */
export async function POST(request, { params }) {
  const { authorized, member, error, isSuperAdmin } = await getCurrentAccountMember();
  if (!authorized) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const { id } = await params;

  // Verify access
  const action = await prisma.chatAction.findUnique({ where: { id } });
  if (!action) {
    return NextResponse.json({ error: 'Action not found' }, { status: 404 });
  }
  if (!isSuperAdmin && action.accountId !== member.accountId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let argOverrides = null;
  try {
    const body = await request.json().catch(() => null);
    if (body && body.argOverrides && typeof body.argOverrides === 'object') {
      argOverrides = body.argOverrides;
    }
  } catch {
    // no body - continue with unchanged args
  }

  try {
    const result = await approveAction(id, member.userId, argOverrides);
    return NextResponse.json(result);
  } catch (err) {
    // Surface the AI-GCoins limit case as 402 with the standard payload so
    // the frontend's handleLimitError pops the same upgrade modal it shows
    // when the chat-message endpoint refuses on the same condition.
    if (err.code === 'INSUFFICIENT_CREDITS' && err.payload) {
      return NextResponse.json(err.payload, { status: 402 });
    }
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
