'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Sparkles, Loader2, RefreshCw, TrendingUp, AlertTriangle,
  Search, FileText, Link2, Settings, Target,
} from 'lucide-react';
import styles from './AiSuggestModal.module.css';

const CATEGORY_ICONS = {
  seo_meta: Search,
  content: FileText,
  internal_linking: Link2,
  technical: Settings,
  keyword: Target,
};

const CATEGORY_LABELS = {
  seo_meta: { en: 'SEO Meta', he: 'מטא SEO' },
  content: { en: 'Content', he: 'תוכן' },
  internal_linking: { en: 'Internal Linking', he: 'קישור פנימי' },
  technical: { en: 'Technical', he: 'טכני' },
  keyword: { en: 'Keywords', he: 'מילות מפתח' },
};

const IMPACT_LABELS = {
  high: { en: 'High Impact', he: 'השפעה גבוהה' },
  medium: { en: 'Medium Impact', he: 'השפעה בינונית' },
  low: { en: 'Low Impact', he: 'השפעה נמוכה' },
};

/**
 * AiSuggestModal - Shows AI-generated suggestions for pages with no organic traffic.
 *
 * Props:
 * - open: boolean
 * - onClose: () => void
 * - pageTitle: string
 * - pageUrl: string
 * - siteId: string
 * - translations: object (agent translations)
 */
export default function AiSuggestModal({ open, onClose, pageTitle, pageUrl, pageSlug, siteId, translations }) {
  const t = translations?.agent || translations || {};
  const suggestT = t.suggestTraffic || {};

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const fetchSuggestions = async () => {
    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/agent/insights/suggest-traffic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId, url: pageUrl, title: pageTitle, slug: pageSlug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate suggestions');
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-fetch when opened
  const [hasFetched, setHasFetched] = useState(false);
  if (open && !hasFetched && !isLoading && !result && !error) {
    setHasFetched(true);
    fetchSuggestions();
  }
  if (!open && hasFetched) {
    // Reset when closed
    setHasFetched(false);
  }

  if (!open) return null;

  const handleClose = () => {
    setResult(null);
    setError(null);
    setIsLoading(false);
    setHasFetched(false);
    onClose();
  };

  const isRtl = document.documentElement.dir === 'rtl' || document.documentElement.lang === 'he';

  return createPortal(
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()} dir={isRtl ? 'rtl' : 'ltr'}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerTop}>
            <div className={styles.iconWrap}>
              <Sparkles size={22} />
            </div>
            <button className={styles.closeBtn} onClick={handleClose}>
              <X size={18} />
            </button>
          </div>
          <h3 className={styles.title}>
            {suggestT.modalTitle || 'AI Suggestions for Organic Visibility'}
          </h3>
          <p className={styles.pageInfo}>
            {pageTitle}
          </p>
        </div>

        {/* Content */}
        <div className={styles.body}>
          {isLoading && (
            <div className={styles.loadingState}>
              <Loader2 size={28} className={styles.spinning} />
              <span className={styles.loadingText}>
                {suggestT.analyzing || 'Analyzing page and generating suggestions...'}
              </span>
            </div>
          )}

          {error && (
            <div className={styles.errorState}>
              <AlertTriangle size={28} />
              <span className={styles.errorMsg}>{error}</span>
              <button className={styles.retryBtn} onClick={fetchSuggestions}>
                <RefreshCw size={14} /> {suggestT.retry || 'Try Again'}
              </button>
            </div>
          )}

          {result && (
            <>
              {result.summary && (
                <div className={styles.summary}>
                  <TrendingUp size={16} />
                  <p>{result.summary}</p>
                </div>
              )}

              <div className={styles.suggestionsList}>
                {result.suggestions?.map((s, i) => {
                  const Icon = CATEGORY_ICONS[s.category] || FileText;
                  const categoryLabel = isRtl
                    ? CATEGORY_LABELS[s.category]?.he
                    : CATEGORY_LABELS[s.category]?.en;
                  const impactLabel = isRtl
                    ? IMPACT_LABELS[s.impact]?.he
                    : IMPACT_LABELS[s.impact]?.en;

                  return (
                    <div key={i} className={styles.suggestionItem}>
                      <div className={styles.suggestionHeader}>
                        <div className={styles.suggestionLeft}>
                          <span className={`${styles.categoryBadge} ${styles[`cat_${s.category}`]}`}>
                            <Icon size={12} />
                            {categoryLabel}
                          </span>
                          <span className={`${styles.impactBadge} ${styles[`impact_${s.impact}`]}`}>
                            {impactLabel}
                          </span>
                        </div>
                      </div>
                      <h4 className={styles.suggestionTitle}>{s.title}</h4>
                      <p className={styles.suggestionDesc}>{s.description}</p>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
