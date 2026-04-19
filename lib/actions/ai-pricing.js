'use server';

import prisma from '@/lib/prisma';
import { getCurrentAccountMember } from '@/lib/auth-permissions';

// ==========================================
// In-memory cache for AI feature pricing
// ==========================================
let pricingCache = null;
let pricingCacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute

/**
 * Fetch all AI feature prices.
 * Uses a short-lived in-memory cache to avoid DB hits on every render.
 * @returns {Promise<Record<string, { id: string, featureKey: string, displayName: string, creditCost: number }>>}
 */
export async function getAiPricing() {
  const now = Date.now();
  if (pricingCache && now - pricingCacheTimestamp < CACHE_TTL_MS) {
    return pricingCache;
  }

  const rows = await prisma.aiFeaturePricing.findMany();
  const map = {};
  for (const row of rows) {
    map[row.featureKey] = {
      id: row.id,
      featureKey: row.featureKey,
      displayName: row.displayName,
      creditCost: row.creditCost,
    };
  }

  pricingCache = map;
  pricingCacheTimestamp = now;
  return map;
}

/**
 * Get credit cost for a specific feature key.
 * Falls back to the hardcoded value in AI_OPERATIONS if not found in DB.
 * @param {string} featureKey
 * @returns {Promise<number>}
 */
export async function getFeatureCreditCost(featureKey) {
  const pricing = await getAiPricing();
  if (pricing[featureKey]) {
    return pricing[featureKey].creditCost;
  }
  // Fallback: import hardcoded config
  const { getOperationConfig } = await import('@/lib/ai/credits.js');
  return getOperationConfig(featureKey).credits;
}

/**
 * Get all pricing rows as an array (for the admin UI).
 * @returns {Promise<Array>}
 */
export async function getAiPricingList() {
  const { isSuperAdmin } = await getCurrentAccountMember();
  if (!isSuperAdmin) {
    return { error: 'Unauthorized' };
  }
  const rows = await prisma.aiFeaturePricing.findMany({
    orderBy: { featureKey: 'asc' },
  });
  return rows.map((r) => ({
    id: r.id,
    featureKey: r.featureKey,
    displayName: r.displayName,
    creditCost: r.creditCost,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

/**
 * Update the credit cost for a specific AI feature.
 * Restricted to SUPERADMIN users only.
 * Invalidates the in-memory cache after update.
 * @param {string} featureId - The document ID
 * @param {number} newCost - New credit cost (must be >= 0)
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function updateAiFeaturePrice(featureId, newCost) {
  const { isSuperAdmin } = await getCurrentAccountMember();
  if (!isSuperAdmin) {
    return { success: false, error: 'Unauthorized: SuperAdmin access required' };
  }

  if (typeof newCost !== 'number' || newCost < 0 || !Number.isInteger(newCost)) {
    return { success: false, error: 'Invalid cost: must be a non-negative integer' };
  }

  try {
    await prisma.aiFeaturePricing.update({
      where: { id: featureId },
      data: { creditCost: newCost },
    });

    // Invalidate cache
    pricingCache = null;
    pricingCacheTimestamp = 0;

    return { success: true };
  } catch (error) {
    console.error('[updateAiFeaturePrice] Error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Bulk-update multiple feature prices at once.
 * Restricted to SUPERADMIN users only.
 * @param {Array<{ id: string, creditCost: number }>} updates
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function bulkUpdateAiFeaturePrices(updates) {
  const { isSuperAdmin } = await getCurrentAccountMember();
  if (!isSuperAdmin) {
    return { success: false, error: 'Unauthorized: SuperAdmin access required' };
  }

  if (!Array.isArray(updates) || updates.length === 0) {
    return { success: false, error: 'No updates provided' };
  }

  for (const u of updates) {
    if (typeof u.creditCost !== 'number' || u.creditCost < 0 || !Number.isInteger(u.creditCost)) {
      return { success: false, error: `Invalid cost for ${u.id}: must be a non-negative integer` };
    }
  }

  try {
    // MongoDB doesn't support multi-model transactions, so update sequentially
    for (const { id, creditCost } of updates) {
      await prisma.aiFeaturePricing.update({
        where: { id },
        data: { creditCost },
      });
    }

    // Invalidate cache
    pricingCache = null;
    pricingCacheTimestamp = 0;

    return { success: true };
  } catch (error) {
    console.error('[bulkUpdateAiFeaturePrices] Error:', error.message);
    return { success: false, error: error.message };
  }
}
