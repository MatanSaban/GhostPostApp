/**
 * Account Limits & Usage Tracking
 *
 * Unified system to calculate limits (Plan Base + Add-ons) vs. Current Usage
 * for every capped resource (sites, members, audits, aiCredits, keywords, content).
 *
 * Usage pattern:
 *   const usage = await getAccountUsage(accountId, 'siteAudits');
 *   // => { used: 3, limit: 5, remaining: 2, isLimitReached: false }
 *
 * Server-side enforcement:
 *   const check = await enforceResourceLimit(accountId, 'siteAudits');
 *   if (!check.allowed) return NextResponse.json(check, { status: 403 });
 */

import prisma from './prisma';
import { getLimitFromPlan } from './account-utils';

// ── Resource → AddOnType mapping ─────────────────────────────────

const RESOURCE_TO_ADDON_TYPE = {
  maxSites: 'SITES',
  maxMembers: 'SEATS',
  aiCredits: 'AI_CREDITS',
  maxKeywords: 'KEYWORDS',
  maxContent: 'CONTENT',
  siteAudits: 'SITE_AUDITS',
};

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Compute the extra capacity provided by active add-on purchases
 * for a given resource key.
 */
function addOnBonus(addOnPurchases, resourceKey) {
  const addonType = RESOURCE_TO_ADDON_TYPE[resourceKey];
  if (!addonType) return 0;

  let bonus = 0;
  for (const purchase of addOnPurchases) {
    const addOn = purchase.addOn;
    if (addOn.type !== addonType || purchase.status !== 'ACTIVE') continue;

    const qty = purchase.quantity || 1;

    if (addOn.billingType === 'ONE_TIME') {
      // One-time consumables (e.g. AI credit packs): use creditsRemaining
      bonus += purchase.creditsRemaining || 0;
    } else {
      // Recurring add-ons raise the cap
      bonus += (addOn.quantity || 1) * qty;
    }
  }
  return bonus;
}

/**
 * Count current usage of a resource for the given account.
 * Billing-cycle-aware where applicable.
 */
async function countUsage(accountId, resourceKey, subscription) {
  switch (resourceKey) {
    case 'maxSites':
      return prisma.site.count({
        where: { accountId, isActive: true },
      });

    case 'maxMembers':
      return prisma.accountMember.count({
        where: { accountId, status: 'ACTIVE' },
      });

    case 'siteAudits': {
      // Count audits created in the current billing period (exclude FAILED — e.g. no-sitemap aborts)
      const periodStart = subscription?.currentPeriodStart || new Date(0);
      return prisma.siteAudit.count({
        where: {
          site: { accountId },
          createdAt: { gte: periodStart },
          status: { not: 'FAILED' },
        },
      });
    }

    case 'aiCredits': {
      // For AI credits, "used" = total debits in the current billing period
      const periodStart = subscription?.currentPeriodStart || new Date(0);
      const result = await prisma.aiCreditsLog.aggregate({
        where: {
          accountId,
          type: 'DEBIT',
          createdAt: { gte: periodStart },
        },
        _sum: { amount: true },
      });
      return result._sum.amount || 0;
    }

    case 'maxKeywords':
      return prisma.keyword.count({
        where: { site: { accountId } },
      });

    case 'maxContent':
      return prisma.content.count({
        where: { site: { accountId } },
      });

    default:
      return 0;
  }
}

// ── Main entry point ─────────────────────────────────────────────

/**
 * Get usage vs. limit information for a specific resource.
 *
 * @param {string}  accountId   – Mongo ObjectId of the account
 * @param {string}  resourceKey – One of: maxSites, maxMembers, siteAudits,
 *                                aiCredits, maxKeywords, maxContent
 * @returns {Promise<{
 *   used:           number,
 *   limit:          number | null,   // null = unlimited
 *   remaining:      number | null,   // null = unlimited
 *   isLimitReached: boolean,
 *   addOnType:      string | null,   // matching AddOnType enum, if any
 *   percentUsed:    number,          // 0-100
 * }>}
 */
export async function getAccountUsage(accountId, resourceKey) {
  // 1. Fetch account + subscription + active add-ons
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: {
      subscription: {
        include: {
          plan: true,
          addOnPurchases: {
            where: { status: 'ACTIVE' },
            include: { addOn: true },
          },
        },
      },
    },
  });

  if (!account?.subscription) {
    return {
      used: 0,
      limit: 0,
      remaining: 0,
      isLimitReached: true,
      addOnType: RESOURCE_TO_ADDON_TYPE[resourceKey] || null,
      percentUsed: 100,
    };
  }

  const { subscription } = account;
  const limitations = subscription.plan.limitations || [];
  const addOnPurchases = subscription.addOnPurchases || [];

  // 2. Plan base limit (null = unlimited)
  const baseLimitRaw = getLimitFromPlan(limitations, resourceKey, 0);
  const baseLimitNum = baseLimitRaw; // null means unlimited

  // 3. Add-on bonus (only adds to numeric limits)
  const bonus = addOnBonus(addOnPurchases, resourceKey);

  // 4. Total limit
  const limit = baseLimitNum === null ? null : baseLimitNum + bonus;

  // 5. Current usage
  const used = await countUsage(accountId, resourceKey, subscription);

  // 6. Derived values
  const remaining = limit === null ? null : Math.max(0, limit - used);
  const isLimitReached = limit !== null && used >= limit;
  const percentUsed = limit === null || limit === 0
    ? (used > 0 ? 100 : 0)
    : Math.min(100, Math.round((used / limit) * 100));

  return {
    used,
    limit,
    remaining,
    isLimitReached,
    addOnType: RESOURCE_TO_ADDON_TYPE[resourceKey] || null,
    percentUsed,
  };
}

/**
 * Bulk-fetch usage for multiple resource keys at once.
 * Returns an object keyed by resourceKey.
 */
export async function getAccountUsageBulk(accountId, resourceKeys) {
  const results = {};
  // We could optimise to share the account fetch, but for simplicity:
  await Promise.all(
    resourceKeys.map(async (key) => {
      results[key] = await getAccountUsage(accountId, key);
    }),
  );
  return results;
}

/**
 * Find the relevant AddOn product for a resource key.
 * Used by the LimitReachedModal to show pricing.
 */
export async function getAddOnForResource(resourceKey, locale = 'EN') {
  const addonType = RESOURCE_TO_ADDON_TYPE[resourceKey];
  if (!addonType) return null;

  const addOn = await prisma.addOn.findFirst({
    where: { type: addonType, isActive: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      translations: {
        where: { language: locale },
      },
    },
  });

  if (!addOn) return null;

  const tr = addOn.translations?.[0];
  return {
    id: addOn.id,
    name: tr?.name || addOn.name,
    description: tr?.description || addOn.description,
    price: addOn.price,
    currency: addOn.currency,
    billingType: addOn.billingType,
    quantity: addOn.quantity,
    type: addOn.type,
  };
}

// ── Server-side enforcement helpers ──────────────────────────────

/**
 * Enforce a resource limit server-side.
 * Returns { allowed: true } if OK, or a standardized error payload if the limit is reached.
 *
 * Usage in API routes:
 *   const check = await enforceResourceLimit(accountId, 'siteAudits');
 *   if (!check.allowed) return NextResponse.json(check, { status: 403 });
 *
 * @param {string} accountId
 * @param {string} resourceKey – e.g. 'siteAudits', 'maxSites', 'aiCredits' …
 * @returns {Promise<{ allowed: boolean, code?: string, resourceKey?: string, usage?: object }>}
 */
export async function enforceResourceLimit(accountId, resourceKey) {
  const usage = await getAccountUsage(accountId, resourceKey);

  if (usage.isLimitReached) {
    return {
      allowed: false,
      code: 'LIMIT_REACHED',
      error: `Resource limit reached for ${resourceKey}`,
      resourceKey,
      usage,
    };
  }

  return { allowed: true };
}

/**
 * Enforce that the account has enough AI credits for a given cost.
 * Returns { allowed: true } or a standardized error payload.
 *
 * Usage:
 *   const check = await enforceCredits(accountId, requiredCredits);
 *   if (!check.allowed) return NextResponse.json(check, { status: 402 });
 *
 * @param {string} accountId
 * @param {number} requiredCredits – the credit cost of the operation
 * @returns {Promise<{ allowed: boolean, code?: string, resourceKey?: string, usage?: object }>}
 */
export async function enforceCredits(accountId, requiredCredits) {
  const usage = await getAccountUsage(accountId, 'aiCredits');

  if (usage.isLimitReached || (usage.remaining !== null && usage.remaining < requiredCredits)) {
    return {
      allowed: false,
      code: 'INSUFFICIENT_CREDITS',
      error: 'Insufficient AI credits',
      resourceKey: 'aiCredits',
      usage,
      required: requiredCredits,
    };
  }

  return { allowed: true };
}
