import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember } from '@/lib/auth-permissions';

/**
 * POST /api/chat/actions/[id]/retry
 *
 * Re-propose a previously failed (or expired/rejected) ChatAction by cloning
 * its plan + steps into a fresh PENDING_APPROVAL ChatAction. The user sees a
 * new action card they can approve to retry.
 *
 * Why a clone instead of mutating the original: the original card stays in
 * the conversation as a record of what failed (with its rollback data, error
 * message, and completion summary). The new card has its own 5-minute approval
 * window and execution lifecycle - clean separation, no merging of histories.
 *
 * Only the original action's account members can retry. The retry inherits the
 * same conversation / site / accountId.
 */
export async function POST(_request, { params }) {
  const { authorized, member, error, isSuperAdmin } = await getCurrentAccountMember();
  if (!authorized) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const { id } = await params;

  const original = await prisma.chatAction.findUnique({ where: { id } });
  if (!original) {
    return NextResponse.json({ error: 'Action not found' }, { status: 404 });
  }
  if (!isSuperAdmin && original.accountId !== member.accountId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  // Only retry actions that have actually finished (failed/rejected/expired/
  // rolled-back). Don't allow retrying a still-pending or executing action -
  // the original is in flight and a clone would duplicate the work.
  const RETRYABLE = ['FAILED', 'REJECTED', 'EXPIRED', 'ROLLED_BACK'];
  if (!RETRYABLE.includes(original.status)) {
    return NextResponse.json(
      { error: `Cannot retry an action with status ${original.status}` },
      { status: 400 },
    );
  }

  const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;
  const WARNING_TIMEOUT_MS = 2 * 60 * 1000;
  const now = new Date();

  const cloned = await prisma.chatAction.create({
    data: {
      conversationId: original.conversationId,
      siteId: original.siteId,
      accountId: original.accountId,
      userId: member.userId, // The user who initiated the retry (may differ from original)
      type: original.type,
      status: 'PENDING_APPROVAL',
      plan: {
        ...(original.plan || {}),
        // Mark the cloned plan so the UI / agent can recognise it as a retry
        // of a prior attempt. Useful for surfacing "Attempt #2" in the card.
        retryOf: original.id,
        retryAttempt: ((original.plan && typeof original.plan === 'object' && original.plan.retryAttempt) || 1) + 1,
      },
      actions: original.actions,
      rollbackData: [],
      warningSent: false,
      warningAt: new Date(now.getTime() + WARNING_TIMEOUT_MS),
      expiresAt: new Date(now.getTime() + APPROVAL_TIMEOUT_MS),
    },
  });

  // Bump the conversation's updatedAt + leave a small assistant message so
  // the new card has clear provenance in the chat scrollback.
  await prisma.chatConversation.update({
    where: { id: original.conversationId },
    data: { updatedAt: now },
  });

  return NextResponse.json({
    ok: true,
    action: {
      id: cloned.id,
      status: cloned.status,
      retryOf: original.id,
      expiresAt: cloned.expiresAt,
    },
  });
}
