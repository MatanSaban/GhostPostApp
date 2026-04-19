'use client';

import { useState, useEffect, useCallback } from 'react';

let globalPricingCache = null;
let globalCacheTimestamp = 0;
const CLIENT_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Client-side hook that fetches AI feature pricing from the API.
 * Includes a global in-memory cache so multiple components share the same data.
 * 
 * Usage:
 *   const { pricing, getCreditCost, isLoading } = useAiPricing();
 *   const cost = getCreditCost('GENERATE_ARTICLE'); // 100
 * 
 * @returns {{ pricing: Record<string, { creditCost: number, displayName: string }>, getCreditCost: (key: string, fallback?: number) => number, isLoading: boolean }}
 */
export function useAiPricing() {
  const [pricing, setPricing] = useState(globalPricingCache || {});
  const [isLoading, setIsLoading] = useState(!globalPricingCache);

  const fetchPricing = useCallback(async () => {
    const now = Date.now();
    if (globalPricingCache && now - globalCacheTimestamp < CLIENT_CACHE_TTL_MS) {
      setPricing(globalPricingCache);
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/ai-pricing');
      if (!res.ok) throw new Error('Failed to fetch pricing');
      const data = await res.json();
      globalPricingCache = data;
      globalCacheTimestamp = Date.now();
      setPricing(data);
    } catch (err) {
      console.error('[useAiPricing] Error fetching pricing:', err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPricing();
  }, [fetchPricing]);

  const getCreditCost = useCallback(
    (featureKey, fallback = 0) => {
      return pricing[featureKey]?.creditCost ?? fallback;
    },
    [pricing]
  );

  return { pricing, getCreditCost, isLoading };
}

/**
 * Invalidate the client-side pricing cache.
 * Call this after a SuperAdmin updates prices.
 */
export function invalidateAiPricingCache() {
  globalPricingCache = null;
  globalCacheTimestamp = 0;
}
