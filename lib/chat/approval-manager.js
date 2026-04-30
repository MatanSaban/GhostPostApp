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
import { enforceCredits } from '@/lib/account-limits';
import { getOperationCreditCost } from '@/lib/ai/credits';

const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;  // 5 minutes
const WARNING_TIMEOUT_MS = 2 * 60 * 1000;    // 2 minutes

/**
 * Map a chat-action tool to the AI-GCoins operation key it consumes when
 * executed. WP CRUD calls don't invoke the model so they cost 0 credits;
 * only model-driven steps (image gen, audits, agent scans, keyword research)
 * are gated.
 *
 * Read at approve-time and used to refuse execution if the user is over
 * their account credit limit. This closes the gap where a user could push
 * past their limit by approving an already-proposed action.
 */
const TOOL_TO_OPERATION = {
  generate_image: 'GENERATE_IMAGE',
  run_site_audit: 'CRAWL_WEBSITE',
  run_agent_scan: 'AGENT_SUGGEST_TRAFFIC',
  research_keywords: 'GENERATE_KEYWORDS',
  scan_competitor_page: 'COMPETITOR_SCAN',
  add_competitor: 'COMPETITOR_SCAN',
};

/**
 * Sum the AI-GCoins cost of every action in a proposal. WP CRUD-only steps
 * cost 0; model-driven steps look up their cost from the AiFeaturePricing
 * table (with hardcoded fallback). Intended to be called right before an
 * approval triggers execution.
 */
async function estimateActionCost(actions) {
  if (!Array.isArray(actions)) return 0;
  let total = 0;
  for (const a of actions) {
    const opKey = TOOL_TO_OPERATION[a?.tool];
    if (!opKey) continue;
    try {
      const cost = await getOperationCreditCost(opKey);
      if (typeof cost === 'number' && cost > 0) total += cost;
    } catch {
      // Fail open on pricing lookup errors - we'd rather let the action run
      // than block on a transient DB hiccup. The per-operation calls
      // (generateImage, audits, etc.) still do their own credit checks.
    }
  }
  return total;
}

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

  // AI-GCoins gate at approve-time: if the action's combined cost would push
  // the account over its limit, refuse the approval before kicking off any
  // model calls. The chat-message endpoint already checks credits, but the
  // approval lifecycle is its own request - without this gate, a user who
  // ran out of credits between proposing and approving could still trigger
  // expensive operations (image generation = 10 credits, etc.).
  const estimatedCost = await estimateActionCost(actionsToPersist);
  if (estimatedCost > 0 && action.accountId) {
    const creditCheck = await enforceCredits(action.accountId, estimatedCost);
    if (!creditCheck.allowed) {
      const used = creditCheck.usage?.used ?? '?';
      const limit = creditCheck.usage?.limit ?? '?';
      const lang = await detectActionLanguage(action.conversationId);
      const insufficientMsg = lang === 'HE'
        ? `❌ **לא ניתן לבצע את הפעולה - חרגת מהגבלת ה-AI-GCoins של החשבון.**\n\nהפעולה דורשת ${estimatedCost} מטבעות, אבל ניצלת ${used} מתוך ${limit}.\n\nשדרג את התוכנית או חכה לחידוש המטבעות החודשי כדי להמשיך.`
        : `❌ **Cannot run this action - your account is over its AI-GCoins limit.**\n\nThis action requires ${estimatedCost} credits, but you've used ${used} of ${limit}.\n\nUpgrade your plan or wait for the next monthly refill to continue.`;

      await prisma.chatAction.update({
        where: { id: actionId },
        data: { status: 'REJECTED', rejectedAt: new Date(), error: 'INSUFFICIENT_CREDITS' },
      });
      await prisma.chatMessage.create({
        data: {
          conversationId: action.conversationId,
          role: 'ASSISTANT',
          content: insufficientMsg,
        },
      });

      const err = new Error(insufficientMsg);
      err.code = 'INSUFFICIENT_CREDITS';
      err.payload = creditCheck;
      throw err;
    }
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
 * Quick language detection for the rejected-on-credits message - looks at the
 * recent conversation messages and falls back to EN. We don't want to import
 * the executor's full language helper because that creates an import cycle.
 */
async function detectActionLanguage(conversationId) {
  try {
    const recent = await prisma.chatMessage.findMany({
      where: { conversationId, role: 'USER' },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { content: true },
    });
    const text = recent.map((m) => m.content).join(' ');
    const hebrewCharCount = (text.match(/[֐-׿]/g) || []).length;
    if (hebrewCharCount > 5) return 'HE';
  } catch {
    // ignore
  }
  return 'EN';
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
