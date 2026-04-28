'use client';

import { useMemo } from 'react';
import { useSite } from '@/app/context/site-context';
import { capabilitiesFor } from '@/lib/cms/capabilities';

/**
 * Returns the capability flags for the currently selected site.
 *
 * UI components gate feature visibility with these flags instead of
 * hard-checking `site.platform === 'wordpress'`, so adding a new platform
 * never requires touching the gating call sites.
 *
 *     const caps = useCapabilities();
 *     if (!caps.supportsPlugin) return null;
 *
 * Falls back to WordPress capabilities when no site is selected - that's the
 * historical default and keeps legacy UI rendering during initial load.
 */
export function useCapabilities() {
  const { selectedSite } = useSite();
  return useMemo(
    () => capabilitiesFor(selectedSite?.platform),
    [selectedSite?.platform],
  );
}
