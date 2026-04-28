'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Shared hook driving the discover + entity-type selection sub-step that
 * appears in BOTH the registration chat and the site-profile chat.
 *
 * Two context modes:
 *
 *   { type: 'tempReg' }
 *     - Used during onboarding before any Site exists. Reads/writes via
 *       /api/auth/registration/entities/{scan,select}. Results are stashed
 *       on Account.draftInterviewData.entityScan and migrated to the real
 *       Site at finalize.
 *
 *   { type: 'site', siteId }
 *     - Used inside the site-profile interview wizard. Reads existing entity
 *       types via /api/entities/types and runs sitemap-based discover via
 *       /api/entities/scan. If the site already has enabled types, the hook
 *       returns COMPLETED on initial load so the panel can skip silently.
 *
 * Status lifecycle: IDLE -> SCANNING -> COMPLETED | EMPTY | FAILED
 *
 * The chat fires `triggerScan()` as soon as URL+language are confirmed, then
 * later calls `awaitScan(10000)` when the user reaches the selection panel.
 * `awaitScan` resolves with the final status, racing the in-flight POST
 * against the timeout - if the timeout fires first the chat skips the panel
 * silently.
 */

/**
 * Per-context endpoint configuration. Each context exposes the same shape:
 *
 *   getInitial: () => fetch existing scan/types from server (idempotent read)
 *   doScan: (body) => trigger discover + entity-type detection
 *   doSelect: (slugs) => persist user's type selection
 *
 * This indirection is what lets the same hook drive both onboarding (no Site
 * yet - results stash on draftInterviewData) and the dashboard / site-profile
 * (Site exists - results land in SiteEntityType rows).
 */
const CONTEXT_ADAPTERS = {
  tempReg: () => ({
    async getInitial() {
      const res = await fetch('/api/auth/registration/entities/scan', { method: 'GET' });
      if (!res.ok) return null;
      const data = await res.json();
      return data?.entityScan || null;
    },
    async doScan({ url, language }) {
      const res = await fetch('/api/auth/registration/entities/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, language }),
      });
      const data = await res.json();
      return data?.entityScan || data;
    },
    async doSelect(selectedSlugs) {
      const res = await fetch('/api/auth/registration/entities/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedSlugs }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save selection');
      }
      return await res.json();
    },
  }),
  site: ({ siteId }) => ({
    async getInitial() {
      // Treat the site as "already discovered" if it has any enabled entity
      // types. This lets the panel skip silently in the InterviewWizard for
      // sites that already have entities populated - onSkip fires immediately
      // and the chat moves on without showing the panel.
      if (!siteId) return null;
      const res = await fetch(`/api/entities/types?siteId=${siteId}`);
      if (!res.ok) return null;
      const data = await res.json();
      const existingTypes = (data?.types || []).filter(t => t.isEnabled);
      if (existingTypes.length === 0) return null;
      return {
        status: 'COMPLETED',
        url: null,
        entityTypes: existingTypes.map(t => ({
          slug: t.slug,
          name: t.name,
          nameHe: t.labels?.he || null,
          apiEndpoint: t.apiEndpoint,
          isCore: ['posts', 'pages'].includes(t.slug),
          entityCount: t.entityCount || 0,
        })),
        selectedSlugs: existingTypes.map(t => t.slug),
        source: { existingTypes: true },
      };
    },
    async doScan() {
      // Sitemap-based discover via the existing dashboard endpoint.
      const res = await fetch(`/api/entities/scan?siteId=${siteId}`);
      const data = await res.json();
      if (!data.success) {
        return { status: 'FAILED', error: data.error || 'Discover failed' };
      }
      const entityTypes = data.postTypes || [];
      const hasEntities = entityTypes.some(t => (t.entityCount || 0) > 0);
      const status = entityTypes.length > 0 || hasEntities ? 'COMPLETED' : 'EMPTY';
      return {
        status,
        url: data.source?.siteUrl || null,
        entityTypes,
        selectedSlugs: entityTypes
          .filter(t => t.isCore || (t.entityCount || 0) > 0)
          .map(t => t.slug),
        source: data.source || null,
      };
    },
    async doSelect(selectedSlugs) {
      // Save the type selection to the existing dashboard endpoint. Caller
      // decides whether/how to kick off populate afterwards - that is
      // outside the scope of this hook.
      const types = selectedSlugs.map(slug => ({
        slug,
        name: slug, // server merges with existing if name is generic
        isEnabled: true,
      }));
      const res = await fetch('/api/entities/types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId, types }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save types');
      }
      return await res.json();
    },
  }),
};

function buildAdapter(context) {
  const factory = CONTEXT_ADAPTERS[context?.type];
  if (!factory) {
    throw new Error(`useEntitiesScan: unsupported context type "${context?.type}"`);
  }
  return factory(context);
}

const TERMINAL_STATUSES = new Set(['COMPLETED', 'EMPTY', 'FAILED']);

// Mirrors server-side normalization in /api/auth/registration/entities/scan
// so client-side URL comparisons (for "did the URL change since last scan?")
// match what the server stored.
function normalizeScanUrl(url) {
  if (!url) return null;
  let u = url.trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u.replace(/\/+$/, '');
}

export function useEntitiesScan(context) {
  // Memoize the adapter so it doesn't churn on every render when callers
  // pass `{ type: 'site', siteId }` literally as a prop. Re-creating the
  // adapter would invalidate triggerScan's useCallback deps and cause the
  // mount effect to refire.
  const adapterRef = useRef(null);
  const contextKey = `${context?.type}:${context?.siteId || ''}`;
  const lastContextKeyRef = useRef(null);
  if (lastContextKeyRef.current !== contextKey) {
    adapterRef.current = buildAdapter(context);
    lastContextKeyRef.current = contextKey;
  }
  const adapter = adapterRef.current;

  const [status, setStatus] = useState('IDLE');
  const [entityTypes, setEntityTypes] = useState([]);
  const [selectedSlugs, setSelectedSlugs] = useState([]);
  const [error, setError] = useState(null);
  const [source, setSource] = useState(null);

  // The in-flight POST promise. awaitScan races this against the timeout
  // instead of polling - saves an HTTP round-trip and is more responsive.
  const inFlightRef = useRef(null);
  // Latest status, readable from non-React callbacks (awaitScan resolvers).
  const statusRef = useRef('IDLE');
  useEffect(() => { statusRef.current = status; }, [status]);
  // The URL the most-recent terminal scan was for. Lets triggerScan
  // distinguish "redundant call for same URL" (short-circuit OK) from
  // "URL changed, re-scan needed" (must re-fire).
  const lastScanUrlRef = useRef(null);

  // Pull the persisted scan state on mount. If a scan was already kicked off
  // in a previous render (or even a previous page load - the result lives on
  // Account.draftInterviewData for tempReg, or SiteEntityType rows for site),
  // surface it immediately so the panel doesn't re-trigger work that already
  // finished.
  useEffect(() => {
    let cancelled = false;
    async function loadInitialState() {
      try {
        const scan = await adapter.getInitial();
        if (cancelled || !scan) return;
        setStatus(scan.status || 'IDLE');
        setEntityTypes(scan.entityTypes || []);
        setSelectedSlugs(scan.selectedSlugs || []);
        setSource(scan.source || null);
        if (scan.error) setError(scan.error);
        if (scan.url) lastScanUrlRef.current = scan.url;
      } catch (e) {
        // Fail silently - the chat treats a missing scan as IDLE and the
        // user can still proceed without entities. Logging is enough.
        console.warn('[useEntitiesScan] Initial state fetch failed:', e);
      }
    }
    loadInitialState();
    return () => { cancelled = true; };
  }, [contextKey]); // re-run when the bound context (account/site) changes

  /**
   * Fire the scan. Does not await - the chat continues immediately so the
   * scan runs in parallel with the rest of the interview.
   *
   * Short-circuits in two cases:
   *   - Already SCANNING - return the in-flight promise.
   *   - Already terminal AND for the same URL - return cached terminal
   *     status without re-firing. If the URL changed, fall through and
   *     re-scan; the server tracks URLs separately and would otherwise
   *     reuse stale results from the previous URL.
   */
  const triggerScan = useCallback(({ url, language } = {}) => {
    if (statusRef.current === 'SCANNING') {
      return inFlightRef.current;
    }

    const normalizedUrl = normalizeScanUrl(url);
    const sameUrl = normalizedUrl && lastScanUrlRef.current === normalizedUrl;

    if (TERMINAL_STATUSES.has(statusRef.current) && sameUrl) {
      return Promise.resolve(statusRef.current);
    }

    setStatus('SCANNING');
    setError(null);
    setEntityTypes([]);
    setSelectedSlugs([]);
    lastScanUrlRef.current = normalizedUrl;

    const promise = (async () => {
      try {
        const scan = await adapter.doScan({ url, language });
        const finalStatus = scan?.status || 'FAILED';

        setStatus(finalStatus);
        if (scan?.entityTypes) setEntityTypes(scan.entityTypes);
        if (scan?.selectedSlugs) setSelectedSlugs(scan.selectedSlugs);
        if (scan?.source) setSource(scan.source);
        if (scan?.error) setError(scan.error);

        return finalStatus;
      } catch (e) {
        console.error('[useEntitiesScan] Scan failed:', e);
        setStatus('FAILED');
        setError(e.message || 'Scan failed');
        return 'FAILED';
      } finally {
        inFlightRef.current = null;
      }
    })();

    inFlightRef.current = promise;
    return promise;
  }, [contextKey]);

  /**
   * Resolves with the final status. If the scan is already terminal (or
   * never started), resolves immediately. Otherwise races the in-flight POST
   * against `timeoutMs`; on timeout, resolves with 'TIMEOUT' so the caller
   * can decide whether to show a skip UI or just proceed.
   */
  const awaitScan = useCallback(async (timeoutMs = 10000) => {
    if (TERMINAL_STATUSES.has(statusRef.current)) {
      return statusRef.current;
    }
    if (!inFlightRef.current) {
      // No scan was ever fired. Treat as a soft skip - caller decides.
      return 'IDLE';
    }

    const timer = new Promise(resolve => setTimeout(() => resolve('TIMEOUT'), timeoutMs));
    return Promise.race([inFlightRef.current, timer]);
  }, []);

  const toggleSlug = useCallback((slug) => {
    setSelectedSlugs(prev =>
      prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]
    );
  }, []);

  /**
   * Persist the user's type selection. The actual entity rows are created
   * later (at finalize for tempReg, by the existing populate flow for site).
   */
  const saveSelection = useCallback(async (slugsOverride) => {
    const slugs = slugsOverride ?? selectedSlugs;
    try {
      await adapter.doSelect(slugs);
      return true;
    } catch (e) {
      console.error('[useEntitiesScan] Save selection failed:', e);
      setError(e.message);
      return false;
    }
  }, [contextKey, selectedSlugs]);

  return {
    status,
    entityTypes,
    selectedSlugs,
    error,
    source,
    isScanning: status === 'SCANNING',
    isReady: TERMINAL_STATUSES.has(status),
    hasResults: status === 'COMPLETED' && entityTypes.length > 0,
    triggerScan,
    awaitScan,
    toggleSlug,
    saveSelection,
  };
}
