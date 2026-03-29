'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TiptapLink from '@tiptap/extension-link';
import TiptapUnderline from '@tiptap/extension-underline';
import TiptapPlaceholder from '@tiptap/extension-placeholder';
import TiptapImage from '@tiptap/extension-image';
import {
  X, Sparkles, Loader2, CheckCircle2, XCircle,
  RefreshCw, ExternalLink, Pencil, Search, AlertTriangle, Image as ImageIcon, ChevronDown, Send,
  Eye, Edit3, AlignLeft, Bold, Italic, Underline as UnderlineIcon, List, ListOrdered,
  Link as LinkIcon, Unlink, Heading2, Heading3, Heading4, Heading5, Heading6,
  GripVertical, Check,
} from 'lucide-react';
import { useModalResize, ModalResizeButton } from '@/app/components/ui/ModalResizeButton';
import { Button } from '@/app/dashboard/components';
import styles from './FixPreviewModal.module.css';

// Article type definitions with word count limits
const ARTICLE_TYPES = [
  { id: 'SEO', minWords: 1500, maxWords: 3000 },
  { id: 'BLOG_POST', minWords: 800, maxWords: 2000 },
  { id: 'GUIDE', minWords: 2000, maxWords: 5000 },
  { id: 'HOW_TO', minWords: 1000, maxWords: 2500 },
  { id: 'LISTICLE', minWords: 800, maxWords: 2000 },
  { id: 'COMPARISON', minWords: 1200, maxWords: 3000 },
  { id: 'REVIEW', minWords: 1000, maxWords: 2500 },
  { id: 'NEWS', minWords: 400, maxWords: 1000 },
  { id: 'TUTORIAL', minWords: 1500, maxWords: 4000 },
  { id: 'CASE_STUDY', minWords: 1200, maxWords: 3000 },
];

const ARTICLE_TYPE_KEY_MAP = {
  SEO: 'seo',
  BLOG_POST: 'blogPost',
  GUIDE: 'guide',
  HOW_TO: 'howTo',
  LISTICLE: 'listicle',
  COMPARISON: 'comparison',
  REVIEW: 'review',
  NEWS: 'news',
  TUTORIAL: 'tutorial',
  CASE_STUDY: 'caseStudy',
};

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
  const [wordCounts, setWordCounts] = useState({}); // { [proposalIdx]: number }
  const [selectedArticleTypes, setSelectedArticleTypes] = useState({}); // { [proposalIdx]: string }
  const [mergeInstructions, setMergeInstructions] = useState({}); // { [proposalIdx]: string }
  
  // Preview step for generated content
  const [showPreview, setShowPreview] = useState(false);
  const [generatedContent, setGeneratedContent] = useState(null); // { idx, post: { title, html, ... } }
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingStep, setGeneratingStep] = useState(0);

  // Detect if this is a cannibalization fix
  const isCannibalizationFix = insight?.titleKey?.includes('cannibalization');

  // Progress messages for generating state
  const generatingProgressKeys = ['analyzingContent', 'mergingContent', 'optimizingSeo', 'generatingImages', 'finalizingArticle', 'almostDone'];

  // Cycle through generating progress messages
  useEffect(() => {
    if (!isGenerating) { setGeneratingStep(0); return; }
    const interval = setInterval(() => {
      setGeneratingStep(prev => (prev + 1) % generatingProgressKeys.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [isGenerating]); // eslint-disable-line react-hooks/exhaustive-deps

  // Get article type definition
  const getArticleTypeDef = (typeId) => ARTICLE_TYPES.find(at => at.id === typeId);

  // Calculate max content images based on word count (1 image per 500 words)
  const getMaxContentImages = (idx) => {
    const wc = wordCounts[idx] || 2000;
    return Math.max(1, Math.floor(wc / 500));
  };

  // Helper to get/set content image count for a proposal
  const getContentImageCount = (idx) => {
    if (contentImageCounts[idx] !== undefined) return contentImageCounts[idx];
    // Default to 2 or max whichever is lower
    return Math.min(2, getMaxContentImages(idx));
  };
  
  const setContentImageCount = (idx, count) => {
    const max = getMaxContentImages(idx);
    setContentImageCounts(prev => ({ ...prev, [idx]: Math.min(Math.max(0, count), max) }));
  };

  // Get word count for a proposal
  const getWordCount = (idx) => {
    if (wordCounts[idx] !== undefined) return wordCounts[idx];
    const proposal = proposals[idx];
    const typeId = selectedArticleTypes[idx] || proposal?.recommendation?.mergedPageChanges?.articleType || 'SEO';
    const typeDef = getArticleTypeDef(typeId);
    return typeDef ? Math.floor((typeDef.minWords + typeDef.maxWords) / 2) : 2000;
  };

  // Get selected article type for a proposal
  const getSelectedArticleType = (idx) => {
    if (selectedArticleTypes[idx]) return selectedArticleTypes[idx];
    const proposal = proposals[idx];
    return proposal?.recommendation?.mergedPageChanges?.articleType || 'SEO';
  };

  // Format merge instructions as a bulleted list
  const formatMergeInstructionsAsList = (instructions) => {
    if (!instructions) return '';
    // If already formatted with bullets or numbers, return as-is
    if (/^[\s]*[•\-\d\.]/m.test(instructions)) return instructions;
    // Split by common delimiters and format as bullets
    const parts = instructions.split(/[;,]|\n/).map(s => s.trim()).filter(Boolean);
    if (parts.length <= 1) return `• ${instructions.trim()}`;
    return parts.map(part => `• ${part}`).join('\n');
  };
  
  // Get merge instructions for a proposal  
  const getMergeInstructions = (idx) => {
    if (mergeInstructions[idx] !== undefined) return mergeInstructions[idx];
    const proposal = proposals[idx];
    const raw = proposal?.recommendation?.mergeInstructions || '';
    return formatMergeInstructionsAsList(raw);
  };

  // Initialize settings when proposals load
  useEffect(() => {
    proposals.forEach((p, idx) => {
      if (p.recommendation?.mergedPageChanges?.articleType) {
        setSelectedArticleTypes(prev => {
          if (prev[idx]) return prev; // already initialized for this idx
          const typeId = p.recommendation.mergedPageChanges.articleType;
          return { ...prev, [idx]: typeId };
        });
        const typeId = p.recommendation.mergedPageChanges.articleType;
        const typeDef = getArticleTypeDef(typeId);
        if (typeDef) {
          setWordCounts(prev => {
            if (prev[idx] !== undefined) return prev;
            return { ...prev, [idx]: Math.floor((typeDef.minWords + typeDef.maxWords) / 2) };
          });
        }
      }
      if (p.recommendation?.mergedPageChanges?.suggestedContentImages !== undefined) {
        setContentImageCounts(prev => {
          if (prev[idx] !== undefined) return prev;
          return { ...prev, [idx]: p.recommendation.mergedPageChanges.suggestedContentImages };
        });
      }
      if (p.recommendation?.mergeInstructions) {
        setMergeInstructions(prev => {
          if (prev[idx] !== undefined) return prev;
          return { ...prev, [idx]: formatMergeInstructionsAsList(p.recommendation.mergeInstructions) };
        });
      }
    });
  }, [proposals]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // Reset all form state for a clean session
    setSelectedArticleTypes({});
    setWordCounts({});
    setMergeInstructions({});
    setContentImageCounts({});
    setFeaturedImagePrompts({});
    setContentImagesPrompts({});
    setGenerateFeaturedImages(true);
    setShowPreview(false);
    setGeneratedContent(null);
    setEditingField(null);

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

  // Handle generate content - for MERGE actions, first generate then show preview
  const handleGenerateContent = async () => {
    const readyProposals = proposals
      .map((p, idx) => ({ 
        ...p, 
        proposalIdx: idx,
        contentImageCount: getContentImageCount(idx),
        featuredImagePrompt: featuredImagePrompts[idx] || '',
        contentImagesPrompt: contentImagesPrompts[idx] || '',
        wordCount: getWordCount(idx),
        articleType: getSelectedArticleType(idx),
        mergeInstructions: getMergeInstructions(idx),
      }))
      .filter(p => p.status === 'ready' && !appliedItems[getProposalKey(p)] && p.recommendation?.recommendedAction === 'MERGE');
    
    if (readyProposals.length === 0) {
      // No merge proposals, use original apply flow
      handleApply();
      return;
    }

    // Generate content for the first merge proposal
    const proposal = readyProposals[0];
    setIsGenerating(true);
    setError(null);

    try {
      const res = await fetch(`/api/agent/insights/${insightId}/fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          mode: 'generate',
          proposal,
          generateFeaturedImages: generateFeaturedImages,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      
      setGeneratedContent({
        idx: proposal.proposalIdx,
        post: data.post,
        proposal,
      });
      setShowPreview(true);
    } catch (err) {
      console.error('[FixPreview] generate error:', err);
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // Apply the generated content after preview
  const handleApplyGeneratedContent = async () => {
    if (!generatedContent) return;
    
    setIsApplying(true);
    try {
      const res = await fetch(`/api/agent/insights/${insightId}/fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          mode: 'apply-generated',
          proposal: generatedContent.proposal,
          generatedPost: generatedContent.post,
          generateFeaturedImages: generateFeaturedImages,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Apply failed');
      
      setApplyResults(data);
      setShowPreview(false);
      setGeneratedContent(null);
      if (data.success && onApplied) onApplied();
    } catch (err) {
      console.error('[FixPreview] apply generated error:', err);
      setApplyResults({ success: false, error: err.message });
    } finally {
      setIsApplying(false);
    }
  };

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
    // Return as regular paragraph with preserved line breaks
    return <p style={{ whiteSpace: 'pre-wrap' }}>{text}</p>;
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

        {/* Preview of generated content */}
        {showPreview && generatedContent && (
          <ContentPreview
            generatedContent={generatedContent}
            setGeneratedContent={setGeneratedContent}
            setShowPreview={setShowPreview}
            handleApplyGeneratedContent={handleApplyGeneratedContent}
            isApplying={isApplying}
            t={t}
            dl={dl}
            styles={styles}
          />
        )}

        {/* Generating content loading state */}
        {isGenerating && !showPreview && (
          <div className={styles.generatingState}>
            <div className={styles.generatingAnimation}>
              <Sparkles size={32} className={styles.generatingIcon} />
            </div>
            <h4 className={styles.generatingTitle}>{dl.generating || 'Generating...'}</h4>
            <p className={styles.generatingMessage} key={generatingStep}>
              {dl.generatingProgress?.[generatingProgressKeys[generatingStep]] || generatingProgressKeys[generatingStep]}
            </p>
            <div className={styles.generatingSteps}>
              {generatingProgressKeys.map((_, i) => (
                <div 
                  key={i}
                  className={`${styles.generatingDot} ${i <= generatingStep ? styles.generatingDotActive : ''}`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Proposals list */}
        {!error && proposals.length > 0 && !showPreview && !isGenerating && (
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
                                {p.recommendation.recommendedAction === 'DIFFERENTIATE' && (
                                  <div className={styles.cannibalizationChangeItem}>
                                    <span className={styles.cannibalizationChangeLabel}>{t.fixFieldTitle || 'SEO Title'}</span>
                                    <span className={styles.cannibalizationChangeValue}>{p.recommendation.pageAChanges.newTitle}</span>
                                  </div>
                                )}
                                {p.recommendation.recommendedAction === 'DIFFERENTIATE' && (
                                  <div className={styles.cannibalizationChangeItem}>
                                    <span className={styles.cannibalizationChangeLabel}>{t.fixFieldDesc || 'Description'}</span>
                                    <span className={styles.cannibalizationChangeValue}>{p.recommendation.pageAChanges.newDescription}</span>
                                  </div>
                                )}
                                <div className={styles.cannibalizationChangeItem}>
                                  <span className={styles.cannibalizationChangeLabel}>{dl.focusKeyword || 'Focus Keyword'}</span>
                                  <span className={`${styles.cannibalizationChangeValue} ${styles.cannibalizationKeyword}`}>{p.recommendation.pageAChanges.newFocusKeyword}</span>
                                </div>
                                <div className={styles.cannibalizationChangeItem}>
                                  <span className={styles.cannibalizationChangeLabel}>{dl.searchIntent || 'Search Intent'}</span>
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
                                {p.recommendation.recommendedAction === 'DIFFERENTIATE' && (
                                  <div className={styles.cannibalizationChangeItem}>
                                    <span className={styles.cannibalizationChangeLabel}>{t.fixFieldTitle || 'SEO Title'}</span>
                                    <span className={styles.cannibalizationChangeValue}>{p.recommendation.pageBChanges.newTitle}</span>
                                  </div>
                                )}
                                {p.recommendation.recommendedAction === 'DIFFERENTIATE' && (
                                  <div className={styles.cannibalizationChangeItem}>
                                    <span className={styles.cannibalizationChangeLabel}>{t.fixFieldDesc || 'Description'}</span>
                                    <span className={styles.cannibalizationChangeValue}>{p.recommendation.pageBChanges.newDescription}</span>
                                  </div>
                                )}
                                <div className={styles.cannibalizationChangeItem}>
                                  <span className={styles.cannibalizationChangeLabel}>{dl.focusKeyword || 'Focus Keyword'}</span>
                                  <span className={`${styles.cannibalizationChangeValue} ${styles.cannibalizationKeyword}`}>{p.recommendation.pageBChanges.newFocusKeyword}</span>
                                </div>
                                <div className={styles.cannibalizationChangeItem}>
                                  <span className={styles.cannibalizationChangeLabel}>{dl.searchIntent || 'Search Intent'}</span>
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
                            
                            {/* Article Type Selector */}
                            {!appliedResult && (
                              <div className={styles.articleTypeSelector}>
                                <label className={styles.settingLabel}>{dl.articleType || 'Article Type'}</label>
                                <div className={styles.selectWrapper}>
                                  <select
                                    className={styles.articleTypeSelect}
                                    value={getSelectedArticleType(idx)}
                                    onChange={(e) => {
                                      const typeId = e.target.value;
                                      setSelectedArticleTypes(prev => ({ ...prev, [idx]: typeId }));
                                      const typeDef = getArticleTypeDef(typeId);
                                      if (typeDef) {
                                        const newWordCount = Math.floor((typeDef.minWords + typeDef.maxWords) / 2);
                                        setWordCounts(prev => ({ ...prev, [idx]: newWordCount }));
                                      }
                                    }}
                                  >
                                    {ARTICLE_TYPES.map(at => (
                                      <option key={at.id} value={at.id}>
                                        {dl.articleTypes?.[ARTICLE_TYPE_KEY_MAP[at.id]] || at.id}
                                      </option>
                                    ))}
                                  </select>
                                  <ChevronDown size={14} className={styles.selectIcon} />
                                </div>
                              </div>
                            )}
                            
                            {/* Word Count Slider */}
                            {!appliedResult && (() => {
                              const typeId = getSelectedArticleType(idx);
                              const typeDef = getArticleTypeDef(typeId);
                              if (!typeDef) return null;
                              const wc = getWordCount(idx);
                              return (
                                <div className={styles.wordCountSelector}>
                                  <div className={styles.wordCountHeader}>
                                    <label className={styles.settingLabel}>{dl.wordCount || 'Content Length'}</label>
                                    <span className={styles.wordCountRange}>
                                      ({typeDef.minWords.toLocaleString()} - {typeDef.maxWords.toLocaleString()} {dl.words || 'words'})
                                    </span>
                                  </div>
                                  <div className={styles.wordCountControls}>
                                    <input
                                      type="range"
                                      min={typeDef.minWords}
                                      max={typeDef.maxWords}
                                      step={100}
                                      value={wc}
                                      onChange={(e) => setWordCounts(prev => ({ ...prev, [idx]: parseInt(e.target.value, 10) }))}
                                      className={styles.rangeInput}
                                    />
                                    <input
                                      type="number"
                                      className={styles.wordCountInput}
                                      min={typeDef.minWords}
                                      max={typeDef.maxWords}
                                      value={wc}
                                      onChange={(e) => setWordCounts(prev => ({ ...prev, [idx]: parseInt(e.target.value, 10) || typeDef.minWords }))}
                                    />
                                    <span className={styles.wordCountUnit}>{dl.words || 'words'}</span>
                                  </div>
                                </div>
                              );
                            })()}
                            
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
                              
                              {/* Search Intent */}
                              <div className={styles.mergedPageField}>
                                <div className={styles.mergedPageFieldHeader}>
                                  <span className={styles.mergedPageFieldLabel}>{dl.searchIntent || 'Search Intent'}</span>
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
                            {!appliedResult && (() => {
                              const maxImages = getMaxContentImages(idx);
                              return (
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
                                        max={maxImages}
                                        value={Math.min(getContentImageCount(idx), maxImages)}
                                        onChange={(e) => setContentImageCount(idx, parseInt(e.target.value, 10))}
                                        className={styles.rangeInput}
                                      />
                                      <span className={styles.countValue}>{Math.min(getContentImageCount(idx), maxImages)}</span>
                                      <span className={styles.countLimit}>
                                        / {maxImages}
                                      </span>
                                      <span className={styles.contentImagesCost}>
                                        ({Math.min(getContentImageCount(idx), maxImages)} {Math.min(getContentImageCount(idx), maxImages) === 1 ? (dl.credit || 'credit') : (dl.credits || 'credits')})
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
                              );
                            })()}
                            
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
                            
                            {/* Editable Merge Instructions */}
                            {!appliedResult && (
                              <div className={styles.mergeInstructionsSection}>
                                <label className={styles.settingLabel}>
                                  {dl.mergeInstructionsLabel || 'Merge Instructions for AI'}
                                </label>
                                <textarea
                                  className={styles.mergeInstructionsTextarea}
                                  placeholder={dl.mergeInstructionsPlaceholder || 'Instructions for merging the content...'}
                                  value={getMergeInstructions(idx)}
                                  onChange={(e) => setMergeInstructions(prev => ({ ...prev, [idx]: e.target.value }))}
                                  rows={4}
                                />
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

            {/* Actions Summary — shown after merge apply */}
            {allApplied && applyResults?.actions?.length > 0 && (
              <MergeActionsSummary actions={applyResults.actions} t={t} dl={dl} styles={styles} />
            )}

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
                        onClick={isCannibalizationFix && proposals.some(p => p.recommendation?.recommendedAction === 'MERGE') ? handleGenerateContent : handleApply}
                        disabled={isApplying || isGenerating || readyCount === 0}
                      >
                        {isApplying || isGenerating
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

// ─── Content Preview with WYSIWYG Editor ──────────────────────

function ContentPreview({ generatedContent, setGeneratedContent, setShowPreview, handleApplyGeneratedContent, isApplying, t, dl, styles }) {
  const [editMode, setEditMode] = useState('preview'); // 'preview' | 'parallel' | 'free'
  const [contentBlocks, setContentBlocks] = useState([]);
  const [dragState, setDragState] = useState({ draggedId: null, overIdx: null });

  const post = generatedContent?.post;
  const html = post?.html || post?.content || '';

  // Live word count based on current HTML content
  const liveWordCount = useMemo(() => {
    if (!html) return 0;
    const text = html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    return text ? text.split(/\s+/).length : 0;
  }, [html]);

  // Parse HTML into blocks (headings, figures, content sections)
  useEffect(() => {
    if (!html) { setContentBlocks([]); return; }
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const blocks = [];
    let paragraphBuffer = [];

    const flushParagraphBuffer = () => {
      if (paragraphBuffer.length > 0) {
        blocks.push({ id: `content-${blocks.length}`, type: 'content', html: paragraphBuffer.join('') });
        paragraphBuffer = [];
      }
    };

    doc.body.childNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const tagName = node.tagName.toLowerCase();
        if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
          flushParagraphBuffer();
          blocks.push({ id: `heading-${blocks.length}`, type: 'heading', tag: tagName, text: node.textContent });
        } else if (tagName === 'figure') {
          flushParagraphBuffer();
          const img = node.querySelector('img');
          const figcaption = node.querySelector('figcaption');
          blocks.push({
            id: `figure-${blocks.length}`, type: 'figure',
            src: img?.getAttribute('src') || '', alt: img?.getAttribute('alt') || figcaption?.textContent || '',
            caption: figcaption?.textContent || '', html: node.outerHTML,
          });
        } else {
          paragraphBuffer.push(node.outerHTML);
        }
      } else if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
        paragraphBuffer.push(`<p>${node.textContent}</p>`);
      }
    });
    flushParagraphBuffer();
    setContentBlocks(blocks);
  }, [html]);

  const updateBlock = (blockId, updates) => {
    setContentBlocks(prev => prev.map(b => b.id === blockId ? { ...b, ...updates } : b));
  };

  const reconstructHtml = useCallback(() => {
    return contentBlocks.map(block => {
      if (block.type === 'heading') return `<${block.tag}>${block.text}</${block.tag}>`;
      if (block.type === 'figure') return `<figure><img src="${block.src}" alt="${block.alt}"><figcaption>${block.caption}</figcaption></figure>`;
      return block.html;
    }).join('\n');
  }, [contentBlocks]);

  // Sync blocks back to post HTML when blocks change (parallel mode)
  useEffect(() => {
    if (editMode === 'parallel' && contentBlocks.length > 0) {
      const newHtml = reconstructHtml();
      if (newHtml !== html) {
        setGeneratedContent(prev => ({ ...prev, post: { ...prev.post, html: newHtml } }));
      }
    }
  }, [contentBlocks, reconstructHtml, editMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateField = (field, value) => {
    setGeneratedContent(prev => ({ ...prev, post: { ...prev.post, [field]: value } }));
  };

  // Drag handlers
  const handleDragStart = (blockId) => setDragState({ draggedId: blockId, overIdx: null });
  const handleDragOver = (e, idx) => { e.preventDefault(); setDragState(prev => ({ ...prev, overIdx: idx })); };
  const handleDragEnd = () => setDragState({ draggedId: null, overIdx: null });
  const handleDrop = (targetIdx) => {
    if (!dragState.draggedId) return;
    const sourceIdx = contentBlocks.findIndex(b => b.id === dragState.draggedId);
    if (sourceIdx === -1 || sourceIdx === targetIdx) { setDragState({ draggedId: null, overIdx: null }); return; }
    setContentBlocks(prev => {
      const newBlocks = [...prev];
      const [moved] = newBlocks.splice(sourceIdx, 1);
      newBlocks.splice(targetIdx, 0, moved);
      return newBlocks;
    });
    setDragState({ draggedId: null, overIdx: null });
  };

  const headingOptions = [
    { value: 'h2', label: 'H2', icon: Heading2 },
    { value: 'h3', label: 'H3', icon: Heading3 },
    { value: 'h4', label: 'H4', icon: Heading4 },
    { value: 'h5', label: 'H5', icon: Heading5 },
    { value: 'h6', label: 'H6', icon: Heading6 },
  ];

  return (
    <div className={styles.generatedPreview}>
      <div className={styles.previewHeader}>
        <div className={styles.previewHeaderLeft}>
          <CheckCircle2 size={20} className={styles.previewSuccessIcon} />
          <h4 className={styles.previewTitle}>{dl.contentGenerated || 'Content Generated'}</h4>
          {liveWordCount > 0 && (
            <span className={styles.wordCountBadge}>
              {liveWordCount.toLocaleString()} {dl.words || 'words'}
            </span>
          )}
        </div>
        <button
          className={styles.backToSettingsBtn}
          onClick={() => { setShowPreview(false); setGeneratedContent(null); }}
        >
          <ChevronDown size={14} style={{ transform: 'rotate(90deg)' }} />
          {dl.backToSettings || 'Back to Settings'}
        </button>
      </div>

      <div className={styles.previewContent}>
        {/* Post Title */}
        <div className={styles.previewField}>
          <label className={styles.previewFieldLabel}>{dl.postTitle || 'Post Title'}</label>
          <input type="text" className={styles.previewInput} value={post?.title || ''} onChange={(e) => updateField('title', e.target.value)} />
        </div>

        {/* SEO Title */}
        <div className={styles.previewField}>
          <label className={styles.previewFieldLabel}>
            {t.fixFieldTitle || 'SEO Title'}
            <span className={styles.charCount}>({(post?.seoTitle || '').length}/60)</span>
          </label>
          <input type="text" className={styles.previewInput} value={post?.seoTitle || ''} onChange={(e) => updateField('seoTitle', e.target.value)} maxLength={60} />
        </div>

        {/* SEO Description */}
        <div className={styles.previewField}>
          <label className={styles.previewFieldLabel}>
            {t.fixFieldDescription || 'Meta Description'}
            <span className={styles.charCount}>({(post?.seoDescription || '').length}/160)</span>
          </label>
          <textarea className={styles.previewTextarea} value={post?.seoDescription || ''} onChange={(e) => updateField('seoDescription', e.target.value)} maxLength={160} rows={2} />
        </div>

        {/* Excerpt */}
        {post?.excerpt && (
          <div className={styles.previewField}>
            <label className={styles.previewFieldLabel}>{dl.excerpt || 'Excerpt'}</label>
            <textarea className={styles.previewTextarea} value={post?.excerpt || ''} onChange={(e) => updateField('excerpt', e.target.value)} rows={2} />
          </div>
        )}

        {/* Search Intent */}
        {generatedContent?.proposal?.recommendation?.mergedPageChanges?.targetAngle && (
          <div className={styles.previewField}>
            <label className={styles.previewFieldLabel}>{dl.searchIntent || 'Search Intent'}</label>
            <div className={styles.previewIntentBadge}>
              {generatedContent.proposal.recommendation.mergedPageChanges.targetAngle}
            </div>
          </div>
        )}

        {/* Featured Image */}
        {post?.featuredImage && (
          <div className={styles.previewField}>
            <label className={styles.previewFieldLabel}>{dl.featuredImage || 'Featured Image'}</label>
            <div className={styles.previewImageWrap}>
              <img src={post.featuredImage} alt={post.featuredImageAlt || ''} className={styles.previewImage} />
            </div>
            <input
              type="text" className={styles.previewImageAlt} placeholder={dl.imageAlt || 'Image alt text'}
              value={post.featuredImageAlt || ''} onChange={(e) => updateField('featuredImageAlt', e.target.value)}
            />
          </div>
        )}

        {/* Content with edit modes */}
        <div className={styles.previewField}>
          <div className={styles.previewFieldHeader}>
            <label className={styles.previewFieldLabel}>{dl.content || 'Content'}</label>
            <div className={styles.editModeToggle}>
              <button
                className={`${styles.editModeBtn} ${editMode === 'preview' ? styles.editModeBtnActive : ''}`}
                onClick={() => setEditMode('preview')}
                title={dl.showPreview || 'Preview'}
              >
                <Eye size={14} />
              </button>
              <button
                className={`${styles.editModeBtn} ${editMode === 'parallel' ? styles.editModeBtnActive : ''}`}
                onClick={() => setEditMode('parallel')}
                title={dl.parallelEdit || 'Block Editor'}
              >
                <AlignLeft size={14} />
              </button>
              <button
                className={`${styles.editModeBtn} ${editMode === 'free' ? styles.editModeBtnActive : ''}`}
                onClick={() => setEditMode('free')}
                title={dl.freeEdit || 'Full Editor'}
              >
                <Edit3 size={14} />
              </button>
            </div>
          </div>

          {editMode === 'preview' && (
            <div className={styles.previewHtmlContent} dangerouslySetInnerHTML={{ __html: html }} />
          )}

          {editMode === 'parallel' && (
            <div className={styles.editorContentBlocks}>
              {contentBlocks.map((block, idx) => (
                <div
                  key={block.id}
                  className={`${styles.editorContentBlock} ${dragState.draggedId === block.id ? styles.editorBlockDragging : ''} ${dragState.overIdx === idx && dragState.draggedId !== block.id ? styles.editorBlockDragOver : ''}`}
                  draggable
                  onDragStart={() => handleDragStart(block.id)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  onDrop={() => handleDrop(idx)}
                >
                  <div className={styles.editorDragHandle}><GripVertical size={14} /></div>
                  <div className={styles.editorBlockContent}>
                    {block.type === 'heading' ? (
                      <PreviewHeadingBlock block={block} headingOptions={headingOptions} onUpdate={(u) => updateBlock(block.id, u)} />
                    ) : block.type === 'figure' ? (
                      <PreviewFigureBlock block={block} onUpdate={(u) => updateBlock(block.id, u)} />
                    ) : (
                      <PreviewContentBlockEditor block={block} onUpdate={(u) => updateBlock(block.id, u)} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {editMode === 'free' && (
            <PreviewFreeEditMode content={html} onUpdate={(newHtml) => updateField('html', newHtml)} />
          )}
        </div>
      </div>

      {/* Preview Footer */}
      <div className={styles.previewFooter}>
        <Button onClick={() => { setShowPreview(false); setGeneratedContent(null); }}>
          {t.fixCancel || 'Cancel'}
        </Button>
        <Button variant="primary" onClick={handleApplyGeneratedContent} disabled={isApplying}>
          {isApplying
            ? <><Loader2 size={15} className={styles.spinning} /> {dl.publishing || 'Publishing...'}</>
            : <><Send size={15} /> {dl.publishToSite || 'Publish to Site'}</>
          }
        </Button>
      </div>
    </div>
  );
}

// ─── Merge Actions Summary ────────────────────────────────────

const ACTION_LABELS = {
  post_updated: { icon: '✏️', label: 'Post updated with merged content' },
  seo_updated: { icon: '🔍', label: 'SEO title & description updated' },
  featured_image: { icon: '🖼️', label: 'Featured image generated' },
  redirect_wp: { icon: '↪️', label: 'Redirect created in WordPress' },
  redirect_platform: { icon: '📌', label: 'Redirect saved in platform' },
  post_trashed: { icon: '🗑️', label: 'Duplicate post moved to trash' },
  gsc_reindex: { icon: '📡', label: 'Google re-index requested' },
};

function MergeActionsSummary({ actions, t, dl, styles }) {
  if (!actions?.length) return null;

  return (
    <div className={styles.actionsSummary}>
      <h4 className={styles.actionsSummaryTitle}>
        <CheckCircle2 size={16} />
        {dl.mergeActionsTitle || 'Actions performed'}
      </h4>
      <ul className={styles.actionsList}>
        {actions.map((action, i) => {
          const meta = ACTION_LABELS[action.type] || { icon: '•', label: action.type };
          const isSuccess = action.status === 'success';
          const isSkipped = action.status === 'skipped';
          const isFailed = action.status === 'failed';

          return (
            <li key={i} className={`${styles.actionItem} ${isSuccess ? styles.actionSuccess : isFailed ? styles.actionFailed : styles.actionSkipped}`}>
              <span className={styles.actionIcon}>
                {isSuccess ? <CheckCircle2 size={14} /> : isFailed ? <XCircle size={14} /> : <AlertTriangle size={14} />}
              </span>
              <span className={styles.actionLabel}>{meta.icon} {meta.label}</span>
              {isFailed && action.detail && (
                <span className={styles.actionDetail}>{action.detail}</span>
              )}
              {isSkipped && action.detail && (
                <span className={styles.actionDetail}>{action.detail}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Heading Block ────────────────────────────────────────────

function PreviewHeadingBlock({ block, headingOptions, onUpdate }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(block.text);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setShowTagDropdown(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const CurrentIcon = headingOptions.find(o => o.value === block.tag)?.icon || Heading2;

  return (
    <div className={styles.editorHeadingBlock}>
      <div className={styles.editorHeadingTagSelect} ref={dropdownRef}>
        <button className={styles.editorTagButton} onClick={() => setShowTagDropdown(!showTagDropdown)}>
          <CurrentIcon size={16} />
          <span>{block.tag.toUpperCase()}</span>
          <ChevronDown size={14} />
        </button>
        {showTagDropdown && (
          <div className={styles.editorTagDropdown}>
            {headingOptions.map(opt => {
              const Icon = opt.icon;
              return (
                <button key={opt.value} className={`${styles.editorTagOption} ${block.tag === opt.value ? styles.editorTagOptionActive : ''}`}
                  onClick={() => { onUpdate({ tag: opt.value }); setShowTagDropdown(false); }}>
                  <Icon size={16} /> <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {isEditing ? (
        <div className={styles.editorHeadingEdit}>
          <input className={styles.editorHeadingInput} value={editText} onChange={(e) => setEditText(e.target.value)} autoFocus />
          <div className={styles.editorHeadingEditActions}>
            <button className={styles.editorEditSave} onClick={() => { onUpdate({ text: editText }); setIsEditing(false); }}><Check size={14} /></button>
            <button className={styles.editorEditCancel} onClick={() => { setEditText(block.text); setIsEditing(false); }}><X size={14} /></button>
          </div>
        </div>
      ) : (
        <div className={styles.editorHeadingText} onClick={() => setIsEditing(true)} role="button" tabIndex={0}>{block.text}</div>
      )}
    </div>
  );
}

// ─── Figure Block ─────────────────────────────────────────────

function PreviewFigureBlock({ block, onUpdate }) {
  const [isEditingAlt, setIsEditingAlt] = useState(false);
  const [altText, setAltText] = useState(block.alt || '');

  return (
    <div className={styles.editorFigureBlock}>
      <img src={block.src} alt={block.alt} className={styles.editorFigureBlockImage} />
      <div className={styles.editorFigureBlockContent}>
        {isEditingAlt ? (
          <div className={styles.editorEditWrap}>
            <input className={styles.editorEditInput} value={altText} onChange={(e) => setAltText(e.target.value)} autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') { onUpdate({ alt: altText, caption: altText }); setIsEditingAlt(false); } if (e.key === 'Escape') { setAltText(block.alt || ''); setIsEditingAlt(false); } }} />
            <div className={styles.editorEditActions}>
              <button className={styles.editorEditSave} onClick={() => { onUpdate({ alt: altText, caption: altText }); setIsEditingAlt(false); }}><Check size={14} /></button>
              <button className={styles.editorEditCancel} onClick={() => { setAltText(block.alt || ''); setIsEditingAlt(false); }}><X size={14} /></button>
            </div>
          </div>
        ) : (
          <div className={styles.editorFigureCaptionRow}>
            <span className={styles.editorFigureCaption}>{block.caption}</span>
            <button className={styles.editorFigureEditBtn} onClick={() => setIsEditingAlt(true)}><Edit3 size={12} /></button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Content Block Editor (TipTap per-block) ──────────────────

function PreviewContentBlockEditor({ block, onUpdate }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      TiptapLink.configure({ openOnClick: false }),
      TiptapUnderline,
    ],
    content: block.html,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onUpdate({ html: editor.getHTML() }),
    editorProps: { attributes: { class: styles.editorTiptapEditor } },
  });

  if (!editor) return null;

  return (
    <div className={styles.editorContentBlockEditor}>
      <div className={styles.editorMiniToolbar}>
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={`${styles.editorMiniToolbarBtn} ${editor.isActive('bold') ? styles.editorMiniToolbarBtnActive : ''}`}><Bold size={14} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={`${styles.editorMiniToolbarBtn} ${editor.isActive('italic') ? styles.editorMiniToolbarBtnActive : ''}`}><Italic size={14} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className={`${styles.editorMiniToolbarBtn} ${editor.isActive('underline') ? styles.editorMiniToolbarBtnActive : ''}`}><UnderlineIcon size={14} /></button>
        <div className={styles.editorMiniToolbarDivider} />
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={`${styles.editorMiniToolbarBtn} ${editor.isActive('bulletList') ? styles.editorMiniToolbarBtnActive : ''}`}><List size={14} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={`${styles.editorMiniToolbarBtn} ${editor.isActive('orderedList') ? styles.editorMiniToolbarBtnActive : ''}`}><ListOrdered size={14} /></button>
        <div className={styles.editorMiniToolbarDivider} />
        <button type="button" onClick={() => { const url = window.prompt('Enter URL:'); if (url) editor.chain().focus().setLink({ href: url }).run(); }} className={`${styles.editorMiniToolbarBtn} ${editor.isActive('link') ? styles.editorMiniToolbarBtnActive : ''}`}><LinkIcon size={14} /></button>
        {editor.isActive('link') && (
          <button type="button" onClick={() => editor.chain().focus().unsetLink().run()} className={styles.editorMiniToolbarBtn}><Unlink size={14} /></button>
        )}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

// ─── Free Edit Mode (Full TipTap) ─────────────────────────────

function PreviewFreeEditMode({ content, onUpdate }) {
  const processedContent = useMemo(() => {
    return content.replace(
      /<figure[^>]*>\s*(<img[^>]*>)\s*(?:<figcaption[^>]*>[\s\S]*?<\/figcaption>)?\s*<\/figure>/gi,
      '$1'
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const editor = useEditor({
    extensions: [
      StarterKit,
      TiptapLink.configure({ openOnClick: false }),
      TiptapUnderline,
      TiptapImage.configure({ inline: false, allowBase64: true }),
    ],
    content: processedContent,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      let html = editor.getHTML();
      html = html.replace(/<img([^>]*)>/gi, (match, attrs) => {
        const altMatch = attrs.match(/alt="([^"]*)"/);
        const alt = altMatch ? altMatch[1] : '';
        return `<figure>${match}<figcaption>${alt}</figcaption></figure>`;
      });
      onUpdate(html);
    },
    editorProps: { attributes: { class: styles.editorFreeEditor } },
  });

  if (!editor) return null;

  return (
    <div className={styles.editorFreeEditMode}>
      <div className={styles.editorFreeToolbar}>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={`${styles.editorToolbarBtn} ${editor.isActive('heading', { level: 2 }) ? styles.editorToolbarBtnActive : ''}`}><Heading2 size={16} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={`${styles.editorToolbarBtn} ${editor.isActive('heading', { level: 3 }) ? styles.editorToolbarBtnActive : ''}`}><Heading3 size={16} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()} className={`${styles.editorToolbarBtn} ${editor.isActive('heading', { level: 4 }) ? styles.editorToolbarBtnActive : ''}`}><Heading4 size={16} /></button>
        <div className={styles.editorToolbarDivider} />
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={`${styles.editorToolbarBtn} ${editor.isActive('bold') ? styles.editorToolbarBtnActive : ''}`}><Bold size={16} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={`${styles.editorToolbarBtn} ${editor.isActive('italic') ? styles.editorToolbarBtnActive : ''}`}><Italic size={16} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className={`${styles.editorToolbarBtn} ${editor.isActive('underline') ? styles.editorToolbarBtnActive : ''}`}><UnderlineIcon size={16} /></button>
        <div className={styles.editorToolbarDivider} />
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={`${styles.editorToolbarBtn} ${editor.isActive('bulletList') ? styles.editorToolbarBtnActive : ''}`}><List size={16} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={`${styles.editorToolbarBtn} ${editor.isActive('orderedList') ? styles.editorToolbarBtnActive : ''}`}><ListOrdered size={16} /></button>
        <div className={styles.editorToolbarDivider} />
        <button type="button" onClick={() => { const url = window.prompt('Enter URL:'); if (url) editor.chain().focus().setLink({ href: url }).run(); }} className={`${styles.editorToolbarBtn} ${editor.isActive('link') ? styles.editorToolbarBtnActive : ''}`}><LinkIcon size={16} /></button>
        {editor.isActive('link') && (
          <button type="button" onClick={() => editor.chain().focus().unsetLink().run()} className={styles.editorToolbarBtn}><Unlink size={16} /></button>
        )}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
