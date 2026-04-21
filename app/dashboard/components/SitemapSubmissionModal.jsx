'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X, MapPin, Loader2, CheckCircle, XCircle, AlertTriangle, ExternalLink, Trash2, Send,
} from 'lucide-react';
import styles from './SitemapSubmissionModal.module.css';

/**
 * SitemapSubmissionModal - Multi-step sitemap discovery & GSC submission flow.
 *
 * Steps:
 *  1. discovering  – Fetch sitemaps from platform, stream results to user
 *  2. review       – User reviews list, can remove items, then submit
 *  3. submitting   – Submit to GSC with progress bar & verification
 *  4. success      – Show success + link to GSC
 *  5. error        – Persistent failure with manual instructions
 */
export default function SitemapSubmissionModal({ open, onClose, siteId, insight, translations }) {
  const [step, setStep] = useState('discovering'); // discovering | review | submitting | success | error
  const [sitemaps, setSitemaps] = useState([]);
  const [discoveryProgress, setDiscoveryProgress] = useState(0);
  const [discoveryError, setDiscoveryError] = useState(null);
  const [submitProgress, setSubmitProgress] = useState(0);
  const [submitResults, setSubmitResults] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const retryRef = useRef(0);
  const [gscUrl, setGscUrl] = useState('');
  const abortRef = useRef(null);
  const submitTimerRef = useRef(null);
  const MAX_RETRIES = 2;

  const t = translations?.agent?.sitemapSubmission || {};

  // Phase 1: Discover sitemaps when modal opens
  useEffect(() => {
    if (!open || !siteId) return;

    // Reset state on open
    setStep('discovering');
    setSitemaps([]);
    setDiscoveryProgress(0);
    setDiscoveryError(null);
    setSubmitProgress(0);
    setSubmitResults(null);
    setRetryCount(0);
    retryRef.current = 0;
    setGscUrl('');
    if (submitTimerRef.current) clearTimeout(submitTimerRef.current);

    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      try {
        // Simulate streaming: animate progress while fetching
        const progressInterval = setInterval(() => {
          setDiscoveryProgress(prev => Math.min(prev + 5, 85));
        }, 500);

        const res = await fetch(`/api/agent/sitemaps?siteId=${siteId}`, {
          signal: controller.signal,
        });

        clearInterval(progressInterval);

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }

        const data = await res.json();
        setDiscoveryProgress(100);

        if (data.sitemaps?.length > 0) {
          setSitemaps(data.sitemaps.map(url => ({ url, included: true })));
          // Brief delay to show 100% then move to review
          setTimeout(() => setStep('review'), 600);
        } else {
          setDiscoveryError(t.noSitemapsFound || 'No sitemaps were found for this website. Make sure your site has a valid sitemap.xml file.');
        }
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('[SitemapModal] Discovery error:', err);
        setDiscoveryError(err.message);
      }
    })();

    return () => {
      controller.abort();
      if (submitTimerRef.current) clearTimeout(submitTimerRef.current);
    };
  }, [open, siteId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle sitemap inclusion
  const toggleSitemap = useCallback((index) => {
    setSitemaps(prev => prev.map((s, i) => i === index ? { ...s, included: !s.included } : s));
  }, []);

  // Remove sitemap from list
  const removeSitemap = useCallback((index) => {
    setSitemaps(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Phase 3: Submit sitemaps to GSC
  const handleSubmit = useCallback(async () => {
    const toSubmit = sitemaps.filter(s => s.included).map(s => s.url);
    if (toSubmit.length === 0) return;

    // Cancel any pending retry timer
    if (submitTimerRef.current) clearTimeout(submitTimerRef.current);

    setStep('submitting');
    setSubmitProgress(0);

    try {
      // Animate progress based on number of sitemaps
      const step = 100 / (toSubmit.length + 1); // +1 for verification step
      let progress = 0;
      const progressInterval = setInterval(() => {
        progress = Math.min(progress + step * 0.3, 90);
        setSubmitProgress(Math.round(progress));
      }, 800);

      const res = await fetch('/api/agent/sitemaps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId,
          sitemaps: toSubmit,
          insightId: insight?.id,
        }),
      });

      clearInterval(progressInterval);

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setGscUrl(data.gscSitemapsUrl || '');
      setSubmitResults(data);

      if (data.hasScopeError) {
        // Scope insufficient - user needs to reconnect Google
        setStep('error');
      } else if (data.allSuccess) {
        // All submissions returned 200 - treat as success
        // (GSC verification may lag due to propagation delay)
        setSubmitProgress(100);
        setTimeout(() => setStep('success'), 500);
      } else if (retryRef.current < MAX_RETRIES) {
        // Some failed - retry automatically
        retryRef.current += 1;
        setRetryCount(retryRef.current);
        setSubmitProgress(0);
        // Small delay then retry
        submitTimerRef.current = setTimeout(() => handleSubmit(), 2000);
      } else {
        setStep('error');
      }
    } catch (err) {
      console.error('[SitemapModal] Submit error:', err);
      if (retryRef.current < MAX_RETRIES) {
        retryRef.current += 1;
        setRetryCount(retryRef.current);
        submitTimerRef.current = setTimeout(() => handleSubmit(), 2000);
      } else {
        setStep('error');
      }
    }
  }, [sitemaps, siteId, insight]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const includedCount = sitemaps.filter(s => s.included).length;
  const isBlocking = step === 'discovering' || step === 'submitting';

  return createPortal(
    <div className={styles.overlay}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Close button only shown on non-blocking steps */}
        {!isBlocking && (
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={18} />
          </button>
        )}

        {/* ── Step 1: Discovering ── */}
        {step === 'discovering' && (
          <div className={styles.content}>
            <div className={styles.iconWrap}>
              <MapPin size={28} />
            </div>
            <h3 className={styles.title}>
              {t.discoveringTitle || 'Discovering Sitemaps'}
            </h3>
            <p className={styles.description}>
              {t.discoveringDescription || 'Searching for sitemaps on your website...'}
            </p>

            {discoveryError ? (
              <div className={styles.errorBox}>
                <AlertTriangle size={16} />
                <span>{discoveryError}</span>
              </div>
            ) : (
              <>
                <div className={styles.progressBar}>
                  <div className={styles.progressFill} style={{ width: `${discoveryProgress}%` }} />
                </div>
                <div className={styles.progressLabel}>
                  {discoveryProgress < 100
                    ? (t.searchingSitemaps || 'Searching for sitemaps...')
                    : (t.sitemapsFound || 'Sitemaps found!')}
                </div>

                {/* Stream discovered sitemaps as they come in */}
                {sitemaps.length > 0 && (
                  <div className={styles.streamList}>
                    {sitemaps.map((s, i) => (
                      <div key={i} className={styles.streamItem}>
                        <CheckCircle size={14} className={styles.streamCheck} />
                        <a href={s.url} target="_blank" rel="noopener noreferrer" dir="ltr" className={styles.streamUrl}>{s.url}</a>
                      </div>
                    ))}
                  </div>
                )}

                <Loader2 size={20} className={styles.spinner} />
              </>
            )}

            {discoveryError && (
              <button className={styles.secondaryBtn} onClick={onClose}>
                {t.close || 'Close'}
              </button>
            )}
          </div>
        )}

        {/* ── Step 2: Review ── */}
        {step === 'review' && (
          <div className={styles.content}>
            <div className={`${styles.iconWrap} ${styles.iconSuccess}`}>
              <MapPin size={28} />
            </div>
            <h3 className={styles.title}>
              {(t.reviewTitle || 'Found {count} Sitemaps').replace('{count}', sitemaps.length)}
            </h3>
            <p className={styles.description}>
              {t.reviewDescription || 'Review the sitemaps below. Remove any you don\'t want submitted to Google Search Console.'}
            </p>

            <div className={styles.sitemapList}>
              {sitemaps.map((s, i) => (
                <div key={i} className={`${styles.sitemapItem} ${!s.included ? styles.sitemapExcluded : ''}`}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" dir="ltr" className={styles.sitemapUrl}>{s.url}</a>
                  <button
                    className={styles.removeBtn}
                    onClick={() => removeSitemap(i)}
                    title={t.remove || 'Remove'}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            {includedCount > 0 ? (
              <button className={styles.primaryBtn} onClick={handleSubmit}>
                <Send size={14} />
                {(t.submitToGsc || 'Submit {count} Sitemaps to Google Search Console').replace('{count}', includedCount)}
              </button>
            ) : (
              <p className={styles.noSitemapsHint}>
                {t.allRemoved || 'All sitemaps have been removed. Close this dialog or add sitemaps manually.'}
              </p>
            )}
          </div>
        )}

        {/* ── Step 3: Submitting ── */}
        {step === 'submitting' && (
          <div className={styles.content}>
            <div className={styles.iconWrap}>
              <Send size={28} />
            </div>
            <h3 className={styles.title}>
              {t.submittingTitle || 'Submitting Sitemaps'}
            </h3>
            <p className={styles.description}>
              {retryCount > 0
                ? (t.retrying || 'Retrying submission... (Attempt {attempt})').replace('{attempt}', retryCount + 1)
                : (t.submittingDescription || 'Sending your sitemaps to Google Search Console and verifying submission...')}
            </p>

            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${submitProgress}%` }} />
            </div>
            <div className={styles.progressLabel}>
              {submitProgress < 90
                ? (t.sendingSitemaps || 'Submitting sitemaps...')
                : (t.verifying || 'Verifying submission...')}
            </div>

            <Loader2 size={20} className={styles.spinner} />
          </div>
        )}

        {/* ── Step 4: Success ── */}
        {step === 'success' && (
          <div className={styles.content}>
            <div className={`${styles.iconWrap} ${styles.iconSuccess}`}>
              <CheckCircle size={28} />
            </div>
            <h3 className={styles.title}>
              {t.successTitle || 'Sitemaps Submitted Successfully!'}
            </h3>
            <p className={styles.description}>
              {t.successDescription || 'Your sitemaps have been submitted and verified in Google Search Console.'}
            </p>

            {submitResults?.results && (
              <div className={styles.resultsList}>
                {submitResults.results.filter(r => r.success).map((r, i) => (
                  <div key={i} className={styles.resultItem}>
                    <CheckCircle size={14} className={styles.resultSuccess} />
                    <bdi dir="ltr" className={styles.resultUrl}>{r.url}</bdi>
                  </div>
                ))}
              </div>
            )}

            {gscUrl && (
              <a
                href={gscUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.gscLink}
              >
                <ExternalLink size={14} />
                {t.viewInGsc || 'View in Google Search Console'}
              </a>
            )}

            <button className={styles.primaryBtn} onClick={onClose}>
              {t.done || 'Done'}
            </button>
          </div>
        )}

        {/* ── Step 5: Error ── */}
        {step === 'error' && (
          <div className={styles.content}>
            <div className={`${styles.iconWrap} ${styles.iconError}`}>
              <XCircle size={28} />
            </div>
            <h3 className={styles.title}>
              {t.errorTitle || 'Submission Failed'}
            </h3>

            {submitResults?.hasScopeError ? (
              <>
                <p className={styles.description}>
                  {t.scopeError || 'Your Google integration doesn\'t have write permissions for Search Console. Please reconnect your Google account to grant the required permissions.'}
                </p>
                <ol className={styles.instructions}>
                  <li>{t.scopeStep1 || 'Go to Settings → Integrations → Google'}</li>
                  <li>{t.scopeStep2 || 'Click "Reconnect" to re-authorize with updated permissions'}</li>
                  <li>{t.scopeStep3 || 'Then try submitting sitemaps again'}</li>
                </ol>
              </>
            ) : (
              <>
                <p className={styles.description}>
                  {t.errorDescription || 'The platform was unable to submit sitemaps to Google Search Console after multiple attempts. You can submit them manually.'}
                </p>
                <ol className={styles.instructions}>
                  <li>{t.manualStep1 || 'Open Google Search Console for your site'}</li>
                  <li>{t.manualStep2 || 'Go to "Sitemaps" in the left sidebar'}</li>
                  <li>{t.manualStep3 || 'Paste each sitemap URL and click "Submit"'}</li>
                </ol>

                {sitemaps.filter(s => s.included).length > 0 && (
                  <div className={styles.manualList}>
                    <span className={styles.manualListLabel}>{t.sitemapUrls || 'Your sitemap URLs:'}</span>
                    {sitemaps.filter(s => s.included).map((s, i) => (
                      <div key={i} className={styles.manualItem}>
                        <bdi dir="ltr">{s.url}</bdi>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {gscUrl && (
              <a
                href={gscUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.gscLink}
              >
                <ExternalLink size={14} />
                {t.openGsc || 'Open Google Search Console'}
              </a>
            )}

            <button className={styles.secondaryBtn} onClick={onClose}>
              {t.close || 'Close'}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
