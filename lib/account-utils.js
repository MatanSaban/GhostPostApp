/**
 * Account Utilities
 * 
 * Business Rules:
 * 1. When a user registers and creates an account, it's a company account and
 *    the user is automatically the owner.
 * 2. A user can only be owner of ONE account (cannot create multiple companies).
 * 3. A user who owns an account can be invited as a member to other accounts (not as owner).
 * 4. Subscriptions belong to the Account (company), not the User.
 * 5. Only owners or users with sufficient permissions can manage the subscription.
 * 6. Each plan includes AI Credits, seats, and websites. Add-ons can extend these.
 * 7. Some plans have limits on how many add-ons can be purchased.
 */

import prisma from './prisma';

/**
 * Extract a numeric limit value from the limitations JSON array
 * @param {Array} limitations - The limitations array from plan
 * @param {string} key - The key to look for (e.g., 'maxSites', 'maxMembers')
 * @param {number} defaultValue - Default value if not found
 * @returns {number|null} - The limit value or null for unlimited
 */
export function getLimitFromPlan(limitations, key, defaultValue = null) {
  if (!limitations || !Array.isArray(limitations)) return defaultValue;
  
  const item = limitations.find(l => l.key === key);
  if (!item) return defaultValue;
  
  // Check for unlimited indicators
  const value = item.value;
  if (value === null || value === undefined) return defaultValue;
  if (value === -1 || value === '-1') return null; // null means unlimited
  if (typeof value === 'string' && value.toLowerCase() === 'unlimited') return null;
  
  // Parse numeric value
  const numValue = typeof value === 'number' ? value : parseInt(value, 10);
  if (isNaN(numValue)) return defaultValue;
  
  // Very high values are treated as unlimited
  if (numValue >= 999999) return null;
  
  return numValue;
}

/**
 * Get all limit values from a plan's limitations array
 * @param {object} plan - The plan object with limitations array
 * @returns {object} - Object with all limit values
 */
export function getPlanLimits(plan) {
  const limitations = plan?.limitations || [];
  
  return {
    maxMembers: getLimitFromPlan(limitations, 'maxMembers', 1),
    maxSites: getLimitFromPlan(limitations, 'maxSites', 1),
    maxKeywords: getLimitFromPlan(limitations, 'maxKeywords', 100),
    maxContent: getLimitFromPlan(limitations, 'maxContent', 50),
    aiCredits: getLimitFromPlan(limitations, 'aiCredits', 0),
    maxAddOnSeats: getLimitFromPlan(limitations, 'maxAddOnSeats', null),
    maxAddOnSites: getLimitFromPlan(limitations, 'maxAddOnSites', null),
  };
}

/**
 * Check if a user is already an owner of any account
 * @param {string} userId - The user ID to check
 * @returns {Promise<boolean>} - True if user is already an owner
 */
export async function isUserAlreadyOwner(userId) {
  if (!userId) return false;
  
  const ownerMembership = await prisma.accountMember.findFirst({
    where: {
      userId,
      isOwner: true,
      status: 'ACTIVE',
    },
  });
  
  return !!ownerMembership;
}

/**
 * Get the account where the user is the owner
 * @param {string} userId - The user ID
 * @returns {Promise<object|null>} - The account or null
 */
export async function getOwnedAccount(userId) {
  if (!userId) return null;
  
  const membership = await prisma.accountMember.findFirst({
    where: {
      userId,
      isOwner: true,
      status: 'ACTIVE',
    },
    include: {
      account: {
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
      },
    },
  });
  
  return membership?.account || null;
}

/**
 * Calculate the total resources available for an account (plan + add-ons)
 * @param {string} accountId - The account ID
 * @returns {Promise<object>} - Resource limits
 */
export async function getAccountResourceLimits(accountId) {
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
      _count: {
        select: {
          members: { where: { status: 'ACTIVE' } },
          sites: { where: { isActive: true } },
        },
      },
    },
  });
  
  if (!account || !account.subscription) {
    return {
      hasSubscription: false,
      limits: null,
      usage: null,
    };
  }
  
  const plan = account.subscription.plan;
  const planLimits = getPlanLimits(plan);
  const addOnPurchases = account.subscription.addOnPurchases || [];
  
  // Calculate add-on contributions
  let additionalSeats = 0;
  let additionalSites = 0;
  let additionalAiCredits = 0;
  
  for (const purchase of addOnPurchases) {
    const addOn = purchase.addOn;
    const qty = purchase.quantity || 1;
    
    switch (addOn.type) {
      case 'SEATS':
        additionalSeats += (addOn.quantity || 1) * qty;
        break;
      case 'SITES':
        additionalSites += (addOn.quantity || 1) * qty;
        break;
      case 'AI_CREDITS':
        // One-time AI credits are tracked in creditsRemaining
        if (addOn.billingType === 'ONE_TIME') {
          additionalAiCredits += purchase.creditsRemaining || 0;
        } else {
          // Recurring AI credits add to monthly allocation
          additionalAiCredits += (addOn.quantity || 0) * qty;
        }
        break;
    }
  }
  
  // Calculate total limits (null means unlimited)
  const maxMembers = planLimits.maxMembers === null ? null : (planLimits.maxMembers || 1) + additionalSeats;
  const maxSites = planLimits.maxSites === null ? null : (planLimits.maxSites || 1) + additionalSites;
  
  return {
    hasSubscription: true,
    limits: {
      // Total limits (plan + add-ons), null = unlimited
      maxMembers,
      maxSites,
      maxKeywords: planLimits.maxKeywords,
      maxContent: planLimits.maxContent,
      
      // Add-on limits from plan
      maxAddOnSeats: planLimits.maxAddOnSeats,      // null = unlimited
      maxAddOnSites: planLimits.maxAddOnSites,      // null = unlimited
      
      // AI Credits
      planAiCredits: planLimits.aiCredits || 0,
      additionalAiCredits,
    },
    usage: {
      members: account._count.members,
      sites: account._count.sites,
      aiCreditsBalance: account.aiCreditsBalance,
      aiCreditsUsedTotal: account.aiCreditsUsedTotal,
      
      // Add-on counts
      seatAddOnsCount: addOnPurchases.filter(p => p.addOn.type === 'SEATS').reduce((sum, p) => sum + (p.quantity || 1), 0),
      siteAddOnsCount: addOnPurchases.filter(p => p.addOn.type === 'SITES').reduce((sum, p) => sum + (p.quantity || 1), 0),
    },
    addOnPurchases,
  };
}

/**
 * Check if an account can add more members (seats)
 * @param {string} accountId - The account ID
 * @returns {Promise<{allowed: boolean, reason?: string}>}
 */
export async function canAddMember(accountId) {
  const resources = await getAccountResourceLimits(accountId);
  
  if (!resources.hasSubscription) {
    return { allowed: false, reason: 'No active subscription' };
  }
  
  // null means unlimited
  if (resources.limits.maxMembers !== null && resources.usage.members >= resources.limits.maxMembers) {
    return { 
      allowed: false, 
      reason: 'Seat limit reached. Purchase additional seats to add more members.',
    };
  }
  
  return { allowed: true };
}

/**
 * Check if an account can add more sites (websites)
 * @param {string} accountId - The account ID
 * @returns {Promise<{allowed: boolean, reason?: string}>}
 */
export async function canAddSite(accountId) {
  const resources = await getAccountResourceLimits(accountId);
  
  if (!resources.hasSubscription) {
    return { allowed: false, reason: 'No active subscription' };
  }
  
  // null means unlimited
  if (resources.limits.maxSites !== null && resources.usage.sites >= resources.limits.maxSites) {
    return { 
      allowed: false, 
      reason: 'Website limit reached. Purchase additional websites to connect more sites.',
    };
  }
  
  return { allowed: true };
}

/**
 * Check if an account can purchase a specific add-on type
 * @param {string} accountId - The account ID
 * @param {string} addOnType - Type of add-on (SEATS, SITES, AI_CREDITS, etc.)
 * @param {number} quantity - How many to purchase
 * @returns {Promise<{allowed: boolean, reason?: string}>}
 */
export async function canPurchaseAddOn(accountId, addOnType, quantity = 1) {
  const resources = await getAccountResourceLimits(accountId);
  
  if (!resources.hasSubscription) {
    return { allowed: false, reason: 'No active subscription' };
  }
  
  // AI Credits are unlimited
  if (addOnType === 'AI_CREDITS') {
    return { allowed: true };
  }
  
  // Check seat add-on limits
  if (addOnType === 'SEATS') {
    const maxAddOnSeats = resources.limits.maxAddOnSeats;
    if (maxAddOnSeats !== null) {
      const currentAddOnSeats = resources.usage.seatAddOnsCount;
      if (currentAddOnSeats + quantity > maxAddOnSeats) {
        return {
          allowed: false,
          reason: `Your plan allows a maximum of ${maxAddOnSeats} additional seats via add-ons. You have ${currentAddOnSeats}.`,
        };
      }
    }
  }
  
  // Check site add-on limits
  if (addOnType === 'SITES') {
    const maxAddOnSites = resources.limits.maxAddOnSites;
    if (maxAddOnSites !== null) {
      const currentAddOnSites = resources.usage.siteAddOnsCount;
      if (currentAddOnSites + quantity > maxAddOnSites) {
        return {
          allowed: false,
          reason: `Your plan allows a maximum of ${maxAddOnSites} additional websites via add-ons. You have ${currentAddOnSites}.`,
        };
      }
    }
  }
  
  return { allowed: true };
}

/**
 * Deduct AI credits from an account
 * @param {string} accountId - The account ID
 * @param {number} amount - Amount of credits to deduct
 * @param {object} options - Additional options (userId, siteId, source, description)
 * @returns {Promise<{success: boolean, balance?: number, error?: string}>}
 */
export async function deductAiCredits(accountId, amount, options = {}) {
  const { userId, siteId, source = 'usage', description } = options;
  
  // Use a transaction to ensure atomicity
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Get current balance
      const account = await tx.account.findUnique({
        where: { id: accountId },
        select: { aiCreditsBalance: true },
      });
      
      if (!account) {
        throw new Error('Account not found');
      }
      
      if (account.aiCreditsBalance < amount) {
        throw new Error('Insufficient AI credits');
      }
      
      const newBalance = account.aiCreditsBalance - amount;
      
      // Update balance
      await tx.account.update({
        where: { id: accountId },
        data: {
          aiCreditsBalance: newBalance,
          aiCreditsUsedTotal: { increment: amount },
        },
      });
      
      // Log the transaction
      await tx.aiCreditsLog.create({
        data: {
          accountId,
          userId,
          siteId,
          type: 'DEBIT',
          amount,
          balance: newBalance,
          source,
          description,
        },
      });
      
      return { success: true, balance: newBalance };
    });
    
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Add AI credits to an account
 * @param {string} accountId - The account ID
 * @param {number} amount - Amount of credits to add
 * @param {object} options - Additional options (source, sourceId, description)
 * @returns {Promise<{success: boolean, balance?: number, error?: string}>}
 */
export async function addAiCredits(accountId, amount, options = {}) {
  const { source = 'manual', sourceId, description } = options;
  
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Update balance
      const account = await tx.account.update({
        where: { id: accountId },
        data: {
          aiCreditsBalance: { increment: amount },
        },
        select: { aiCreditsBalance: true },
      });
      
      // Log the transaction
      await tx.aiCreditsLog.create({
        data: {
          accountId,
          type: 'CREDIT',
          amount,
          balance: account.aiCreditsBalance,
          source,
          sourceId,
          description,
        },
      });
      
      return { success: true, balance: account.aiCreditsBalance };
    });
    
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Validate that a user can create a new account (register as owner)
 * @param {string} userId - The user ID
 * @returns {Promise<{allowed: boolean, reason?: string}>}
 */
export async function canCreateAccount(userId) {
  if (!userId) {
    return { allowed: true }; // New user registration
  }
  
  const isOwner = await isUserAlreadyOwner(userId);
  
  if (isOwner) {
    return {
      allowed: false,
      reason: 'You already own an account. Users can only be owner of one company account.',
    };
  }
  
  return { allowed: true };
}

/**
 * Get all AI credits packs available for purchase
 * @returns {Promise<Array>} - Available AI credits add-ons
 */
export async function getAiCreditsPacks() {
  return prisma.addOn.findMany({
    where: {
      type: 'AI_CREDITS',
      isActive: true,
    },
    orderBy: { quantity: 'asc' },
    include: {
      translations: true,
    },
  });
}
