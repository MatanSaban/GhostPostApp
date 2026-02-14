'use client';

import { useCallback } from 'react';
import { useUser } from '@/app/context/user-context';
import { emitCreditsUpdated } from '@/app/context/user-context';
import { handleLimitError } from '@/app/context/limit-guard-context';

/**
 * Hook for making API calls that may consume AI credits
 * Automatically updates the credits UI when credits are consumed
 * 
 * @example
 * const { fetchWithCredits } = useAICredits();
 * 
 * const result = await fetchWithCredits('/api/competitors/scan', {
 *   method: 'POST',
 *   body: JSON.stringify({ competitorId, siteId, includeAI: true }),
 * });
 */
export function useAICredits() {
  const { user, refreshCredits } = useUser();

  /**
   * Fetch wrapper that checks for creditsUpdated in response
   * and updates the UI accordingly
   */
  const fetchWithCredits = useCallback(async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await response.json();

    // Auto-detect limit / insufficient-credits errors from API
    if (!response.ok && handleLimitError(data)) {
      return { ok: false, status: response.status, data, limitError: true };
    }

    // Check if the response includes updated credits info
    if (data.creditsUpdated && data.creditsUpdated.used !== undefined) {
      // Emit event with the new credits value
      emitCreditsUpdated(data.creditsUpdated.used);
    }

    // Return both the response status info and the data
    return {
      ok: response.ok,
      status: response.status,
      data,
    };
  }, []);

  /**
   * Get current credits info
   */
  const getCreditsInfo = useCallback(() => {
    if (!user) return { used: 0, limit: 0, remaining: 0 };
    
    const used = user.aiCreditsUsed || 0;
    const limit = user.subscription?.plan?.limitations?.find(l => l.key === 'aiCredits')?.value || 0;
    const remaining = Math.max(0, limit - used);
    
    return { used, limit, remaining };
  }, [user]);

  return {
    fetchWithCredits,
    refreshCredits,
    getCreditsInfo,
    emitCreditsUpdated,
  };
}

export default useAICredits;
