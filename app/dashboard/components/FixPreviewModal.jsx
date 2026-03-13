'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Sparkles, Loader2, CheckCircle2, XCircle,
  RefreshCw, ExternalLink, Pencil, Search,
} from 'lucide-react';
import { useModalResize, ModalResizeButton } from '@/app/components/ui/ModalResizeButton';
import styles from './FixPreviewModal.module.css';

/**
 * FixPreviewModal — Shows AI-generated SEO fix proposals with Preview → Approve → Apply flow.
 *
 * Props:
 * - open: boolean
 * - onClose: () => void
 * - insight: object (full insight object with id, titleKey, data, actionPayload)
 * - translations: object (agent translations)
 * - onApplied: () => void (called after successful apply to refresh insights)
 */
export default function FixPreviewModal({ open, onClose, insight, translations, onApplied, itemIndices }) {
  const t = translations?.agent || {};
  const insightId = insight?.id;
  const { isMaximized, toggleMaximize } = useModalResize();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [regeneratingIdx, setRegeneratingIdx] = useState(null);
  const [isApplying, setIsApplying] = useState(false);
  const [applyResults, setApplyResults] = useState(null);
  const [appliedItems, setAppliedItems] = useState({}); // { [postId]: { status, reason? } }
  const [applyingSingleIdx, setApplyingSingleIdx] = useState(null);
  const [editingField, setEditingField] = useState(null); // { idx, field }
  const [editValue, setEditValue] = useState('');

  // ─── Build skeleton proposals from insight data ──────────────

  const buildSkeletonProposals = useCallback(() => {
    if (!insight) return [];
    const type = insight.titleKey?.match(/agent\.insights\.(\w+)\.title/)?.[1];

    if (type === 'missingSeo') {
      const pages = insight.data?.pages || [];
      const seen = new Set();
      // If itemIndices is provided, only show those specific items
      const indicesToUse = itemIndices || pages.map((_, i) => i);
      const filteredPages = indicesToUse
        .map(i => ({ page: pages[i], realIndex: i }))
        .filter(({ page }) => {
          if (!page) return false;
          const key = page.url?.replace(/^https?:\/\//, '').replace(/\/$/, '') || page.slug || page.title;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      return filteredPages.map(({ page, realIndex }) => ({
        page: page.title || page.slug || '',
        url: page.url,
        realIndex, // track original index for API calls
        status: 'loading',
        current: { title: '', description: '' },
        proposed: null,
      }));
    }

    if (type === 'keywordStrikeZone') {
      const d = insight.data || {};
      if (d.url) {
        return [{
          page: d.url,
          url: d.url,
          keyword: d.keyword,
          status: 'loading',
          current: { title: '', description: '' },
          proposed: null,
        }];
      }
    }

    return [];
  }, [insight]);

  // ─── Fetch preview on open (per-item, progressive) ──────────

  const fetchPreview = useCallback(async () => {
    if (!insightId) return;
    const skeletons = buildSkeletonProposals();
    setIsLoading(true);
    setError(null);
    setProposals(skeletons);
    setApplyResults(null);

    // Pre-populate previously fixed items from insight's executionResult
    const prevResults = insight?.executionResult?.results || [];
    const prevApplied = {};
    for (const r of prevResults) {
      if (r.postId && r.status === 'fixed') prevApplied[r.postId] = r;
    }
    setAppliedItems(prevApplied);

    if (skeletons.length === 0) {
      setIsLoading(false);
      return;
    }

    let remaining = skeletons.length;
    const onItemDone = () => {
      remaining--;
      if (remaining <= 0) setIsLoading(false);
    };

    for (let i = 0; i < skeletons.length; i++) {
      const idx = i;
      const apiIndex = skeletons[i].realIndex ?? i;
      fetch(`/api/agent/insights/${insightId}/fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'regenerate', itemIndex: apiIndex }),
      })
        .then(res => res.json())
        .then(data => {
          if (data.proposal) {
            setProposals(prev => prev.map((p, j) => j === idx ? data.proposal : p));
          } else {
            setProposals(prev => prev.map((p, j) =>
              j === idx ? { ...p, status: 'error', reason: data.error || 'Generation failed' } : p
            ));
          }
        })
        .catch(err => {
          console.error(`[FixPreview] item ${idx} error:`, err);
          setProposals(prev => prev.map((p, j) =>
            j === idx ? { ...p, status: 'error', reason: err.message } : p
          ));
        })
        .finally(onItemDone);
    }
  }, [insightId, buildSkeletonProposals]);

  useEffect(() => {
    if (open) fetchPreview();
  }, [open, fetchPreview]);

  // ─── Regenerate single item ─────────────────────────────────

  const handleRegenerate = async (idx) => {
    setRegeneratingIdx(idx);
    const apiIndex = proposals[idx]?.realIndex ?? idx;
    try {
      const res = await fetch(`/api/agent/insights/${insightId}/fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'regenerate', itemIndex: apiIndex }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Regeneration failed');
      if (data.proposal) {
        setProposals(prev => prev.map((p, i) => i === idx ? data.proposal : p));
      }
    } catch (err) {
      console.error('[FixPreview] regenerate error:', err);
    } finally {
      setRegeneratingIdx(null);
    }
  };

  // ─── Apply single item ──────────────────────────────────────

  const handleApplySingle = async (idx) => {
    const proposal = proposals[idx];
    if (!proposal || proposal.status !== 'ready') return;

    setApplyingSingleIdx(idx);
    try {
      const res = await fetch(`/api/agent/insights/${insightId}/fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'apply', proposals: [proposal] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Apply failed');

      const itemResult = data.results?.[0];
      if (itemResult) {
        setAppliedItems(prev => ({ ...prev, [proposal.postId]: itemResult }));
      }
      if (data.success && onApplied) onApplied();
    } catch (err) {
      console.error('[FixPreview] apply single error:', err);
      setAppliedItems(prev => ({ ...prev, [proposal.postId]: { status: 'error', reason: err.message } }));
    } finally {
      setApplyingSingleIdx(null);
    }
  };

  // ─── Apply all proposals ────────────────────────────────────

  const handleApply = async () => {
    const readyProposals = proposals.filter(p => p.status === 'ready' && !appliedItems[p.postId]);
    if (readyProposals.length === 0) return;

    setIsApplying(true);
    try {
      const res = await fetch(`/api/agent/insights/${insightId}/fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'apply', proposals: readyProposals }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Apply failed');
      setApplyResults(data);
      if (data.success && onApplied) onApplied();
    } catch (err) {
      console.error('[FixPreview] apply error:', err);
      setApplyResults({ success: false, error: err.message });
    } finally {
      setIsApplying(false);
    }
  };

  // ─── Inline editing ─────────────────────────────────────────

  const startEdit = (idx, field) => {
    setEditingField({ idx, field });
    setEditValue(proposals[idx]?.proposed?.[field] || '');
  };

  const confirmEdit = () => {
    if (!editingField) return;
    const { idx, field } = editingField;
    setProposals(prev =>
      prev.map((p, i) =>
        i === idx ? { ...p, proposed: { ...p.proposed, [field]: editValue } } : p
      )
    );
    setEditingField(null);
  };

  const cancelEdit = () => setEditingField(null);

  // ─── Derived state ──────────────────────────────────────────

  const readyCount = proposals.filter(p => p.status === 'ready' && !appliedItems[p.postId]).length;
  const allApplied = applyResults?.success ||
    (proposals.filter(p => p.status === 'ready').length > 0 &&
     proposals.filter(p => p.status === 'ready').every(p => appliedItems[p.postId]?.status === 'fixed'));

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

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

  return createPortal(
    <div className={styles.overlay} onClick={handleClose}>
      <div className={`${styles.modal} ${isMaximized ? 'modal-maximized' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', position: 'absolute', top: '1rem', insetInlineEnd: '1rem', zIndex: 1 }}>
          <ModalResizeButton isMaximized={isMaximized} onToggle={toggleMaximize} className={styles.closeBtn} />
          <button className={styles.closeBtn} onClick={handleClose}>
            <X size={18} />
          </button>
        </div>

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.iconWrap}>
            <Sparkles size={24} />
          </div>
          <h3 className={styles.title}>{t.fixPreviewTitle || 'AI Fix Preview'}</h3>
          <p className={styles.subtitle}>{t.fixPreviewSubtitle || 'Review the proposed changes before applying them to your site.'}</p>
        </div>

        {/* Loading — only show generic spinner when no skeleton proposals */}
        {isLoading && proposals.length === 0 && (
          <div className={styles.loadingState}>
            <Loader2 size={28} className={styles.spinning} />
            <span className={styles.loadingText}>{t.fixGenerating || 'Generating AI suggestions...'}</span>
          </div>
        )}

        {/* Error */}
        {error && !isLoading && (
          <div className={styles.errorState}>
            <XCircle size={32} color="var(--error, #ef4444)" />
            <p className={styles.errorMsg}>{error}</p>
            <button className={styles.retryBtn} onClick={fetchPreview}>
              <RefreshCw size={14} />
              {t.fixRetry || 'Try Again'}
            </button>
          </div>
        )}

        {/* Proposals list */}
        {!error && proposals.length > 0 && (
          <>
            <div className={styles.proposalsList}>
              {proposals.map((p, idx) => {
                const isSkeleton = p.status === 'loading';
                const isSkipped = p.status === 'skipped' || p.status === 'error';
                const appliedResult = applyResults?.results?.find(r => r.postId === p.postId) || appliedItems[p.postId];

                return (
                  <div key={p.url || idx} className={`${styles.proposalItem} ${isSkipped ? styles.proposalItemSkipped : ''}`}>
                    {/* Header with URL + regenerate */}
                    <div className={styles.proposalHeader}>
                      <div className={styles.pageUrl}>
                        {p.url ? (
                          <a href={p.url} target="_blank" rel="noopener noreferrer" className={styles.pageUrlLink} title={p.url}>
                            <bdi dir="ltr">{formatUrl(p.url)}</bdi>
                            <ExternalLink size={12} />
                          </a>
                        ) : (
                          <span>{p.page}</span>
                        )}
                      </div>
                      {!isSkeleton && !isSkipped && !allApplied && !appliedResult && (
                        <div className={styles.proposalActions}>
                          <button
                            className={styles.regenerateBtn}
                            onClick={() => handleRegenerate(idx)}
                            disabled={regeneratingIdx !== null || isApplying || applyingSingleIdx !== null}
                          >
                            {regeneratingIdx === idx
                              ? <Loader2 size={12} className={styles.spinning} />
                              : <RefreshCw size={12} />}
                            {t.fixRegenerate || 'Regenerate'}
                          </button>
                          <button
                            className={styles.applySingleBtn}
                            onClick={() => handleApplySingle(idx)}
                            disabled={regeneratingIdx !== null || isApplying || applyingSingleIdx !== null}
                          >
                            {applyingSingleIdx === idx
                              ? <Loader2 size={12} className={styles.spinning} />
                              : <CheckCircle2 size={12} />}
                            {applyingSingleIdx === idx
                              ? (t.fixApplyingItem || 'Applying...')
                              : (t.fixApplyItem || 'Apply')}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Keyword badge */}
                    {p.keyword && (
                      <div className={styles.keyword}>
                        <Search size={11} />
                        {p.keyword}
                      </div>
                    )}

                    {isSkeleton ? (
                      <div className={styles.skeletonFields}>
                        <div className={styles.seoField}>
                          <div className={styles.seoFieldLabel}>{t.fixFieldTitle || 'SEO Title'}</div>
                          <div className={styles.seoRow}>
                            <span className={`${styles.seoLabel} ${styles.labelNew}`}>{t.fixNew || 'New'}</span>
                            <span className={styles.skeletonBar} style={{ width: '75%' }} />
                          </div>
                        </div>
                        <div className={styles.seoField}>
                          <div className={styles.seoFieldLabel}>{t.fixFieldDesc || 'Meta Description'}</div>
                          <div className={styles.seoRow}>
                            <span className={`${styles.seoLabel} ${styles.labelNew}`}>{t.fixNew || 'New'}</span>
                            <span className={styles.skeletonBar} style={{ width: '90%' }} />
                          </div>
                          <div className={styles.seoRow} style={{ marginTop: '4px' }}>
                            <span style={{ minWidth: '40px' }} />
                            <span className={styles.skeletonBar} style={{ width: '60%' }} />
                          </div>
                        </div>
                      </div>
                    ) : isSkipped ? (
                      <div className={styles.skipReason}>{p.reason || t.fixSkipped || 'Skipped'}</div>
                    ) : (
                      <>
                        {/* SEO Title */}
                        <div className={styles.seoField}>
                          <div className={styles.seoFieldLabel}>{t.fixFieldTitle || 'SEO Title'}</div>
                          {p.current?.title && (
                            <div className={styles.seoRow}>
                              <span className={`${styles.seoLabel} ${styles.labelCurrent}`}>{t.fixCurrent || 'Now'}</span>
                              <span className={`${styles.seoText} ${styles.seoTextCurrent}`}>
                                {p.current.title}
                                <span className={styles.charCount}>({p.current.title.length})</span>
                              </span>
                            </div>
                          )}
                          {!p.current?.title && (
                            <div className={styles.seoRow}>
                              <span className={`${styles.seoLabel} ${styles.labelCurrent}`}>{t.fixCurrent || 'Now'}</span>
                              <span className={`${styles.seoText} ${styles.seoTextEmpty}`}>{t.fixEmpty || '(empty)'}</span>
                            </div>
                          )}
                          <div className={styles.seoRow}>
                            <span className={`${styles.seoLabel} ${styles.labelNew}`}>{t.fixNew || 'New'}</span>
                            {editingField?.idx === idx && editingField?.field === 'title' ? (
                              <span className={styles.editWrap}>
                                <input
                                  className={styles.editInput}
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') confirmEdit();
                                    else if (e.key === 'Escape') cancelEdit();
                                  }}
                                  autoFocus
                                />
                                <span className={styles.charCount}>({editValue.length})</span>
                                <button className={styles.editConfirmBtn} onClick={confirmEdit}><CheckCircle2 size={14} /></button>
                                <button className={styles.editCancelBtn} onClick={cancelEdit}><X size={14} /></button>
                              </span>
                            ) : (
                              <span className={styles.seoText}>
                                {p.proposed?.title}
                                <span className={styles.charCount}>({(p.proposed?.title || '').length})</span>
                                {!allApplied && (
                                  <button className={styles.editBtn} onClick={() => startEdit(idx, 'title')}>
                                    <Pencil size={11} />
                                  </button>
                                )}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* SEO Description */}
                        <div className={styles.seoField}>
                          <div className={styles.seoFieldLabel}>{t.fixFieldDesc || 'Meta Description'}</div>
                          {p.current?.description && (
                            <div className={styles.seoRow}>
                              <span className={`${styles.seoLabel} ${styles.labelCurrent}`}>{t.fixCurrent || 'Now'}</span>
                              <span className={`${styles.seoText} ${styles.seoTextCurrent}`}>
                                {p.current.description}
                                <span className={styles.charCount}>({p.current.description.length})</span>
                              </span>
                            </div>
                          )}
                          {!p.current?.description && (
                            <div className={styles.seoRow}>
                              <span className={`${styles.seoLabel} ${styles.labelCurrent}`}>{t.fixCurrent || 'Now'}</span>
                              <span className={`${styles.seoText} ${styles.seoTextEmpty}`}>{t.fixEmpty || '(empty)'}</span>
                            </div>
                          )}
                          <div className={styles.seoRow}>
                            <span className={`${styles.seoLabel} ${styles.labelNew}`}>{t.fixNew || 'New'}</span>
                            {editingField?.idx === idx && editingField?.field === 'description' ? (
                              <span className={styles.editWrap}>
                                <input
                                  className={styles.editInput}
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') confirmEdit();
                                    else if (e.key === 'Escape') cancelEdit();
                                  }}
                                  autoFocus
                                />
                                <span className={styles.charCount}>({editValue.length})</span>
                                <button className={styles.editConfirmBtn} onClick={confirmEdit}><CheckCircle2 size={14} /></button>
                                <button className={styles.editCancelBtn} onClick={cancelEdit}><X size={14} /></button>
                              </span>
                            ) : (
                              <span className={styles.seoText}>
                                {p.proposed?.description}
                                <span className={styles.charCount}>({(p.proposed?.description || '').length})</span>
                                {!allApplied && (
                                  <button className={styles.editBtn} onClick={() => startEdit(idx, 'description')}>
                                    <Pencil size={11} />
                                  </button>
                                )}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Per-item apply result */}
                        {appliedResult && (
                          <div className={`${styles.applyStatus} ${appliedResult.status === 'fixed' ? styles.applyStatusFixed : styles.applyStatusError}`}>
                            {appliedResult.status === 'fixed'
                              ? <><CheckCircle2 size={13} /> {t.fixItemApplied || 'Applied'}</>
                              : <><XCircle size={13} /> {appliedResult.reason || (t.fixItemFailed || 'Failed')}</>}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className={styles.footer}>
              <span className={styles.footerInfo}>
                {allApplied
                  ? (t.fixAllApplied || 'All changes applied!')
                  : isLoading && readyCount === 0
                    ? <><Loader2 size={13} className={styles.spinning} /> {t.fixGenerating || 'Generating AI suggestions...'}</>
                    : isLoading
                      ? <><Loader2 size={13} className={styles.spinning} /> {(t.fixReadyCount || '{count} changes ready').replace('{count}', readyCount)}</>
                      : (t.fixReadyCount || '{count} changes ready').replace('{count}', readyCount)}
              </span>
              <div className={styles.footerActions}>
                {!allApplied && (
                  <>
                    <button className={styles.cancelBtn} onClick={handleClose}>
                      {t.fixCancel || 'Cancel'}
                    </button>
                    <button
                      className={styles.applyBtn}
                      onClick={handleApply}
                      disabled={isApplying || readyCount === 0}
                    >
                      {isApplying
                        ? <><Loader2 size={15} className={styles.spinning} /> {t.fixApplying || 'Applying...'}</>
                        : <><Sparkles size={15} /> {t.fixApply || 'Apply Changes'}</>}
                    </button>
                  </>
                )}
                {allApplied && (
                  <button className={styles.applyBtn} onClick={handleClose}>
                    <CheckCircle2 size={15} />
                    {t.fixDone || 'Done'}
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {/* Empty state — no proposals */}
        {!isLoading && !error && proposals.length === 0 && (
          <div className={styles.loadingState}>
            <CheckCircle2 size={32} color="var(--success, #22c55e)" />
            <span>{t.fixNoItems || 'No items to fix.'}</span>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
