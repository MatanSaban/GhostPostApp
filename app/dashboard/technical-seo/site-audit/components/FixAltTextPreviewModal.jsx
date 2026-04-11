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
  ExternalLink,
  Pencil,
  ImageIcon,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { emitCreditsUpdated } from '@/app/context/user-context';
import { handleLimitError } from '@/app/context/limit-guard-context';
import { useModalResize, ModalResizeButton } from '@/app/components/ui/ModalResizeButton';
import styles from './FixTitlePreviewModal.module.css';

/**
 * FixAltTextPreviewModal - Shows AI-generated alt text suggestions for images
 *
 * Props:
 * - open: boolean
 * - onClose: () => void
 * - auditId: string
 * - siteId: string
 * - onAuditUpdated: () => void
 */
export default function FixAltTextPreviewModal({ open, onClose, auditId, siteId, onAuditUpdated }) {
  const { t, locale } = useLocale();
  const { isMaximized, toggleMaximize } = useModalResize();

  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [fixStatus, setFixStatus] = useState({});
  const [isFixingAll, setIsFixingAll] = useState(false);
  const [fixProgress, setFixProgress] = useState({ done: 0, total: 0 });
  const [editingKey, setEditingKey] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [hasAppliedFixes, setHasAppliedFixes] = useState(false);

  // ─── Fetch suggestions on open ──────────────────────────────

  const fetchSuggestions = useCallback(async () => {
    if (!auditId || !siteId) return;
    setIsLoading(true);
    setLoadingStep(0);
    setError(null);
    setSuggestions([]);
    setFixStatus({});

    const stepTimer1 = setTimeout(() => setLoadingStep(1), 1500);
    const stepTimer2 = setTimeout(() => setLoadingStep(2), 5000);

    try {
      const res = await fetch('/api/audit/generate-alt-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auditId, siteId, locale }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate suggestions');
      }

      // Deduplicate by imageUrl
      const seen = new Set();
      const unique = (data.suggestions || []).filter((s) => {
        if (seen.has(s.imageUrl)) return false;
        seen.add(s.imageUrl);
        return true;
      });
      setSuggestions(unique);
      const statuses = {};
      unique.forEach((s) => {
        statuses[s.imageUrl] = 'idle';
      });
      setFixStatus(statuses);
    } catch (err) {
      console.error('[FixAltTextPreview] fetch error:', err);
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
    const { imageUrl, altText, pageUrl } = suggestion;
    setFixStatus((prev) => ({ ...prev, [imageUrl]: 'fixing' }));

    try {
      const res = await fetch('/api/audit/apply-alt-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId,
          auditId,
          fixes: [{ imageUrl, altText, pageUrl }],
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.code === 'INSUFFICIENT_CREDITS') {
          handleLimitError(data);
        }
        if (data.code === 'PLUGIN_UPDATE_REQUIRED') {
          throw new Error(data.error);
        }
        throw new Error(data.error || 'Fix failed');
      }

      if (data.creditsUpdated?.used != null) {
        emitCreditsUpdated(data.creditsUpdated.used);
      }

      const result = data.results?.[0];
      const isSuccess = result?.pushed && !result?.pushError;
      setFixStatus((prev) => ({
        ...prev,
        [imageUrl]: isSuccess ? 'done' : 'error',
      }));
      if (isSuccess) setHasAppliedFixes(true);
    } catch (err) {
      console.error('[FixAltTextPreview] apply error:', err);
      setFixStatus((prev) => ({ ...prev, [imageUrl]: 'error' }));
    }
  };

  // ─── Fix All ────────────────────────────────────────────────

  const handleFixAll = async () => {
    const pending = suggestions.filter((s) => fixStatus[s.imageUrl] === 'idle');
    if (pending.length === 0) return;

    setIsFixingAll(true);
    setFixProgress({ done: 0, total: pending.length });

    for (let i = 0; i < pending.length; i++) {
      const s = pending[i];
      setFixStatus((prev) => ({ ...prev, [s.imageUrl]: 'fixing' }));

      try {
        const res = await fetch('/api/audit/apply-alt-fix', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            siteId,
            auditId,
            fixes: [{ imageUrl: s.imageUrl, altText: s.altText, pageUrl: s.pageUrl }],
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          if (data.code === 'INSUFFICIENT_CREDITS') {
            handleLimitError(data);
            setFixStatus((prev) => ({ ...prev, [s.imageUrl]: 'error' }));
            break;
          }
          throw new Error(data.error || 'Fix failed');
        }

        if (data.creditsUpdated?.used != null) {
          emitCreditsUpdated(data.creditsUpdated.used);
        }

        const result = data.results?.[0];
        const isSuccess = result?.pushed && !result?.pushError;
        setFixStatus((prev) => ({
          ...prev,
          [s.imageUrl]: isSuccess ? 'done' : 'error',
        }));
        if (isSuccess) setHasAppliedFixes(true);
      } catch (err) {
        console.error('[FixAltTextPreview] batch fix error:', err);
        setFixStatus((prev) => ({ ...prev, [s.imageUrl]: 'error' }));
      }

      setFixProgress({ done: i + 1, total: pending.length });
    }

    setIsFixingAll(false);
  };

  // ─── Inline edit helpers ────────────────────────────────────

  const startEdit = (imageUrl, currentValue) => {
    setEditingKey(imageUrl);
    setEditValue(currentValue);
  };

  const confirmEdit = () => {
    if (!editingKey) return;
    setSuggestions((prev) =>
      prev.map((item) =>
        item.imageUrl === editingKey ? { ...item, altText: editValue } : item
      )
    );
    setEditingKey(null);
  };

  const cancelEdit = () => {
    setEditingKey(null);
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

  return createPortal(
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
            <ImageIcon size={24} />
          </div>
          <h3 className={styles.title}>{t('siteAudit.altFix.title')}</h3>
          <p className={styles.subtitle}>
            {t('siteAudit.altFix.subtitle')}
            <span className={styles.creditBadge}>
              <Coins size={12} />
              {t('siteAudit.altFix.creditCost')}
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
                <span>{t('siteAudit.altFix.stepAudit')}</span>
              </div>
              <div className={`${styles.loadingStep} ${loadingStep >= 1 ? styles.stepActive : ''}`}>
                {loadingStep > 1
                  ? <CheckCircle2 size={14} className={styles.stepDone} />
                  : loadingStep === 1
                    ? <Loader2 size={14} className={styles.spinning} />
                    : <span className={styles.stepDot} />}
                <span>{t('siteAudit.altFix.stepAnalyzing')}</span>
              </div>
              <div className={`${styles.loadingStep} ${loadingStep >= 2 ? styles.stepActive : ''}`}>
                {loadingStep >= 2
                  ? <Loader2 size={14} className={styles.spinning} />
                  : <span className={styles.stepDot} />}
                <span>{t('siteAudit.altFix.stepGenerating')}</span>
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
              {t('siteAudit.altFix.retry')}
            </button>
          </div>
        )}

        {/* Empty */}
        {!isLoading && !error && suggestions.length === 0 && (
          <div className={styles.emptyState}>
            <CheckCircle2 size={32} color="var(--success, #22c55e)" />
            <span>{t('siteAudit.altFix.noIssues')}</span>
          </div>
        )}

        {/* Suggestions list */}
        {!isLoading && !error && suggestions.length > 0 && (
          <>
            <div className={styles.suggestionsList}>
              {suggestions.filter((s) => fixStatus[s.imageUrl] !== 'done').map((s, idx) => {
                const status = fixStatus[s.imageUrl] || 'idle';
                const isEditing = editingKey === s.imageUrl;
                return (
                  <div key={s.imageUrl || idx} className={styles.suggestionItem}>
                    <div className={styles.imageRow}>
                      {/* Image thumbnail */}
                      <img
                        src={s.imageUrl}
                        alt=""
                        className={styles.imageThumb}
                        loading="lazy"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                      <div className={styles.imageDetails}>
                        {/* File name */}
                        {s.fileName && (
                          <div className={styles.imageFileName} title={s.fileName}>
                            {s.fileName}
                          </div>
                        )}

                        {/* Page URL */}
                        {s.pageUrl && (
                          <div className={styles.pageUrl} style={{ marginBottom: 6 }}>
                            <a
                              href={s.pageUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.pageUrlLink}
                              title={s.pageUrl}
                            >
                              <bdi dir="ltr">
                                {(() => {
                                  try {
                                    const u = new URL(s.pageUrl);
                                    return u.pathname === '/' ? u.hostname : `${u.hostname}${decodeURIComponent(u.pathname)}`;
                                  } catch {
                                    return s.pageUrl;
                                  }
                                })()}
                              </bdi>
                              <ExternalLink size={11} />
                            </a>
                          </div>
                        )}

                        {/* Alt text field */}
                        <div className={styles.titleRow} style={{ marginBottom: 0 }}>
                          <span className={`${styles.titleLabel} ${styles.labelNew}`}>alt</span>
                          {isEditing ? (
                            <span className={styles.titleEditWrap}>
                              <textarea
                                className={styles.altEditArea}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirmEdit(); }
                                  else if (e.key === 'Escape') { cancelEdit(); }
                                }}
                                autoFocus
                                rows={2}
                              />
                              <button className={styles.editConfirmBtn} onClick={confirmEdit}>
                                <CheckCircle2 size={14} />
                              </button>
                              <button className={styles.editCancelBtn} onClick={cancelEdit}>
                                <X size={14} />
                              </button>
                            </span>
                          ) : (
                            <span className={styles.titleText}>
                              {s.altText}
                              <span className={styles.charCount}>({s.altText.length})</span>
                              {status === 'idle' && (
                                <button
                                  className={styles.editTitleBtn}
                                  onClick={() => startEdit(s.imageUrl, s.altText)}
                                  title={t('siteAudit.altFix.edit')}
                                >
                                  <Pencil size={12} />
                                </button>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Fix / status */}
                    <div className={styles.itemActions}>
                      {status === 'idle' && (
                        <button
                          className={styles.fixOneBtn}
                          onClick={() => applyFix(s)}
                          disabled={isFixingAll}
                        >
                          <Wand2 size={13} />
                          {t('siteAudit.altFix.fixOne')}
                        </button>
                      )}
                      {status === 'fixing' && (
                        <span className={styles.fixOneBtn} style={{ pointerEvents: 'none' }}>
                          <Loader2 size={13} className={styles.spinning} />
                          {t('siteAudit.altFix.fixing')}
                        </span>
                      )}
                      {status === 'done' && (
                        <span className={styles.fixedBadge}>
                          <CheckCircle2 size={14} />
                          {t('siteAudit.altFix.fixed')}
                        </span>
                      )}
                      {status === 'error' && (
                        <>
                          <span className={styles.fixFailedBadge}>
                            <XCircle size={14} />
                            {t('siteAudit.altFix.failed')}
                          </span>
                          <button
                            className={styles.retryItemBtn}
                            onClick={() => {
                              setFixStatus((prev) => ({ ...prev, [s.imageUrl]: 'idle' }));
                            }}
                          >
                            <RefreshCw size={13} />
                            {t('siteAudit.altFix.retry')}
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
                    {t('siteAudit.altFix.fixingProgress', {
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
                    ? t('siteAudit.altFix.allFixed', { count: doneCount })
                    : t('siteAudit.altFix.totalCost', { count: pendingCount })}
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
                  {t('siteAudit.altFix.fixAll', { count: pendingCount })}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
