/**
 * AI Credits Service
 * 
 * This service handles:
 * - Tracking AI credits usage to the database
 * - Deducting credits from account balance
 * - Logging usage with full context (action, site, user, etc.)
 */

import prisma from '@/lib/prisma';
import { getLimitFromPlan } from '@/lib/account-utils';
import { AI_OPERATIONS, tokensToCredits, getOperationConfig } from './credits.js';

/**
 * After a debit is recorded, check if period allocation is overflowed
 * and deplete one-time AI credit packs (FIFO by purchase date).
 *
 * This ensures one-time packs are consumed only when the period allocation
 * (plan + recurring addons) is exhausted, and that they don't "recharge"
 * when a new billing period starts.
 *
 * @param {string} accountId
 * @param {number} creditsJustUsed - credits consumed by the current operation
 */
async function depleteOneTimePacks(accountId, creditsJustUsed) {
  try {
    const sub = await prisma.subscription.findFirst({
      where: { accountId, status: 'ACTIVE' },
      include: { plan: true },
    });
    if (!sub) return;

    // Fetch all active AI credit add-on purchases in one query
    const allAiPurchases = await prisma.addOnPurchase.findMany({
      where: {
        subscriptionId: sub.id,
        status: 'ACTIVE',
      },
      include: { addOn: true },
      orderBy: { purchasedAt: 'asc' },
    });

    // Split into recurring (period) and one-time (persistent)
    let recurringBonus = 0;
    const oneTimePurchases = [];
    for (const p of allAiPurchases) {
      if (p.addOn.type !== 'AI_CREDITS') continue;
      if (p.addOn.billingType === 'RECURRING') {
        recurringBonus += (p.addOn.quantity || 0) * (p.quantity || 1);
      } else if (p.addOn.billingType === 'ONE_TIME') {
        oneTimePurchases.push(p);
      }
    }

    if (oneTimePurchases.length === 0) return;

    // Period allocation = plan credits + recurring addon bonus
    const planCredits = getLimitFromPlan(sub.plan.limitations, 'aiCredits', 0);
    if (planCredits === null) return; // Unlimited plan - no depletion needed
    const periodAllocation = (planCredits || 0) + recurringBonus;

    // Total period debits (including the one just recorded)
    const periodStart = sub.currentPeriodStart || new Date(0);
    const agg = await prisma.aiCreditsLog.aggregate({
      where: { accountId, type: 'DEBIT', createdAt: { gte: periodStart } },
      _sum: { amount: true },
    });
    const periodUsedAfter = agg._sum.amount || 0;
    const periodUsedBefore = periodUsedAfter - creditsJustUsed;

    // How many one-time credits THIS specific debit consumed
    const overflowBefore = Math.max(0, periodUsedBefore - periodAllocation);
    const overflowAfter = Math.max(0, periodUsedAfter - periodAllocation);
    const oneTimeConsumed = overflowAfter - overflowBefore;

    if (oneTimeConsumed <= 0) return;

    // Drain from one-time purchases FIFO
    let toDrain = oneTimeConsumed;
    for (const purchase of oneTimePurchases) {
      if (toDrain <= 0) break;
      const available = purchase.creditsRemaining || 0;
      if (available <= 0) continue;

      const drain = Math.min(toDrain, available);
      const newRemaining = available - drain;

      await prisma.addOnPurchase.update({
        where: { id: purchase.id },
        data: {
          creditsRemaining: newRemaining,
          ...(newRemaining <= 0 ? { status: 'DEPLETED' } : {}),
        },
      });

      toDrain -= drain;
    }

    if (oneTimeConsumed > 0) {
      console.log(`[CreditsService] Depleted ${oneTimeConsumed} one-time credits from packs`);
    }
  } catch (error) {
    // Don't fail the main operation - depletion is bookkeeping
    console.error('[CreditsService] depleteOneTimePacks error:', error.message);
  }
}

/**
 * Track AI usage and deduct credits from account
 * 
 * @param {Object} options
 * @param {string} options.accountId - The account ID
 * @param {string} options.userId - The user who initiated the action (optional)
 * @param {string} options.siteId - The site context (optional)
 * @param {string} options.operation - The AI operation key (from AI_OPERATIONS)
 * @param {number} options.inputTokens - Input tokens used
 * @param {number} options.outputTokens - Output tokens used
 * @param {number} options.totalTokens - Total tokens used (optional, calculated if not provided)
 * @param {string} options.description - Human-readable description
 * @param {Object} options.metadata - Additional context
 * @returns {Promise<Object>} Result with success status and log entry
 */
export async function trackAIUsage({
  accountId,
  userId = null,
  siteId = null,
  operation,
  inputTokens = 0,
  outputTokens = 0,
  totalTokens = null,
  description = null,
  metadata = {},
}) {
  console.log('[CreditsService] trackAIUsage called with:', { accountId, operation, userId });
  
  if (!accountId) {
    console.error('[CreditsService] No accountId provided for AI usage tracking');
    return { success: false, error: 'No accountId provided' };
  }

  const operationConfig = getOperationConfig(operation);
  const total = totalTokens ?? (inputTokens + outputTokens);
  
  // Calculate credits: use operation's fixed credits or calculate from tokens
  const creditsUsed = operationConfig.credits;
  
  try {
    // Atomic update with retry - $inc is document-level atomic but
    //    can still fail on transient errors or implicit transaction conflicts
    const MAX_RETRIES = 5;
    let updatedAccount;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        updatedAccount = await prisma.account.update({
          where: { id: accountId },
          data: {
            aiCreditsUsedTotal: { increment: creditsUsed },
          },
          select: { aiCreditsUsedTotal: true },
        });
        break;
      } catch (updateError) {
        const isRetryable = updateError.message?.includes('write conflict') || updateError.message?.includes('deadlock');
        if (isRetryable && attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 100 * attempt));
          continue;
        }
        throw updateError;
      }
    }

    // Append log entry (separate collection - won't conflict)
    const logEntry = await prisma.aiCreditsLog.create({
      data: {
        accountId,
        userId,
        siteId,
        type: 'DEBIT',
        amount: creditsUsed,
        balance: 0,
        source: operation,
        description: description || operationConfig.name,
        metadata: {
          operationKey: operation,
          operationName: operationConfig.name,
          operationNameHe: operationConfig.nameHe,
          inputTokens,
          outputTokens,
          totalTokens: total,
          model: operationConfig.model,
          ...metadata,
        },
      },
    });

    const newUsedTotal = updatedAccount.aiCreditsUsedTotal;
    console.log(`[CreditsService] Used ${creditsUsed} credits for ${operation}. Total used: ${newUsedTotal}`);

    // Deplete one-time credit packs if period allocation is overflowed
    await depleteOneTimePacks(accountId, creditsUsed);

    return {
      success: true,
      creditsUsed,
      totalUsed: newUsedTotal,
      logEntry,
    };
  } catch (error) {
    console.error('[CreditsService] Error tracking AI usage:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Add credits to an account (for purchases, plan renewals, etc.)
 * 
 * @param {Object} options
 * @param {string} options.accountId - The account ID
 * @param {number} options.amount - Number of credits to add
 * @param {string} options.source - Source of credits (e.g., 'plan_renewal', 'addon_purchase')
 * @param {string} options.sourceId - Related entity ID (optional)
 * @param {string} options.description - Human-readable description
 * @param {Object} options.metadata - Additional context
 * @returns {Promise<Object>} Result with success status and log entry
 */
export async function addCredits({
  accountId,
  amount,
  source,
  sourceId = null,
  description = null,
  metadata = {},
}) {
  if (!accountId) {
    console.error('[CreditsService] No accountId provided for adding credits');
    return { success: false, error: 'No accountId provided' };
  }

  if (!amount || amount <= 0) {
    console.error('[CreditsService] Invalid amount for adding credits:', amount);
    return { success: false, error: 'Invalid amount' };
  }

  try {
    // Get current account balance
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { aiCreditsBalance: true },
    });

    if (!account) {
      console.error('[CreditsService] Account not found:', accountId);
      return { success: false, error: 'Account not found' };
    }

    const newBalance = account.aiCreditsBalance + amount;

    // Update account balance and create log in a transaction
    const [updatedAccount, logEntry] = await prisma.$transaction([
      prisma.account.update({
        where: { id: accountId },
        data: { aiCreditsBalance: newBalance },
      }),
      prisma.aiCreditsLog.create({
        data: {
          accountId,
          type: 'CREDIT',
          amount,
          balance: newBalance,
          source,
          sourceId,
          description: description || `Added ${amount} credits`,
          metadata,
        },
      }),
    ]);

    console.log(`[CreditsService] Added ${amount} credits. New balance: ${newBalance}`);

    return {
      success: true,
      creditsAdded: amount,
      newBalance,
      logEntry,
    };
  } catch (error) {
    console.error('[CreditsService] Error adding credits:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get usage logs for an account
 * 
 * @param {Object} options
 * @param {string} options.accountId - The account ID
 * @param {number} options.limit - Max number of logs to return (default: 50)
 * @param {number} options.offset - Offset for pagination (default: 0)
 * @param {string} options.type - Filter by type ('CREDIT' or 'DEBIT')
 * @param {string} options.siteId - Filter by site ID
 * @returns {Promise<Object>} Usage logs with pagination info
 */
export async function getUsageLogs({
  accountId,
  limit = 50,
  offset = 0,
  type = null,
  siteId = null,
}) {
  if (!accountId) {
    return { success: false, error: 'No accountId provided' };
  }

  try {
    const where = { accountId };
    if (type) where.type = type;
    if (siteId) where.siteId = siteId;

    const [logs, total] = await prisma.$transaction([
      prisma.aiCreditsLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          account: {
            select: { name: true },
          },
        },
      }),
      prisma.aiCreditsLog.count({ where }),
    ]);

    // Enrich logs with user and site names
    const enrichedLogs = await Promise.all(logs.map(async (log) => {
      let userName = null;
      let siteName = null;
      let siteUrl = null;

      if (log.userId) {
        const user = await prisma.user.findUnique({
          where: { id: log.userId },
          select: { firstName: true, lastName: true, email: true },
        });
        userName = user ? (user.firstName && user.lastName 
          ? `${user.firstName} ${user.lastName}` 
          : user.firstName || user.lastName || user.email) 
          : null;
      }

      if (log.siteId) {
        const site = await prisma.site.findUnique({
          where: { id: log.siteId },
          select: { name: true, url: true },
        });
        siteName = site?.name || null;
        siteUrl = site?.url || null;
      }
      
      // If no site record but we have data in metadata, use that
      const metadata = log.metadata || {};
      if (!siteName && (metadata.siteName || metadata.businessName)) {
        siteName = metadata.siteName || metadata.businessName;
      }
      if (!siteUrl && metadata.websiteUrl) {
        siteUrl = metadata.websiteUrl;
        // If still no siteName, extract domain name from URL
        if (!siteName) {
          try {
            const urlObj = new URL(metadata.websiteUrl);
            siteName = urlObj.hostname.replace('www.', '');
          } catch {
            siteName = metadata.websiteUrl;
          }
        }
      }

      return {
        ...log,
        userName,
        siteName,
        siteUrl,
      };
    }));

    return {
      success: true,
      logs: enrichedLogs,
      total,
      limit,
      offset,
      hasMore: offset + logs.length < total,
    };
  } catch (error) {
    console.error('[CreditsService] Error fetching usage logs:', error);
    return { success: false, error: error.message, logs: [], total: 0 };
  }
}

/**
 * Check if account has enough credits for an operation
 * 
 * @param {string} accountId - The account ID
 * @param {string} operation - The AI operation key
 * @returns {Promise<Object>} Result with hasCredits boolean and current balance
 */
export async function checkCredits(accountId, operation) {
  if (!accountId) {
    return { success: false, hasCredits: false, error: 'No accountId provided' };
  }

  const operationConfig = getOperationConfig(operation);
  const requiredCredits = operationConfig.credits;

  try {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { aiCreditsBalance: true },
    });

    if (!account) {
      return { success: false, hasCredits: false, error: 'Account not found' };
    }

    const hasCredits = account.aiCreditsBalance >= requiredCredits;

    return {
      success: true,
      hasCredits,
      currentBalance: account.aiCreditsBalance,
      requiredCredits,
      operation: operationConfig.name,
    };
  } catch (error) {
    console.error('[CreditsService] Error checking credits:', error);
    return { success: false, hasCredits: false, error: error.message };
  }
}

export default {
  trackAIUsage,
  addCredits,
  getUsageLogs,
  checkCredits,
};
