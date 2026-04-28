/**
 * Chat Action Approval Manager
 * 
 * Handles the approval lifecycle for chat actions:
 * - Creates action proposals with expiry timers
 * - Sends warning messages at 2 minutes
 * - Expires actions after 5 minutes
 * - Processes approve/reject decisions
 */

import prisma from '@/lib/prisma';
import { executeChatAction } from './action-executor';
import { getLocale, getDictionary } from '@/i18n/server';
import { notifyUser } from '@/lib/notifications';
import { findBestMatchingCluster } from '@/lib/cluster-auto-map';
import { preflightCandidate } from '@/lib/cluster-cannibalization-preflight';

const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;  // 5 minutes
const WARNING_TIMEOUT_MS = 2 * 60 * 1000;    // 2 minutes

/**
 * Get a translated chat.actionCard message, with {placeholder} replacement.
 */
async function getActionMessage(key, replacements = {}) {
  try {
    const locale = await getLocale();
    const dict = await getDictionary(locale);
    let msg = dict?.chat?.actionCard?.[key];
    if (!msg) return null;
    for (const [k, v] of Object.entries(replacements)) {
      msg = msg.replace(`{${k}}`, v);
    }
    return msg;
  } catch {
    return null;
  }
}

/**
 * Auto-map the proposal's first post-creation action to a CONFIRMED cluster
 * and run preflight. Best-effort: if anything fails or no cluster matches above
 * the confidence threshold, returns null and the caller persists no cluster context.
 */
async function buildClusterContext({ actions, siteId, accountId, userId }) {
  if (!Array.isArray(actions)) return null;
  const target = actions.find(
    (a) => a?.tool === 'wp_create_post' && a?.args?.title,
  );
  if (!target) return null;

  try {
    const match = await findBestMatchingCluster({
      candidate: { title: target.args.title, content: target.args.content },
      siteId,
      accountId,
      userId,
    });
    if (!match) return null;

    const preflight = await preflightCandidate({
      candidate: {
        title: target.args.title,
        content: target.args.content,
        focusKeyword: target.args.seo?.focus_keyword,
      },
      topicClusterId: match.clusterId,
      accountId,
      userId,
      siteId,
    });

    return { ...match, preflight };
  } catch (err) {
    // Auto-map is opportunistic; never block proposal creation on its failure.
    console.warn('[ApprovalManager] cluster auto-map failed:', err?.message);
    return null;
  }
}

/**
 * Create a new ChatAction proposal that needs user approval.
 * Returns the created action with all timing data.
 */
export async function createActionProposal({
  conversationId,
  siteId,
  accountId,
  userId,
  type,
  plan,
  actions,
}) {
  const now = new Date();
  const warningAt = new Date(now.getTime() + WARNING_TIMEOUT_MS);
  const expiresAt = new Date(now.getTime() + APPROVAL_TIMEOUT_MS);

  const clusterContext = await buildClusterContext({ actions, siteId, accountId, userId });

  const chatAction = await prisma.chatAction.create({
    data: {
      conversationId,
      siteId,
      accountId,
      userId,
      type,
      status: 'PENDING_APPROVAL',
      plan,
      actions,
      rollbackData: [],
      warningAt,
      expiresAt,
      warningSent: false,
      clusterContext,
    },
  });

  // Surface approval gate to the user via in-app notification + web push
  // so they don't miss the 5-minute window if they tabbed away.
  notifyUser(userId, accountId, {
    type: 'agent_approval_pending',
    title: 'notifications.agentApprovalPending.title',
    message: 'notifications.agentApprovalPending.message',
    link: '/dashboard/agent',
    data: { actionId: chatAction.id, actionType: type },
  }).catch((err) =>
    console.warn('[ApprovalManager] notifyUser failed:', err?.message),
  );

  return chatAction;
}

/**
 * Approve a pending ChatAction and trigger execution.
 */
export async function approveAction(actionId, userId, argOverrides = null) {
  const action = await prisma.chatAction.findUnique({ where: { id: actionId } });

  if (!action) throw new Error('Action not found');
  if (action.status !== 'PENDING_APPROVAL') {
    throw new Error(`Cannot approve action with status: ${action.status}`);
  }
  if (new Date() > action.expiresAt) {
    await prisma.chatAction.update({
      where: { id: actionId },
      data: { status: 'EXPIRED' },
    });
    throw new Error('Action has expired');
  }

  // Merge user-provided overrides (e.g. edited image prompt + reference images)
  // into the stored action args before execution.
  let actionsToPersist = action.actions;
  if (argOverrides && typeof argOverrides === 'object' && Array.isArray(action.actions)) {
    actionsToPersist = action.actions.map((a, idx) => {
      const override = argOverrides[idx] || argOverrides[String(idx)];
      if (!override || typeof override !== 'object') return a;
      return { ...a, args: { ...(a.args || {}), ...override } };
    });
  }

  await prisma.chatAction.update({
    where: { id: actionId },
    data: {
      status: 'APPROVED',
      approvedAt: new Date(),
      ...(actionsToPersist !== action.actions ? { actions: actionsToPersist } : {}),
    },
  });

  // Execute in background
  const result = executeChatAction(actionId).catch(err => {
    console.error('[ApprovalManager] Execution error:', err.message);
  });

  return { status: 'APPROVED', message: 'Action approved and execution started' };
}

/**
 * Reject a pending ChatAction.
 */
export async function rejectAction(actionId, userId) {
  const action = await prisma.chatAction.findUnique({ where: { id: actionId } });

  if (!action) throw new Error('Action not found');
  if (action.status !== 'PENDING_APPROVAL') {
    throw new Error(`Cannot reject action with status: ${action.status}`);
  }

  await prisma.chatAction.update({
    where: { id: actionId },
    data: {
      status: 'REJECTED',
      rejectedAt: new Date(),
    },
  });

  const rejectedMsg = await getActionMessage('rejectedMessage')
    || '❌ Action plan was rejected. Let me know if you\'d like me to suggest a different approach.';
  await prisma.chatMessage.create({
    data: {
      conversationId: action.conversationId,
      role: 'ASSISTANT',
      content: rejectedMsg,
    },
  });

  return { status: 'REJECTED' };
}

/**
 * Check for pending actions that need warnings or expiration.
 * Called on each chat message or via a periodic check.
 */
export async function checkPendingActions(conversationId) {
  const now = new Date();

  const pendingActions = await prisma.chatAction.findMany({
    where: {
      conversationId,
      status: 'PENDING_APPROVAL',
    },
  });

  for (const action of pendingActions) {
    // Check expiry
    if (now >= action.expiresAt) {
      await prisma.chatAction.update({
        where: { id: action.id },
        data: { status: 'EXPIRED' },
      });
      const expiredMsg = await getActionMessage('expiredMessage')
        || `⏰ The action plan has **expired** because it wasn't approved within 5 minutes.\n\nIf you still want to proceed, just ask me again and I'll create a new plan.`;
      await prisma.chatMessage.create({
        data: {
          conversationId,
          role: 'ASSISTANT',
          content: expiredMsg,
        },
      });
      continue;
    }

    // Check warning (2 min mark)
    if (!action.warningSent && now >= action.warningAt) {
      await prisma.chatAction.update({
        where: { id: action.id },
        data: { warningSent: true },
      });
      const remainingMs = action.expiresAt.getTime() - now.getTime();
      const remainingMin = Math.ceil(remainingMs / 60000);
      const warningMsg = await getActionMessage('warningMessage', { minutes: remainingMin })
        || `⚠️ **Reminder:** The action plan above will expire in **${remainingMin} minutes** if not approved.\n\nPlease approve or reject the plan to continue.`;
      await prisma.chatMessage.create({
        data: {
          conversationId,
          role: 'ASSISTANT',
          content: warningMsg,
        },
      });
    }
  }

  return pendingActions;
}

/**
 * Get the current status of a ChatAction with timing info.
 */
export async function getActionStatus(actionId) {
  const action = await prisma.chatAction.findUnique({
    where: { id: actionId },
    select: {
      id: true,
      status: true,
      type: true,
      plan: true,
      result: true,
      error: true,
      expiresAt: true,
      warningAt: true,
      warningSent: true,
      approvedAt: true,
      rejectedAt: true,
      executedAt: true,
      rolledBackAt: true,
      createdAt: true,
      clusterContext: true,
    },
  });

  if (!action) return null;

  const now = new Date();
  const remainingMs = Math.max(0, action.expiresAt.getTime() - now.getTime());

  return {
    ...action,
    remainingMs,
    remainingSeconds: Math.ceil(remainingMs / 1000),
    isExpired: action.status === 'PENDING_APPROVAL' && now >= action.expiresAt,
  };
}
