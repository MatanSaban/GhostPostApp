'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

export function normaliseSiteUrl(url) {
  if (!url) return '';
  return url.startsWith('http') ? url : 'https://' + url;
}

export function buildIframeSrc(siteUrl, path) {
  const base = normaliseSiteUrl(siteUrl).replace(/\/+$/, '');
  const p = path || '/';
  const sep = p.includes('?') ? '&' : '?';
  return base + p + sep + 'gp_editor=true';
}

export function extractOrigin(url) {
  try { return new URL(normaliseSiteUrl(url)).origin; } catch { return ''; }
}

export function usePreviewBridge({ siteUrl, iframeRef, enabled = true, bridgeTimeoutMs = 8000 }) {
  const [iframeReady, setIframeReady] = useState(false);
  const [currentPreviewUrl, setCurrentPreviewUrl] = useState('/');
  const [selectedElement, setSelectedElement] = useState(null);
  const [hoveredElement, setHoveredElement] = useState(null);
  const [inspectorEnabled, setInspectorEnabled] = useState(true);
  // 'idle' | 'connecting' | 'ready' | 'bridge_timeout'
  const [connectionState, setConnectionState] = useState('idle');
  const bridgeTimerRef = useRef(null);

  const expectedOrigin = extractOrigin(siteUrl);
  const expectedOriginRef = useRef(expectedOrigin);
  useEffect(() => { expectedOriginRef.current = expectedOrigin; }, [expectedOrigin]);

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
    const origin = expectedOriginRef.current;
    if (origin && event.origin !== origin) return;

    const data = event.data;
    if (!data || !data._gp) return;

    switch (data.type) {
      case 'GP_BRIDGE_READY':
        setIframeReady(true);
        setConnectionState('ready');
        clearBridgeTimer();
        if (data.url) setCurrentPreviewUrl(data.url);
        break;
      case 'GP_URL_CHANGED':
        setCurrentPreviewUrl(data.url);
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
        });
        break;
      case 'GP_ELEMENT_HOVER':
        setHoveredElement({ tag: data.tag, text: data.text, selector: data.selector });
        break;
      case 'GP_ELEMENT_HOVER_OUT':
        setHoveredElement(null);
        break;
    }
  }, [clearBridgeTimer]);

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

  const clearSelection = useCallback(() => setSelectedElement(null), []);

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
    const nextSrc = buildIframeSrc(siteUrl, path || '/');
    setIframeReady(false);
    startBridgeTimer();
    el.src = nextSrc;
  }, [iframeRef, siteUrl, startBridgeTimer]);

  return {
    iframeReady,
    currentPreviewUrl,
    selectedElement,
    hoveredElement,
    inspectorEnabled,
    connectionState,
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
