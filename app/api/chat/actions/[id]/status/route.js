import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember } from '@/lib/auth-permissions';
import { getActionStatus, checkPendingActions } from '@/lib/chat/approval-manager';

/**
 * GET /api/chat/actions/[id]/status
 * Get current action status with remaining time.
 */
export async function GET(request, { params }) {
  const { authorized, member, error, isSuperAdmin } = await getCurrentAccountMember();
  if (!authorized) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const { id } = await params;

  const action = await prisma.chatAction.findUnique({
    where: { id },
    select: { accountId: true, conversationId: true },
  });
  if (!action) {
    return NextResponse.json({ error: 'Action not found' }, { status: 404 });
  }
  if (!isSuperAdmin && action.accountId !== member.accountId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Check for warnings/expiry on this conversation's pending actions
  await checkPendingActions(action.conversationId);

  const status = await getActionStatus(id);
  return NextResponse.json(status);
}
