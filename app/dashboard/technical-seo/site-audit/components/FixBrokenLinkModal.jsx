'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Wand2, Loader2, CheckCircle2, XCircle, RefreshCw, ArrowRight, Database, ExternalLink, Link2Off } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { emitCreditsUpdated } from '@/app/context/user-context';
import { handleLimitError } from '@/app/context/limit-guard-context';
import SyncRequiredModal from './SyncRequiredModal';
import { useModalResize, ModalResizeButton } from '@/app/components/ui/ModalResizeButton';
import styles from './FixBrokenLinkModal.module.css';
import GCoinIcon from '@/app/components/ui/GCoinIcon';

/**
 * FixBrokenLinkModal - AI finds the best redirect target for each broken internal link
 *
 * Props:
 * - open: boolean
 * - onClose: () => void
 * - auditId: string
 * - siteId: string
 * - onAuditUpdated: () => void
 */
export default function FixBrokenLinkModal({ open, onClose, auditId, siteId, onAuditUpdated }) {
  const { t, locale } = useLocale();
  const { isMaximized, toggleMaximize } = useModalResize();

  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState(null);

  const [suggestions, setSuggestions] = useState([]);
  const [fixStatus, setFixStatus] = useState({});

  const [isFixingAll, setIsFixingAll] = useState(false);
  const [fixProgress, setFixProgress] = useState({ done: 0, total: 0 });

  const [hasAppliedFixes, setHasAppliedFixes] = useState(false);
  const [hasEntities, setHasEntities] = useState(true);
  const [showSyncModal, setShowSyncModal] = useState(false);

  // ─── Fetch suggestions on open ──────────────────────────────

  const fetchSuggestions = useCallback(async () => {
    if (!auditId || !siteId) return;
    setIsLoading(true);
    setLoadingStep(0);
    setError(null);
    setSuggestions([]);
    setFixStatus({});

    const stepTimer1 = setTimeout(() => setLoadingStep(1), 1200);
    const stepTimer2 = setTimeout(() => setLoadingStep(2), 3000);

    try {
      const res = await fetch('/api/audit/fix-404', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId, auditId, action: 'suggest', locale }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.code === 'NO_ENTITIES') {
          setHasEntities(false);
          setShowSyncModal(true);
          return;
        }
        throw new Error(data.error || 'Failed to generate suggestions');
      }

      setSuggestions(data.suggestions || []);
      setHasEntities(data.hasEntities !== false);
      const statuses = {};
      (data.suggestions || []).forEach((s) => {
        statuses[s.brokenUrl] = 'idle';
      });
      setFixStatus(statuses);
    } catch (err) {
      console.error('[FixBrokenLink] fetch error:', err);
      setError(err.message);
    } finally {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setIsLoading(false);
    }
  }, [auditId, siteId, locale]);

  useEffect(() => {
    if (open) {
      fetchSuggestions();
    }
  }, [open, fetchSuggestions]);

  // ─── Apply single fix ───────────────────────────────────────

  const applyFix = async (suggestion) => {
    const { brokenUrl, suggestedUrl } = suggestion;
    setFixStatus((prev) => ({ ...prev, [brokenUrl]: 'fixing' }));

    try {
      const res = await fetch('/api/audit/fix-404', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId,
          auditId,
          action: 'apply',
          fixes: [{ brokenUrl, targetUrl: suggestedUrl }],
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.code === 'INSUFFICIENT_CREDITS') {
          handleLimitError(data);
        }
        if (data.code === 'NO_ENTITIES') {
          setShowSyncModal(true);
          setFixStatus((prev) => ({ ...prev, [brokenUrl]: 'idle' }));
          return;
        }
        throw new Error(data.error || 'Fix failed');
      }

      if (data.creditsUpdated?.used != null) {
        emitCreditsUpdated(data.creditsUpdated.used);
      }

      const result = data.results?.[0];
      setFixStatus((prev) => ({
        ...prev,
        [brokenUrl]: result?.created ? 'done' : 'error',
      }));
      if (result?.created) setHasAppliedFixes(true);
    } catch (err) {
      console.error('[FixBrokenLink] apply error:', err);
      setFixStatus((prev) => ({ ...prev, [brokenUrl]: 'error' }));
    }
  };

  // ─── Fix All ────────────────────────────────────────────────

  const handleFixAll = async () => {
    const pending = suggestions.filter((s) => fixStatus[s.brokenUrl] === 'idle');
    if (pending.length === 0) return;

    setIsFixingAll(true);
    setFixProgress({ done: 0, total: pending.length });

    for (let i = 0; i < pending.length; i++) {
      const s = pending[i];
      setFixStatus((prev) => ({ ...prev, [s.brokenUrl]: 'fixing' }));

      try {
        const res = await fetch('/api/audit/fix-404', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            siteId,
            auditId,
            action: 'apply',
            fixes: [{ brokenUrl: s.brokenUrl, targetUrl: s.suggestedUrl }],
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          if (data.code === 'INSUFFICIENT_CREDITS') {
            handleLimitError(data);
            setFixStatus((prev) => ({ ...prev, [s.brokenUrl]: 'error' }));
            break;
          }
          if (data.code === 'NO_ENTITIES') {
            setShowSyncModal(true);
            setFixStatus((prev) => ({ ...prev, [s.brokenUrl]: 'idle' }));
            break;
          }
          throw new Error(data.error || 'Fix failed');
        }

        if (data.creditsUpdated?.used != null) {
          emitCreditsUpdated(data.creditsUpdated.used);
        }

        const result = data.results?.[0];
        setFixStatus((prev) => ({
          ...prev,
          [s.brokenUrl]: result?.created ? 'done' : 'error',
        }));
        if (result?.created) setHasAppliedFixes(true);
      } catch (err) {
        console.error('[FixBrokenLink] batch fix error:', err);
        setFixStatus((prev) => ({ ...prev, [s.brokenUrl]: 'error' }));
      }

      setFixProgress({ done: i + 1, total: pending.length });
    }

    setIsFixingAll(false);
  };

  // ─── Derived state ──────────────────────────────────────────

  const doneCount = Object.values(fixStatus).filter((s) => s === 'done').length;
  const pendingCount = Object.values(fixStatus).filter((s) => s === 'idle').length;
  const allDone = suggestions.length > 0 && pendingCount === 0;

  const handleClose = useCallback(() => {
    if (hasAppliedFixes && onAuditUpdated) {
      onAuditUpdated();
    }
    setHasAppliedFixes(false);
    onClose();
  }, [hasAppliedFixes, onAuditUpdated, onClose]);

  // ─── Render ─────────────────────────────────────────────────

  if (!open) return null;

  const formatUrl = (url) => {
    try {
      const u = new URL(url);
      return u.pathname === '/' ? u.hostname : `${u.hostname}${decodeURIComponent(u.pathname)}`;
    } catch {
      return url;
    }
  };

  return (
    <>
      {createPortal(
        <div className={styles.overlay} onClick={handleClose}>
          <div className={`${styles.modal} ${isMaximized ? 'modal-maximized' : ''}`} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', position: 'absolute', top: '1rem', right: '1rem', zIndex: 1 }}>
              <ModalResizeButton isMaximized={isMaximized} onToggle={toggleMaximize} className={styles.closeBtn} />
              <button className={styles.closeBtn} onClick={handleClose}>
                <X size={18} />
              </button>
            </div>

            {/* Header */}
            <div className={styles.header}>
              <div className={styles.iconWrap}>
                <Link2Off size={24} />
              </div>
              <h3 className={styles.title}>{t('siteAudit.brokenLinkFix.title')}</h3>
              <p className={styles.subtitle}>
                {t('siteAudit.brokenLinkFix.subtitle')}
                <span className={styles.creditBadge}>
                  <GCoinIcon size={12} />
                  {t('siteAudit.brokenLinkFix.creditCost')}
                </span>
              </p>
            </div>

            {/* Loading */}
            {isLoading && (
              <div className={styles.loadingState}>
                <Loader2 size={28} className={styles.spinning} />
                <div className={styles.loadingSteps}>
                  <div className={`${styles.loadingStep} ${loadingStep >= 0 ? styles.stepActive : ''}`}>
                    <CheckCircle2 size={14} className={loadingStep > 0 ? styles.stepDone : styles.stepCurrent} />
                    <span>{t('siteAudit.brokenLinkFix.stepAudit')}</span>
                  </div>
                  <div className={`${styles.loadingStep} ${loadingStep >= 1 ? styles.stepActive : ''}`}>
                    {loadingStep > 1
                      ? <CheckCircle2 size={14} className={styles.stepDone} />
                      : loadingStep === 1
                        ? <Loader2 size={14} className={styles.spinning} />
                        : <span className={styles.stepDot} />}
                    <span>{t('siteAudit.brokenLinkFix.stepAnalyzing')}</span>
                  </div>
                  <div className={`${styles.loadingStep} ${loadingStep >= 2 ? styles.stepActive : ''}`}>
                    {loadingStep >= 2
                      ? <Loader2 size={14} className={styles.spinning} />
                      : <span className={styles.stepDot} />}
                    <span>{t('siteAudit.brokenLinkFix.stepGenerating')}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Error */}
            {error && !isLoading && (
              <div className={styles.errorState}>
                <XCircle size={32} color="var(--error, #ef4444)" />
                <p className={styles.errorMsg}>{error}</p>
                <button className={styles.retryBtn} onClick={fetchSuggestions}>
                  <RefreshCw size={14} />
                  {t('siteAudit.brokenLinkFix.retry')}
                </button>
              </div>
            )}

            {/* Empty */}
            {!isLoading && !error && suggestions.length === 0 && (
              <div className={styles.emptyState}>
                <CheckCircle2 size={32} color="var(--success, #22c55e)" />
                <span>{t('siteAudit.brokenLinkFix.noIssues')}</span>
              </div>
            )}

            {/* Suggestions list */}
            {!isLoading && !error && suggestions.length > 0 && (
              <>
                {!hasEntities && (
                  <div className={styles.syncBanner} onClick={() => setShowSyncModal(true)}>
                    <Database size={15} />
                    <span>{t('siteAudit.syncRequired.banner')}</span>
                    <ArrowRight size={13} />
                  </div>
                )}
                <div className={styles.suggestionsList}>
                  {suggestions.filter((s) => fixStatus[s.brokenUrl] !== 'done').map((s, idx) => {
                    const status = fixStatus[s.brokenUrl] || 'idle';
                    return (
                      <div key={s.brokenUrl || idx} className={styles.suggestionItem}>
                        {/* Broken URL */}
                        <div className={styles.linkRow}>
                          <span className={`${styles.linkLabel} ${styles.labelBroken}`}>
                            {t('siteAudit.brokenLinkFix.brokenLabel')}
                          </span>
                          <bdi dir="ltr">
                            <span className={`${styles.linkUrl} ${styles.brokenUrl}`}>
                              {formatUrl(s.brokenUrl)}
                            </span>
                          </bdi>
                        </div>

                        {/* Suggested redirect */}
                        <div className={styles.linkRow}>
                          <span className={`${styles.linkLabel} ${styles.labelRedirect}`}>
                            {t('siteAudit.brokenLinkFix.redirectLabel')}
                          </span>
                          <a
                            href={s.suggestedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.linkUrl}
                            title={s.suggestedUrl}
                          >
                            <bdi dir="ltr">{formatUrl(s.suggestedUrl)}</bdi>
                            <ExternalLink size={12} />
                          </a>
                          {s.confidence && (
                            <span className={`${styles.confidenceBadge} ${styles[s.confidence]}`}>
                              {s.confidence}
                            </span>
                          )}
                        </div>

                        {/* Page title */}
                        {s.suggestedTitle && (
                          <div className={styles.metaRow}>
                            <span className={styles.metaItem}>
                              {s.suggestedTitle}
                            </span>
                          </div>
                        )}

                        {/* Reason */}
                        {s.reason && (
                          <div className={styles.reason}>{s.reason}</div>
                        )}

                        {/* Fix / status */}
                        <div className={styles.itemActions}>
                          {status === 'idle' && (
                            <button
                              className={styles.fixOneBtn}
                              onClick={() => applyFix(s)}
                              disabled={isFixingAll}
                            >
                              <Wand2 size={13} />
                              {t('siteAudit.brokenLinkFix.fixOne')}
                            </button>
                          )}
                          {status === 'fixing' && (
                            <span className={styles.fixOneBtn} style={{ pointerEvents: 'none' }}>
                              <Loader2 size={13} className={styles.spinning} />
                              {t('siteAudit.brokenLinkFix.fixing')}
                            </span>
                          )}
                          {status === 'done' && (
                            <span className={styles.fixedBadge}>
                              <CheckCircle2 size={14} />
                              {t('siteAudit.brokenLinkFix.fixed')}
                            </span>
                          )}
                          {status === 'error' && (
                            <>
                              <span className={styles.fixFailedBadge}>
                                <XCircle size={14} />
                                {t('siteAudit.brokenLinkFix.failed')}
                              </span>
                              <button
                                className={styles.retryItemBtn}
                                onClick={() => {
                                  setFixStatus((prev) => ({ ...prev, [s.brokenUrl]: 'idle' }));
                                }}
                              >
                                <RefreshCw size={13} />
                                {t('siteAudit.brokenLinkFix.retry')}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Footer */}
                <div className={styles.footer}>
                  {isFixingAll ? (
                    <div className={styles.progressWrap}>
                      <span className={styles.progressLabel}>
                        {t('siteAudit.brokenLinkFix.fixingProgress', {
                          done: fixProgress.done,
                          total: fixProgress.total,
                        })}
                      </span>
                      <div className={styles.progressBar}>
                        <div
                          className={styles.progressFill}
                          style={{
                            width: fixProgress.total
                              ? `${(fixProgress.done / fixProgress.total) * 100}%`
                              : '0%',
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <span className={styles.footerInfo}>
                      <GCoinIcon size={14} />
                      {allDone
                        ? t('siteAudit.brokenLinkFix.allFixed', { count: doneCount })
                        : `${pendingCount} × 2 = ${pendingCount * 2} credits`}
                    </span>
                  )}

                  {!allDone && (
                    <button
                      className={styles.fixAllBtn}
                      onClick={handleFixAll}
                      disabled={isFixingAll || pendingCount === 0}
                    >
                      {isFixingAll ? (
                        <Loader2 size={15} className={styles.spinning} />
                      ) : (
                        <Wand2 size={15} />
                      )}
                      {t('siteAudit.brokenLinkFix.fixAll', { count: pendingCount })}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
      <SyncRequiredModal
        open={showSyncModal}
        onClose={() => setShowSyncModal(false)}
      />
    </>
  );
}
