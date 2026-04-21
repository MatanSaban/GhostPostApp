'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

export function normaliseSiteUrl(url) {
  if (!url) return '';
  return url.startsWith('http') ? url : 'https://' + url;
}

/**
 * Build the iframe URL for the editor preview.
 * - When `signedParams` is provided, the URL carries `gp_editor=1` plus the
 *   HMAC-signed `gp_origin` / `gp_exp` / `gp_sig` triple the plugin verifies.
 * - Without signed params, falls back to the legacy `gp_editor=true` flag
 *   which the plugin only accepts when the Referer matches its baked
 *   platform URL (kept for backwards compatibility while older plugin
 *   versions are still deployed).
 */
export function buildIframeSrc(siteUrl, path, signedParams) {
  const base = normaliseSiteUrl(siteUrl).replace(/\/+$/, '');
  const p = path || '/';
  const sep = p.includes('?') ? '&' : '?';
  const params = new URLSearchParams();
  if (signedParams && signedParams.sig) {
    params.set('gp_editor', '1');
    params.set('gp_origin', signedParams.origin);
    params.set('gp_exp', String(signedParams.exp));
    params.set('gp_sig', signedParams.sig);
  } else {
    params.set('gp_editor', 'true');
  }
  return base + p + sep + params.toString();
}

export function extractOrigin(url) {
  try { return new URL(normaliseSiteUrl(url)).origin; } catch { return ''; }
}

export function usePreviewBridge({ siteUrl, siteId, iframeRef, enabled = true, bridgeTimeoutMs = 8000 }) {
  const [iframeReady, setIframeReady] = useState(false);
  const [currentPreviewUrl, setCurrentPreviewUrl] = useState('/');
  const [selectedElement, setSelectedElement] = useState(null);
  const [hoveredElement, setHoveredElement] = useState(null);
  const [inspectorEnabled, setInspectorEnabled] = useState(true);
  // 'idle' | 'connecting' | 'ready' | 'bridge_timeout'
  const [connectionState, setConnectionState] = useState('idle');
  // Signed preview token: { sig, exp, origin } | null
  const [signedToken, setSignedToken] = useState(null);
  // 'idle' | 'loading' | 'ready' | 'error'
  const [tokenState, setTokenState] = useState('idle');
  const bridgeTimerRef = useRef(null);

  const expectedOrigin = extractOrigin(siteUrl);
  const expectedOriginRef = useRef(expectedOrigin);
  useEffect(() => { expectedOriginRef.current = expectedOrigin; }, [expectedOrigin]);

  // Fetch a signed preview token when enabled + siteId is known.
  // The token lets the plugin trust iframe-embed requests from any platform
  // origin (dev localhost, staging, production) without a Referer allowlist.
  useEffect(() => {
    if (!enabled || !siteId) {
      setSignedToken(null);
      setTokenState('idle');
      return;
    }
    let cancelled = false;
    setTokenState('loading');
    fetch(`/api/sites/${siteId}/preview-token`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`preview-token ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setSignedToken(data);
        setTokenState('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[PreviewBridge] failed to fetch preview token:', err);
        setSignedToken(null);
        setTokenState('error');
      });
    return () => { cancelled = true; };
  }, [enabled, siteId]);

  const clearBridgeTimer = useCallback(() => {
    if (bridgeTimerRef.current) {
      clearTimeout(bridgeTimerRef.current);
      bridgeTimerRef.current = null;
    }
  }, []);

  const startBridgeTimer = useCallback(() => {
    clearBridgeTimer();
    setConnectionState('connecting');
    bridgeTimerRef.current = setTimeout(() => {
      setConnectionState((state) => (state === 'ready' ? state : 'bridge_timeout'));
    }, bridgeTimeoutMs);
  }, [bridgeTimeoutMs, clearBridgeTimer]);

  const handleMessage = useCallback((event) => {
    // Trust messages that came from our own iframe's contentWindow regardless
    // of origin - this handles apex↔www redirects where the post-redirect
    // origin legitimately differs from the configured site URL.
    const iframeWindow = iframeRef?.current?.contentWindow;
    const fromOurIframe = iframeWindow && event.source === iframeWindow;
    if (!fromOurIframe) {
      const origin = expectedOriginRef.current;
      if (origin && event.origin !== origin) return;
    }

    const data = event.data;
    if (!data || !data._gp) return;

    switch (data.type) {
      case 'GP_BRIDGE_READY':
        setIframeReady(true);
        setConnectionState('ready');
        clearBridgeTimer();
        if (data.url) setCurrentPreviewUrl(data.url);
        // After a navigation the bridge script re-runs and defaults its
        // internal inspectorEnabled to true; the platform's stored state
        // stays as-is. Force both back to enabled so the toolbar icon, the
        // iframe overlay, and the bridge stay in sync - matches the "click
        // a link → inspect becomes active" UX the popup advertises.
        setInspectorEnabled(true);
        break;
      case 'GP_URL_CHANGED':
        setCurrentPreviewUrl(data.url);
        break;
      case 'GP_LINK_NAVIGATING':
        // Bridge is about to reload for a link nav - pre-update the URL
        // pill and flip inspector back on so the icon matches the state
        // the new page will boot into.
        if (data.url) setCurrentPreviewUrl(data.url);
        setInspectorEnabled(true);
        break;
      case 'GP_ELEMENT_SELECTED':
        setSelectedElement({
          tag: data.tag,
          text: data.text,
          selector: data.selector,
          src: data.src,
          alt: data.alt,
          href: data.href,
          elementorWidget: data.elementorWidget,
          elementorId: data.elementorId || null,
          elementorAncestors: Array.isArray(data.elementorAncestors) ? data.elementorAncestors : null,
          outerHTML: data.outerHTML,
          screenshot: null,
        });
        break;
      case 'GP_ELEMENT_SCREENSHOT':
        setSelectedElement((prev) => {
          if (!prev || prev.selector !== data.selector) return prev;
          return { ...prev, screenshot: data.screenshot };
        });
        break;
      case 'GP_ELEMENT_HOVER':
        setHoveredElement({ tag: data.tag, text: data.text, selector: data.selector });
        break;
      case 'GP_ELEMENT_HOVER_OUT':
        setHoveredElement(null);
        break;
    }
  }, [iframeRef, clearBridgeTimer]);

  useEffect(() => {
    if (!enabled) {
      clearBridgeTimer();
      setConnectionState('idle');
      setIframeReady(false);
      return;
    }
    window.addEventListener('message', handleMessage);
    startBridgeTimer();
    return () => {
      window.removeEventListener('message', handleMessage);
      clearBridgeTimer();
    };
  }, [enabled, handleMessage, startBridgeTimer, clearBridgeTimer]);

  const buildSrc = useCallback((path) => {
    if (!siteUrl) return '';
    // If a siteId was supplied, the caller expects signed URLs - wait for the
    // token before emitting a src (prevents the plugin from rejecting an
    // unsigned request while the token is still in flight).
    if (siteId) {
      if (!signedToken) return '';
      return buildIframeSrc(siteUrl, path, signedToken);
    }
    // Legacy unsigned path (old callers that haven't opted into signed mode)
    return buildIframeSrc(siteUrl, path);
  }, [siteUrl, siteId, signedToken]);

  const iframeSrc = buildSrc('/');

  const postToIframe = useCallback((type, payload) => {
    const target = iframeRef?.current?.contentWindow;
    if (!target) return;
    target.postMessage(Object.assign({ type }, payload), expectedOriginRef.current || '*');
  }, [iframeRef]);

  const toggleInspector = useCallback(() => {
    setInspectorEnabled((prev) => {
      const next = !prev;
      const target = iframeRef?.current?.contentWindow;
      if (target) {
        target.postMessage(
          { type: 'GP_SET_INSPECTOR_ENABLED', enabled: next },
          expectedOriginRef.current || '*',
        );
      }
      return next;
    });
  }, [iframeRef]);

  const sendPreview = useCallback((selector, changes) => {
    postToIframe('GP_PREVIEW_CHANGE', Object.assign({ selector }, changes));
  }, [postToIframe]);

  const resetPreviews = useCallback(() => {
    postToIframe('GP_PREVIEW_RESET');
  }, [postToIframe]);

  const highlightElement = useCallback((selector) => {
    postToIframe('GP_HIGHLIGHT_ELEMENT', { selector });
  }, [postToIframe]);

  const clearSelection = useCallback(() => {
    setSelectedElement(null);
    postToIframe('GP_CLEAR_SELECTION');
  }, [postToIframe]);

  const reloadIframe = useCallback(() => {
    const el = iframeRef?.current;
    if (!el) return;
    setIframeReady(false);
    startBridgeTimer();
    try { el.contentWindow?.location?.reload(); }
    catch { el.src = el.src; }
  }, [iframeRef, startBridgeTimer]);

  const navigateIframe = useCallback((path) => {
    const el = iframeRef?.current;
    if (!el) return;
    const nextSrc = buildSrc(path || '/');
    if (!nextSrc) return;
    setIframeReady(false);
    startBridgeTimer();
    el.src = nextSrc;
  }, [iframeRef, buildSrc, startBridgeTimer]);

  return {
    iframeReady,
    currentPreviewUrl,
    selectedElement,
    hoveredElement,
    inspectorEnabled,
    connectionState,
    tokenState,
    iframeSrc,
    buildSrc,
    expectedOrigin,
    postToIframe,
    toggleInspector,
    sendPreview,
    resetPreviews,
    highlightElement,
    clearSelection,
    reloadIframe,
    navigateIframe,
    setIframeReady,
  };
}
