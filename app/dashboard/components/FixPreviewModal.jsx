'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Sparkles, Loader2, CheckCircle2, XCircle,
  RefreshCw, ExternalLink, Pencil, Search, AlertTriangle, Image as ImageIcon,
} from 'lucide-react';
import { useModalResize, ModalResizeButton } from '@/app/components/ui/ModalResizeButton';
import { Button } from '@/app/dashboard/components';
import styles from './FixPreviewModal.module.css';

/**
 * FixPreviewModal - Shows AI-generated SEO fix proposals with Preview → Approve → Apply flow.
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
  const dl = t.detailLabels || {}; // detailLabels for cannibalization
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
  const [editingField, setEditingField] = useState(null); // { idx, field, path? } - path for nested fields like 'mergedPageChanges.newTitle'
  const [editValue, setEditValue] = useState('');
  const [generateFeaturedImages, setGenerateFeaturedImages] = useState(true); // 1 AI credit per image
  const [contentImageCounts, setContentImageCounts] = useState({}); // { [proposalIdx]: count }
  const [featuredImagePrompts, setFeaturedImagePrompts] = useState({}); // { [proposalIdx]: string }
  const [contentImagesPrompts, setContentImagesPrompts] = useState({}); // { [proposalIdx]: string }

  // Detect if this is a cannibalization fix
  const isCannibalizationFix = insight?.titleKey?.includes('cannibalization');

  // Helper to get/set content image count for a proposal
  const getContentImageCount = (idx) => {
    if (contentImageCounts[idx] !== undefined) return contentImageCounts[idx];
    // Default to AI suggestion or 0
    const proposal = proposals[idx];
    return proposal?.recommendation?.mergedPageChanges?.suggestedContentImages || 0;
  };
  
  const setContentImageCount = (idx, count) => {
    const max = proposals[idx]?.recommendation?.mergedPageChanges?.suggestedContentImages || 3;
    setContentImageCounts(prev => ({ ...prev, [idx]: Math.min(Math.max(0, count), max) }));
  };

  // ─── Build skeleton proposals from insight data ──────────────

  const buildSkeletonProposals = useCallback(() => {
    if (!insight) return [];
    // Handle nested keys like 'agent.insights.cannibalization.semantic.title'
    let type = insight.titleKey?.match(/agent\.insights\.(\w+)\.title/)?.[1];
    // Handle nested cannibalization keys like 'agent.insights.cannibalization.proactive.title'
    if (!type && insight.titleKey?.includes('cannibalization')) {
      type = 'cannibalization';
    }

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

    if (type === 'lowCtrForPosition') {
      const pages = insight.data?.pages || [];
      const seen = new Set();
      const indicesToUse = itemIndices || pages.map((_, i) => i);
      const filteredPages = indicesToUse
        .map(i => ({ page: pages[i], realIndex: i }))
        .filter(({ page }) => {
          if (!page?.page) return false;
          const key = page.page.replace(/^https?:\/\//, '').replace(/\/$/, '');
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

      return filteredPages.map(({ page, realIndex }) => ({
        page: page.page || '',
        url: page.page,
        realIndex,
        status: 'loading',
        current: { title: '', description: '' },
        proposed: null,
      }));
    }

    if (type === 'cannibalization') {
      const issues = insight.data?.issues || [];
      const indicesToUse = itemIndices || issues.map((_, i) => i);
      
      return indicesToUse.map(i => {
        const issue = issues[i];
        if (!issue) return null;
        return {
          issueIndex: i,
          urlA: issue.urls?.[0] || '',
          urlB: issue.urls?.[1] || '',
          titleA: issue.entityA?.title || '',
          titleB: issue.entityB?.title || '',
          status: 'loading',
          isCannibalization: true,
          recommendation: null,
        };
      }).filter(Boolean);
    }

    return [];
  }, [insight, itemIndices]);

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

  // Helper to get unique key for tracking applied items
  const getProposalKey = (p) => p.isCannibalization ? `cann-${p.issueIndex}` : p.postId;

  const handleApplySingle = async (idx) => {
    const proposal = proposals[idx];
    if (!proposal || proposal.status !== 'ready') return;

    const key = getProposalKey(proposal);
    setApplyingSingleIdx(idx);
    try {
      // Add content image count and AI prompts to proposal
      const proposalWithOptions = {
        ...proposal,
        contentImageCount: getContentImageCount(idx),
        featuredImagePrompt: featuredImagePrompts[idx] || '',
        contentImagesPrompt: contentImagesPrompts[idx] || '',
      };
      const res = await fetch(`/api/agent/insights/${insightId}/fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          mode: 'apply', 
          proposals: [proposalWithOptions],
          generateFeaturedImages: isCannibalizationFix && generateFeaturedImages,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Apply failed');

      const itemResult = data.results?.[0];
      if (itemResult) {
        setAppliedItems(prev => ({ ...prev, [key]: itemResult }));
      }
      if (data.success && onApplied) onApplied();
    } catch (err) {
      console.error('[FixPreview] apply single error:', err);
      setAppliedItems(prev => ({ ...prev, [key]: { status: 'error', reason: err.message } }));
    } finally {
      setApplyingSingleIdx(null);
    }
  };

  // ─── Apply all proposals ────────────────────────────────────

  const handleApply = async () => {
    const readyProposals = proposals
      .map((p, idx) => ({ 
        ...p, 
        contentImageCount: getContentImageCount(idx),
        featuredImagePrompt: featuredImagePrompts[idx] || '',
        contentImagesPrompt: contentImagesPrompts[idx] || '',
      }))
      .filter(p => p.status === 'ready' && !appliedItems[getProposalKey(p)]);
    if (readyProposals.length === 0) return;

    setIsApplying(true);
    try {
      const res = await fetch(`/api/agent/insights/${insightId}/fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          mode: 'apply', 
          proposals: readyProposals,
          generateFeaturedImages: isCannibalizationFix && generateFeaturedImages,
        }),
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

  const startEdit = (idx, field, path = null) => {
    setEditingField({ idx, field, path });
    if (path) {
      // For nested paths like 'mergedPageChanges.newTitle' or 'pageAChanges.newTitle'
      const [parent, child] = path.split('.');
      setEditValue(proposals[idx]?.recommendation?.[parent]?.[child] || '');
    } else {
      setEditValue(proposals[idx]?.proposed?.[field] || '');
    }
  };

  const confirmEdit = () => {
    if (!editingField) return;
    const { idx, field, path } = editingField;
    
    if (path) {
      // For nested paths in recommendation
      const [parent, child] = path.split('.');
      setProposals(prev =>
        prev.map((p, i) => {
          if (i !== idx) return p;
          return {
            ...p,
            recommendation: {
              ...p.recommendation,
              [parent]: {
                ...p.recommendation?.[parent],
                [child]: editValue,
              },
            },
          };
        })
      );
    } else {
      setProposals(prev =>
        prev.map((p, i) =>
          i === idx ? { ...p, proposed: { ...p.proposed, [field]: editValue } } : p
        )
      );
    }
    setEditingField(null);
  };

  const cancelEdit = () => setEditingField(null);

  // ─── Helper: Format numbered instructions as list ───────────

  const formatInstructionsAsList = (text) => {
    if (!text) return null;
    // Check if the text has numbered items like "1. ... 2. ... 3. ..."
    const numberedPattern = /(\d+)\.\s+/g;
    const matches = text.match(numberedPattern);
    if (matches && matches.length > 1) {
      // Split by numbered pattern and filter empty strings
      const items = text.split(/\d+\.\s+/).filter(item => item.trim());
      return (
        <ol className={styles.instructionsList}>
          {items.map((item, i) => (
            <li key={i}>{item.trim()}</li>
          ))}
        </ol>
      );
    }
    // Check for bullet points
    const bulletPattern = /[•\-\*]\s+/g;
    const bulletMatches = text.match(bulletPattern);
    if (bulletMatches && bulletMatches.length > 1) {
      const items = text.split(/[•\-\*]\s+/).filter(item => item.trim());
      return (
        <ul className={styles.instructionsList}>
          {items.map((item, i) => (
            <li key={i}>{item.trim()}</li>
          ))}
        </ul>
      );
    }
    // Return as regular paragraph if no list pattern found
    return <p>{text}</p>;
  };

  // ─── Derived state ──────────────────────────────────────────

  const readyCount = proposals.filter(p => p.status === 'ready' && !appliedItems[getProposalKey(p)]).length;
  const allApplied = applyResults?.success ||
    (proposals.filter(p => p.status === 'ready').length > 0 &&
     proposals.filter(p => p.status === 'ready').every(p => {
       const result = appliedItems[getProposalKey(p)];
       return result?.status === 'fixed' || result?.status === 'manual_required';
     }));

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // ─── Render ─────────────────────────────────────────────────

  if (!open) return null;

  // Format URL for display - always show full URL with protocol, decoded for readability
  const formatUrl = (url) => {
    if (!url) return '';
    try {
      const u = new URL(url);
      const decodedPath = decodeURIComponent(u.pathname);
      return `${u.protocol}//${u.host}${decodedPath}`.replace(/\/$/, '');
    } catch {
      try { return decodeURIComponent(url); } catch { return url; }
    }
  };

  // Decode URL for display (tooltip, etc.)
  const decodeUrl = (url) => {
    try { return decodeURIComponent(url); } catch { return url; }
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

        {/* Loading - only show generic spinner when no skeleton proposals */}
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
                const proposalKey = getProposalKey(p);
                // For cannibalization, match by issueIndex; for regular proposals, match by postId
                const appliedResult = p.isCannibalization 
                  ? (applyResults?.results?.find(r => r.issueIndex === p.issueIndex) || appliedItems[proposalKey])
                  : (applyResults?.results?.find(r => r.postId === p.postId) || appliedItems[proposalKey]);

                return (
                  <div key={p.url || p.issueIndex || idx} className={`${styles.proposalItem} ${isSkipped ? styles.proposalItemSkipped : ''} ${p.isCannibalization ? styles.proposalItemCannibalization : ''}`}>
                    {/* Header with URL + regenerate */}
                    <div className={styles.proposalHeader}>
                      <div className={styles.pageUrl}>
                        {p.isCannibalization ? (
                          <span className={styles.cannibalizationLabel}>
                            {t.cannibalizationIssue || 'Cannibalization Issue'} #{(p.issueIndex ?? idx) + 1}
                          </span>
                        ) : p.url ? (
                          <a href={p.url} target="_blank" rel="noopener noreferrer" className={styles.pageUrlLink} title={decodeUrl(p.url)}>
                            <bdi dir="ltr">{formatUrl(p.url)}</bdi>
                            <ExternalLink size={12} />
                          </a>
                        ) : (
                          <span>{p.page}</span>
                        )}
                      </div>
                      {/* Removed proposalActions - regenerate/apply buttons moved to footer */}
                    </div>

                    {/* Keyword badge */}
                    {p.keyword && (
                      <div className={styles.keyword}>
                        <Search size={11} />
                        {p.keyword}
                      </div>
                    )}

                    {/* Cannibalization skeleton */}
                    {isSkeleton && p.isCannibalization ? (
                      <div className={styles.cannibalizationSkeleton}>
                        <div className={styles.cannibalizationPagesRow}>
                          <div className={styles.cannibalizationPage}>
                            <div className={styles.cannibalizationPageLabel}>{dl.pageA || 'Page A'}</div>
                            <span className={styles.skeletonBar} style={{ width: '80%', height: '14px' }} />
                            <span className={styles.skeletonBar} style={{ width: '60%', height: '12px', marginTop: '4px' }} />
                          </div>
                          <div className={styles.cannibalizationVs}>{t.vs || 'VS'}</div>
                          <div className={styles.cannibalizationPage}>
                            <div className={styles.cannibalizationPageLabel}>{dl.pageB || 'Page B'}</div>
                            <span className={styles.skeletonBar} style={{ width: '80%', height: '14px' }} />
                            <span className={styles.skeletonBar} style={{ width: '60%', height: '12px', marginTop: '4px' }} />
                          </div>
                        </div>
                        <div className={styles.seoField} style={{ marginTop: '12px' }}>
                          <span className={styles.skeletonBar} style={{ width: '40%', height: '16px' }} />
                          <span className={styles.skeletonBar} style={{ width: '90%', height: '12px', marginTop: '8px' }} />
                        </div>
                      </div>
                    ) : isSkeleton ? (
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
                    ) : p.isCannibalization ? (
                      /* Cannibalization content - showing both pages and AI recommendation */
                      <div className={styles.cannibalizationContent}>
                        {/* Recommendation badge */}
                        {p.recommendation?.recommendedAction && (
                          <div className={`${styles.cannibalizationActionBadge} ${styles['action' + p.recommendation.recommendedAction]}`}>
                            {p.recommendation.recommendedAction === 'DIFFERENTIATE' && (dl.actionDifferentiate || 'Differentiate')}
                            {p.recommendation.recommendedAction === 'MERGE' && (dl.actionMerge || 'Merge')}
                            {p.recommendation.recommendedAction === 'CANONICAL' && (dl.actionCanonical || 'Canonical')}
                            {p.recommendation.recommendedAction === '301_REDIRECT' && (dl.actionRedirect || '301 Redirect')}
                          </div>
                        )}

                        {/* Reasoning */}
                        {p.recommendation?.reasoning && (
                          <div className={styles.cannibalizationReasoning}>
                            {p.recommendation.reasoning}
                          </div>
                        )}

                        {/* Pages comparison grid */}
                        <div className={styles.cannibalizationPagesGrid}>
                          {/* Page A */}
                          <div className={styles.cannibalizationPageCard}>
                            <div className={styles.cannibalizationPageHeader}>
                              <span className={styles.cannibalizationPageTag}>A</span>
                              <a href={p.urlA} target="_blank" rel="noopener noreferrer" className={styles.cannibalizationPageUrl}>
                                <bdi dir="ltr">{formatUrl(p.urlA)}</bdi>
                                <ExternalLink size={11} />
                              </a>
                            </div>
                            <div className={styles.cannibalizationPageTitle}>{decodeUrl(p.titleA)}</div>
                            
                            {p.recommendation?.pageAChanges && (
                              <div className={styles.cannibalizationChanges}>
                                <div className={styles.cannibalizationChangeItem}>
                                  <span className={styles.cannibalizationChangeLabel}>{t.fixFieldTitle || 'SEO Title'}</span>
                                  <span className={styles.cannibalizationChangeValue}>{p.recommendation.pageAChanges.newTitle}</span>
                                </div>
                                <div className={styles.cannibalizationChangeItem}>
                                  <span className={styles.cannibalizationChangeLabel}>{t.fixFieldDesc || 'Description'}</span>
                                  <span className={styles.cannibalizationChangeValue}>{p.recommendation.pageAChanges.newDescription}</span>
                                </div>
                                <div className={styles.cannibalizationChangeItem}>
                                  <span className={styles.cannibalizationChangeLabel}>{dl.focusKeyword || 'Focus Keyword'}</span>
                                  <span className={`${styles.cannibalizationChangeValue} ${styles.cannibalizationKeyword}`}>{p.recommendation.pageAChanges.newFocusKeyword}</span>
                                </div>
                                <div className={styles.cannibalizationChangeItem}>
                                  <span className={styles.cannibalizationChangeLabel}>{dl.targetAngle || 'Target Angle'}</span>
                                  <span className={styles.cannibalizationChangeValue}>{p.recommendation.pageAChanges.targetAngle}</span>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Page B */}
                          <div className={styles.cannibalizationPageCard}>
                            <div className={styles.cannibalizationPageHeader}>
                              <span className={styles.cannibalizationPageTag}>B</span>
                              <a href={p.urlB} target="_blank" rel="noopener noreferrer" className={styles.cannibalizationPageUrl}>
                                <bdi dir="ltr">{formatUrl(p.urlB)}</bdi>
                                <ExternalLink size={11} />
                              </a>
                            </div>
                            <div className={styles.cannibalizationPageTitle}>{decodeUrl(p.titleB)}</div>
                            
                            {p.recommendation?.pageBChanges && (
                              <div className={styles.cannibalizationChanges}>
                                <div className={styles.cannibalizationChangeItem}>
                                  <span className={styles.cannibalizationChangeLabel}>{t.fixFieldTitle || 'SEO Title'}</span>
                                  <span className={styles.cannibalizationChangeValue}>{p.recommendation.pageBChanges.newTitle}</span>
                                </div>
                                <div className={styles.cannibalizationChangeItem}>
                                  <span className={styles.cannibalizationChangeLabel}>{t.fixFieldDesc || 'Description'}</span>
                                  <span className={styles.cannibalizationChangeValue}>{p.recommendation.pageBChanges.newDescription}</span>
                                </div>
                                <div className={styles.cannibalizationChangeItem}>
                                  <span className={styles.cannibalizationChangeLabel}>{dl.focusKeyword || 'Focus Keyword'}</span>
                                  <span className={`${styles.cannibalizationChangeValue} ${styles.cannibalizationKeyword}`}>{p.recommendation.pageBChanges.newFocusKeyword}</span>
                                </div>
                                <div className={styles.cannibalizationChangeItem}>
                                  <span className={styles.cannibalizationChangeLabel}>{dl.targetAngle || 'Target Angle'}</span>
                                  <span className={styles.cannibalizationChangeValue}>{p.recommendation.pageBChanges.targetAngle}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Merged Page SEO Preview - for MERGE action */}
                        {p.recommendation?.recommendedAction === 'MERGE' && p.recommendation?.mergedPageChanges && (
                          <div className={styles.mergedPagePreview}>
                            <div className={styles.mergedPageHeader}>
                              <Sparkles size={14} />
                              <span>{dl.mergedPagePreview || 'Merged Page Preview'}</span>
                            </div>
                            
                            {/* Posts to Merge Summary */}
                            <div className={styles.postsToMergeSummary}>
                              <div className={styles.postsToMergeLabel}>{dl.postsToMerge || 'Posts to Merge'}</div>
                              <div className={styles.postsToMergeGrid}>
                                <div className={styles.postSummaryCard}>
                                  <span className={styles.postSummaryTag}>A</span>
                                  <div className={styles.postSummaryTitle}>{decodeUrl(p.titleA)}</div>
                                  {p.recommendation.pageAChanges && (
                                    <div className={styles.postSummaryMeta}>
                                      <div className={styles.postSummaryMetaItem}>
                                        <span className={styles.metaLabel}>{t.fixFieldTitle || 'Title'}:</span>
                                        <span className={styles.metaValue}>{p.recommendation.pageAChanges.currentTitle || '-'}</span>
                                      </div>
                                      <div className={styles.postSummaryMetaItem}>
                                        <span className={styles.metaLabel}>{dl.focusKeyword || 'Keyword'}:</span>
                                        <span className={styles.metaValue}>{p.recommendation.pageAChanges.currentKeyword || '-'}</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                                <div className={styles.postSummaryCard}>
                                  <span className={styles.postSummaryTag}>B</span>
                                  <div className={styles.postSummaryTitle}>{decodeUrl(p.titleB)}</div>
                                  {p.recommendation.pageBChanges && (
                                    <div className={styles.postSummaryMeta}>
                                      <div className={styles.postSummaryMetaItem}>
                                        <span className={styles.metaLabel}>{t.fixFieldTitle || 'Title'}:</span>
                                        <span className={styles.metaValue}>{p.recommendation.pageBChanges.currentTitle || '-'}</span>
                                      </div>
                                      <div className={styles.postSummaryMetaItem}>
                                        <span className={styles.metaLabel}>{dl.focusKeyword || 'Keyword'}:</span>
                                        <span className={styles.metaValue}>{p.recommendation.pageBChanges.currentKeyword || '-'}</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                            
                            {/* Article Type Badge */}
                            {p.recommendation.mergedPageChanges.articleType && (
                              <div className={styles.articleTypeBadgeRow}>
                                <span className={styles.articleTypeLabel}>{dl.articleType || 'Article Type'}:</span>
                                <span className={styles.articleTypeBadge}>
                                  {dl.articleTypes?.[p.recommendation.mergedPageChanges.articleType] || p.recommendation.mergedPageChanges.articleType}
                                </span>
                              </div>
                            )}
                            
                            {/* Editable SEO Fields */}
                            <div className={styles.mergedPageFields}>
                              {/* SEO Title */}
                              <div className={styles.mergedPageField}>
                                <div className={styles.mergedPageFieldHeader}>
                                  <span className={styles.mergedPageFieldLabel}>{t.fixFieldTitle || 'SEO Title'}</span>
                                  {!appliedResult && (
                                    <button 
                                      className={styles.editFieldBtn}
                                      onClick={() => startEdit(idx, 'newTitle', 'mergedPageChanges.newTitle')}
                                      disabled={editingField !== null}
                                    >
                                      <Pencil size={11} />
                                    </button>
                                  )}
                                </div>
                                {editingField?.idx === idx && editingField?.path === 'mergedPageChanges.newTitle' ? (
                                  <div className={styles.editWrap}>
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
                                  </div>
                                ) : (
                                  <div className={styles.mergedPageFieldValue}>
                                    {p.recommendation.mergedPageChanges.newTitle}
                                    <span className={styles.charCount}>({p.recommendation.mergedPageChanges.newTitle?.length || 0})</span>
                                  </div>
                                )}
                              </div>
                              
                              {/* Meta Description */}
                              <div className={styles.mergedPageField}>
                                <div className={styles.mergedPageFieldHeader}>
                                  <span className={styles.mergedPageFieldLabel}>{t.fixFieldDesc || 'Meta Description'}</span>
                                  {!appliedResult && (
                                    <button 
                                      className={styles.editFieldBtn}
                                      onClick={() => startEdit(idx, 'newDescription', 'mergedPageChanges.newDescription')}
                                      disabled={editingField !== null}
                                    >
                                      <Pencil size={11} />
                                    </button>
                                  )}
                                </div>
                                {editingField?.idx === idx && editingField?.path === 'mergedPageChanges.newDescription' ? (
                                  <div className={styles.editWrap}>
                                    <textarea
                                      className={styles.editTextarea}
                                      value={editValue}
                                      onChange={(e) => setEditValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirmEdit(); }
                                        else if (e.key === 'Escape') cancelEdit();
                                      }}
                                      autoFocus
                                      rows={3}
                                    />
                                    <span className={styles.charCount}>({editValue.length})</span>
                                    <button className={styles.editConfirmBtn} onClick={confirmEdit}><CheckCircle2 size={14} /></button>
                                    <button className={styles.editCancelBtn} onClick={cancelEdit}><X size={14} /></button>
                                  </div>
                                ) : (
                                  <div className={styles.mergedPageFieldValue}>
                                    {p.recommendation.mergedPageChanges.newDescription}
                                    <span className={styles.charCount}>({p.recommendation.mergedPageChanges.newDescription?.length || 0})</span>
                                  </div>
                                )}
                              </div>
                              
                              {/* Focus Keyword */}
                              <div className={styles.mergedPageField}>
                                <div className={styles.mergedPageFieldHeader}>
                                  <span className={styles.mergedPageFieldLabel}>{dl.focusKeyword || 'Focus Keyword'}</span>
                                  {!appliedResult && (
                                    <button 
                                      className={styles.editFieldBtn}
                                      onClick={() => startEdit(idx, 'newFocusKeyword', 'mergedPageChanges.newFocusKeyword')}
                                      disabled={editingField !== null}
                                    >
                                      <Pencil size={11} />
                                    </button>
                                  )}
                                </div>
                                {editingField?.idx === idx && editingField?.path === 'mergedPageChanges.newFocusKeyword' ? (
                                  <div className={styles.editWrap}>
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
                                    <button className={styles.editConfirmBtn} onClick={confirmEdit}><CheckCircle2 size={14} /></button>
                                    <button className={styles.editCancelBtn} onClick={cancelEdit}><X size={14} /></button>
                                  </div>
                                ) : (
                                  <div className={`${styles.mergedPageFieldValue} ${styles.keywordValue}`}>
                                    {p.recommendation.mergedPageChanges.newFocusKeyword}
                                  </div>
                                )}
                              </div>
                              
                              {/* Target Angle / Intent */}
                              <div className={styles.mergedPageField}>
                                <div className={styles.mergedPageFieldHeader}>
                                  <span className={styles.mergedPageFieldLabel}>{dl.targetAngle || 'Target Intent'}</span>
                                  {!appliedResult && (
                                    <button 
                                      className={styles.editFieldBtn}
                                      onClick={() => startEdit(idx, 'targetAngle', 'mergedPageChanges.targetAngle')}
                                      disabled={editingField !== null}
                                    >
                                      <Pencil size={11} />
                                    </button>
                                  )}
                                </div>
                                {editingField?.idx === idx && editingField?.path === 'mergedPageChanges.targetAngle' ? (
                                  <div className={styles.editWrap}>
                                    <textarea
                                      className={styles.editTextarea}
                                      value={editValue}
                                      onChange={(e) => setEditValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirmEdit(); }
                                        else if (e.key === 'Escape') cancelEdit();
                                      }}
                                      autoFocus
                                      rows={2}
                                    />
                                    <button className={styles.editConfirmBtn} onClick={confirmEdit}><CheckCircle2 size={14} /></button>
                                    <button className={styles.editCancelBtn} onClick={cancelEdit}><X size={14} /></button>
                                  </div>
                                ) : (
                                  <div className={styles.mergedPageFieldValue}>
                                    {p.recommendation.mergedPageChanges.targetAngle}
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            {/* Content Images Selector with Range Input */}
                            {!appliedResult && (
                              <div className={styles.contentImagesSelector}>
                                <div className={styles.contentImagesSelectorHeader}>
                                  <span className={styles.contentImagesSelectorLabel}>
                                    <ImageIcon size={14} />
                                    {dl.contentImagesToGenerate || 'Content images to generate'}
                                  </span>
                                  <div className={styles.contentImagesSelectorControls}>
                                    <input
                                      type="range"
                                      min="0"
                                      max={p.recommendation.mergedPageChanges.suggestedContentImages || 5}
                                      value={getContentImageCount(idx)}
                                      onChange={(e) => setContentImageCount(idx, parseInt(e.target.value, 10))}
                                      className={styles.rangeInput}
                                    />
                                    <span className={styles.countValue}>{getContentImageCount(idx)}</span>
                                    <span className={styles.countLimit}>
                                      / {p.recommendation.mergedPageChanges.suggestedContentImages || 5}
                                    </span>
                                    <span className={styles.contentImagesCost}>
                                      ({getContentImageCount(idx)} {t.creditPerImage || 'credit/image'})
                                    </span>
                                  </div>
                                </div>
                                
                                {/* AI Prompt for Content Images - Only show if count > 0 */}
                                {getContentImageCount(idx) > 0 && (
                                  <div className={styles.aiPromptSection}>
                                    <label className={styles.aiPromptLabel}>
                                      {dl.contentImagesPrompt || 'Content Images Instructions (optional)'}
                                    </label>
                                    <textarea
                                      className={styles.aiPromptInput}
                                      placeholder={dl.aiPromptPlaceholder || 'Describe what the AI should generate...'}
                                      value={contentImagesPrompts[idx] || ''}
                                      onChange={(e) => setContentImagesPrompts(prev => ({ ...prev, [idx]: e.target.value }))}
                                      rows={2}
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                            
                            {/* Featured Image Option with AI Prompt */}
                            {!appliedResult && (
                              <div className={styles.featuredImageSection}>
                                <label className={styles.generateImagesOption}>
                                  <input
                                    type="checkbox"
                                    checked={generateFeaturedImages}
                                    onChange={(e) => setGenerateFeaturedImages(e.target.checked)}
                                  />
                                  <span>{t.generateFeaturedImages || 'Generate unique featured image'}</span>
                                  <span className={styles.creditCostInline}>1 {t.creditPerImage || 'credit'}</span>
                                </label>
                                
                                {/* AI Prompt for Featured Image - Only show if checked */}
                                {generateFeaturedImages && (
                                  <div className={styles.aiPromptSection}>
                                    <label className={styles.aiPromptLabel}>
                                      {dl.featuredImagePrompt || 'Featured Image Instructions (optional)'}
                                    </label>
                                    <textarea
                                      className={styles.aiPromptInput}
                                      placeholder={dl.aiPromptPlaceholder || 'Describe what the AI should generate...'}
                                      value={featuredImagePrompts[idx] || ''}
                                      onChange={(e) => setFeaturedImagePrompts(prev => ({ ...prev, [idx]: e.target.value }))}
                                      rows={2}
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Merge instructions or canonical target */}
                        {p.recommendation?.mergeInstructions && (
                          <div className={styles.cannibalizationInstructions}>
                            <strong>{dl.mergeInstructions || 'Merge Instructions'}:</strong>
                            {formatInstructionsAsList(p.recommendation.mergeInstructions)}
                          </div>
                        )}
                        {p.recommendation?.canonicalTarget && (
                          <div className={styles.cannibalizationInstructions}>
                            <strong>{dl.canonicalTarget || 'Canonical Target'}:</strong>
                            <a href={p.recommendation.canonicalTarget} target="_blank" rel="noopener noreferrer">
                              <bdi dir="ltr">{formatUrl(p.recommendation.canonicalTarget)}</bdi>
                            </a>
                          </div>
                        )}

                        {/* Per-item apply result */}
                        {appliedResult && (
                          <div className={`${styles.applyStatus} ${appliedResult.status === 'fixed' ? styles.applyStatusFixed : appliedResult.status === 'manual_required' ? styles.applyStatusManual : styles.applyStatusError}`}>
                            {appliedResult.status === 'fixed'
                              ? <><CheckCircle2 size={13} /> {t.fixItemApplied || 'Applied'}</>
                              : appliedResult.status === 'manual_required'
                                ? <><AlertTriangle size={13} /> {dl.manualRequired || 'Manual action required'}</>
                                : <><XCircle size={13} /> {appliedResult.reason || (t.fixItemFailed || 'Failed')}</>}
                          </div>
                        )}
                      </div>
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
              <div className={styles.footerBottom}>
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
                      <Button onClick={handleClose}>
                        {t.fixCancel || 'Cancel'}
                      </Button>
                      <Button
                        variant="primary"
                        onClick={handleApply}
                        disabled={isApplying || readyCount === 0}
                      >
                        {isApplying
                          ? <><Loader2 size={15} className={styles.spinning} /> {dl.generating || 'Generating...'}</>
                          : isCannibalizationFix && proposals.some(p => p.recommendation?.recommendedAction === 'MERGE')
                            ? <><Sparkles size={15} /> {dl.generateContent || 'Generate Content'}</>
                            : <><Sparkles size={15} /> {t.fixApply || 'Apply Changes'}</>}
                      </Button>
                    </>
                  )}
                  {allApplied && (
                    <Button variant="primary" onClick={handleClose}>
                      <CheckCircle2 size={15} />
                      {t.fixDone || 'Done'}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Empty state - no proposals */}
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
