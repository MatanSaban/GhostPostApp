'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Wand2,
  Loader2,
  CheckCircle2,
  XCircle,
  Coins,
  RefreshCw,
  ArrowRight,
  Database,
  ExternalLink,
  Pencil,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { emitCreditsUpdated } from '@/app/context/user-context';
import { handleLimitError } from '@/app/context/limit-guard-context';
import SyncRequiredModal from './SyncRequiredModal';
import styles from './FixTitlePreviewModal.module.css';

/**
 * FixTitlePreviewModal — Shows AI-generated title suggestions with Preview → Confirm → Execute flow
 *
 * Props:
 * - open: boolean
 * - onClose: () => void
 * - auditId: string
 * - siteId: string
 */
export default function FixTitlePreviewModal({ open, onClose, auditId, siteId, onAuditUpdated }) {
  const { t } = useLocale();

  // Loading / error
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0); // 0=audit, 1=analyzing, 2=generating
  const [error, setError] = useState(null);

  // Suggestions from API
  const [suggestions, setSuggestions] = useState([]);

  // Per-item fix status: { [url]: 'idle' | 'fixing' | 'done' | 'error' }
  const [fixStatus, setFixStatus] = useState({});

  // Batch-fixing all
  const [isFixingAll, setIsFixingAll] = useState(false);
  const [fixProgress, setFixProgress] = useState({ done: 0, total: 0 });

  // Inline editing
  const [editingUrl, setEditingUrl] = useState(null);
  const [editValue, setEditValue] = useState('');

  // Track if any fix was applied (to refresh audit on close)
  const [hasAppliedFixes, setHasAppliedFixes] = useState(false);

  // Entities sync check
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

    // Simulate progress steps while API works
    const stepTimer1 = setTimeout(() => setLoadingStep(1), 1200);
    const stepTimer2 = setTimeout(() => setLoadingStep(2), 3000);

    try {
      const res = await fetch('/api/audit/generate-title-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auditId, siteId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate suggestions');
      }

      setSuggestions(data.suggestions || []);
      setHasEntities(data.hasEntities !== false);
      // Init all statuses to idle
      const statuses = {};
      (data.suggestions || []).forEach((s) => {
        statuses[s.url] = 'idle';
      });
      setFixStatus(statuses);
    } catch (err) {
      console.error('[FixTitlePreview] fetch error:', err);
      setError(err.message);
    } finally {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setIsLoading(false);
    }
  }, [auditId, siteId]);

  useEffect(() => {
    if (open) {
      fetchSuggestions();
    }
  }, [open, fetchSuggestions]);

  // ─── Apply single fix ───────────────────────────────────────

  const applyFix = async (suggestion) => {
    const { url, newTitle } = suggestion;
    setFixStatus((prev) => ({ ...prev, [url]: 'fixing' }));

    try {
      const res = await fetch('/api/audit/apply-title-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId,
          auditId,
          fixes: [{ url, newTitle }],
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.code === 'INSUFFICIENT_CREDITS') {
          handleLimitError(data);
        }
        if (data.code === 'NO_ENTITIES') {
          setShowSyncModal(true);
          setFixStatus((prev) => ({ ...prev, [url]: 'idle' }));
          return;
        }
        throw new Error(data.error || 'Fix failed');
      }

      // Update credits header
      if (data.creditsUpdated?.used != null) {
        emitCreditsUpdated(data.creditsUpdated.used);
      }

      const result = data.results?.[0];
      const isSuccess = result?.pushed || !result?.pushError;
      setFixStatus((prev) => ({
        ...prev,
        [url]: isSuccess ? 'done' : 'error',
      }));
      if (isSuccess) setHasAppliedFixes(true);
    } catch (err) {
      console.error('[FixTitlePreview] apply error:', err);
      setFixStatus((prev) => ({ ...prev, [url]: 'error' }));
    }
  };

  // ─── Fix All ────────────────────────────────────────────────

  const handleFixAll = async () => {
    const pending = suggestions.filter((s) => fixStatus[s.url] === 'idle');
    if (pending.length === 0) return;

    setIsFixingAll(true);
    setFixProgress({ done: 0, total: pending.length });

    // Fix one-by-one so credits and progress update incrementally
    for (let i = 0; i < pending.length; i++) {
      const s = pending[i];
      setFixStatus((prev) => ({ ...prev, [s.url]: 'fixing' }));

      try {
        const res = await fetch('/api/audit/apply-title-fix', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            siteId,
            auditId,
            fixes: [{ url: s.url, newTitle: s.newTitle }],
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          if (data.code === 'INSUFFICIENT_CREDITS') {
            handleLimitError(data);
            setFixStatus((prev) => ({ ...prev, [s.url]: 'error' }));
            break;
          }
          if (data.code === 'NO_ENTITIES') {
            setShowSyncModal(true);
            setFixStatus((prev) => ({ ...prev, [s.url]: 'idle' }));
            break;
          }
          throw new Error(data.error || 'Fix failed');
        }

        if (data.creditsUpdated?.used != null) {
          emitCreditsUpdated(data.creditsUpdated.used);
        }

        const result = data.results?.[0];
        const isSuccess = result?.pushed || !result?.pushError;
        setFixStatus((prev) => ({
          ...prev,
          [s.url]: isSuccess ? 'done' : 'error',
        }));
        if (isSuccess) setHasAppliedFixes(true);
      } catch (err) {
        console.error('[FixTitlePreview] batch fix error:', err);
        setFixStatus((prev) => ({ ...prev, [s.url]: 'error' }));
      }

      setFixProgress({ done: i + 1, total: pending.length });
    }

    setIsFixingAll(false);
  };

  // ─── Derived state ──────────────────────────────────────────

  const doneCount = Object.values(fixStatus).filter((s) => s === 'done').length;
  const pendingCount = Object.values(fixStatus).filter((s) => s === 'idle').length;
  const allDone = suggestions.length > 0 && pendingCount === 0;

  // Close handler — refresh audit if fixes were applied
  const handleClose = useCallback(() => {
    if (hasAppliedFixes && onAuditUpdated) {
      onAuditUpdated();
    }
    setHasAppliedFixes(false);
    onClose();
  }, [hasAppliedFixes, onAuditUpdated, onClose]);

  // ─── Render ─────────────────────────────────────────────────

  if (!open) return null;

  return (
    <>
    {createPortal(
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={handleClose}>
          <X size={18} />
        </button>

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.iconWrap}>
            <Wand2 size={24} />
          </div>
          <h3 className={styles.title}>{t('siteAudit.titleFix.title')}</h3>
          <p className={styles.subtitle}>
            {t('siteAudit.titleFix.subtitle')}
            <span className={styles.creditBadge}>
              <Coins size={12} />
              {t('siteAudit.titleFix.creditCost')}
            </span>
          </p>
        </div>

        {/* Loading with progress steps */}
        {isLoading && (
          <div className={styles.loadingState}>
            <Loader2 size={28} className={styles.spinning} />
            <div className={styles.loadingSteps}>
              <div className={`${styles.loadingStep} ${loadingStep >= 0 ? styles.stepActive : ''}`}>
                <CheckCircle2 size={14} className={loadingStep > 0 ? styles.stepDone : styles.stepCurrent} />
                <span>{t('siteAudit.titleFix.stepAudit')}</span>
              </div>
              <div className={`${styles.loadingStep} ${loadingStep >= 1 ? styles.stepActive : ''}`}>
                {loadingStep > 1
                  ? <CheckCircle2 size={14} className={styles.stepDone} />
                  : loadingStep === 1
                    ? <Loader2 size={14} className={styles.spinning} />
                    : <span className={styles.stepDot} />}
                <span>{t('siteAudit.titleFix.stepAnalyzing')}</span>
              </div>
              <div className={`${styles.loadingStep} ${loadingStep >= 2 ? styles.stepActive : ''}`}>
                {loadingStep >= 2
                  ? <Loader2 size={14} className={styles.spinning} />
                  : <span className={styles.stepDot} />}
                <span>{t('siteAudit.titleFix.stepGenerating')}</span>
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
              {t('siteAudit.titleFix.retry')}
            </button>
          </div>
        )}

        {/* Empty */}
        {!isLoading && !error && suggestions.length === 0 && (
          <div className={styles.emptyState}>
            <CheckCircle2 size={32} color="var(--success, #22c55e)" />
            <span>{t('siteAudit.titleFix.noIssues')}</span>
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
              {suggestions.map((s, idx) => {
                const status = fixStatus[s.url] || 'idle';
                return (
                  <div key={s.url || idx} className={styles.suggestionItem}>
                    {/* Page URL */}
                    <div className={styles.pageUrl}>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.pageUrlLink}
                        title={s.url}
                      >
                        <bdi dir="ltr">
                          {(() => {
                            try {
                              const u = new URL(s.url);
                              return u.pathname === '/' ? u.hostname : `${u.hostname}${decodeURIComponent(u.pathname)}`;
                            } catch {
                              return s.url;
                            }
                          })()}
                        </bdi>
                        <ExternalLink size={12} />
                      </a>
                    </div>

                    {/* Old title */}
                    <div className={styles.titleRow}>
                      <span className={`${styles.titleLabel} ${styles.labelOld}`}>
                        {t('siteAudit.titleFix.oldLabel')}
                      </span>
                      <span className={`${styles.titleText} ${styles.oldTitleText}`}>
                        {s.oldTitle || '—'}
                        <span className={styles.charCount}>({(s.oldTitle || '').length})</span>
                      </span>
                    </div>

                    {/* New title — editable */}
                    <div className={styles.titleRow}>
                      <span className={`${styles.titleLabel} ${styles.labelNew}`}>
                        {t('siteAudit.titleFix.newLabel')}
                      </span>
                      {editingUrl === s.url ? (
                        <span className={styles.titleEditWrap}>
                          <input
                            className={styles.titleEditInput}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                setSuggestions((prev) =>
                                  prev.map((item) =>
                                    item.url === s.url ? { ...item, newTitle: editValue } : item
                                  )
                                );
                                setEditingUrl(null);
                              } else if (e.key === 'Escape') {
                                setEditingUrl(null);
                              }
                            }}
                            autoFocus
                          />
                          <span className={styles.charCount}>({editValue.length})</span>
                          <button
                            className={styles.editConfirmBtn}
                            onClick={() => {
                              setSuggestions((prev) =>
                                prev.map((item) =>
                                  item.url === s.url ? { ...item, newTitle: editValue } : item
                                )
                              );
                              setEditingUrl(null);
                            }}
                          >
                            <CheckCircle2 size={14} />
                          </button>
                          <button
                            className={styles.editCancelBtn}
                            onClick={() => setEditingUrl(null)}
                          >
                            <X size={14} />
                          </button>
                        </span>
                      ) : (
                        <span className={styles.titleText}>
                          {s.newTitle}
                          <span className={styles.charCount}>({s.newTitle.length})</span>
                          {status === 'idle' && (
                            <button
                              className={styles.editTitleBtn}
                              onClick={() => {
                                setEditingUrl(s.url);
                                setEditValue(s.newTitle);
                              }}
                              title={t('siteAudit.titleFix.editTitle')}
                            >
                              <Pencil size={12} />
                            </button>
                          )}
                        </span>
                      )}
                    </div>

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
                          {t('siteAudit.titleFix.fixOne')}
                        </button>
                      )}
                      {status === 'fixing' && (
                        <span className={styles.fixOneBtn} style={{ pointerEvents: 'none' }}>
                          <Loader2 size={13} className={styles.spinning} />
                          {t('siteAudit.titleFix.fixing')}
                        </span>
                      )}
                      {status === 'done' && (
                        <span className={styles.fixedBadge}>
                          <CheckCircle2 size={14} />
                          {t('siteAudit.titleFix.fixed')}
                        </span>
                      )}
                      {status === 'error' && (
                        <>
                          <span className={styles.fixFailedBadge}>
                            <XCircle size={14} />
                            {t('siteAudit.titleFix.failed')}
                          </span>
                          <button
                            className={styles.retryItemBtn}
                            onClick={() => {
                              setFixStatus((prev) => ({ ...prev, [s.url]: 'idle' }));
                            }}
                          >
                            <RefreshCw size={13} />
                            {t('siteAudit.titleFix.retry')}
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
                    {t('siteAudit.titleFix.fixingProgress', {
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
                  <Coins size={14} />
                  {allDone
                    ? t('siteAudit.titleFix.allFixed', { count: doneCount })
                    : t('siteAudit.titleFix.totalCost', { count: pendingCount })}
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
                  {t('siteAudit.titleFix.fixAll', { count: pendingCount })}
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
