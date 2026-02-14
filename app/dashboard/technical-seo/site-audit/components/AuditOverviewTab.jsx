'use client';

import { useState, useEffect } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  Monitor,
  Smartphone,
  Maximize2,
  Sparkles,
  Loader2,
  Clock,
  FileSearch,
  ExternalLink,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { toImgSrc } from '../lib/img-src';
import styles from './AuditOverviewTab.module.css';

/**
 * AuditOverviewTab — Default "Overview" tab for the Site Audit page.
 *
 * Content:
 * 1. Score Card with health score, errors, warnings, passed counts
 * 2. Homepage Screenshots (Desktop + Mobile) side-by-side
 * 3. AI Summary Card with auto-translation
 *
 * Props:
 * - audit: the full SiteAudit object
 * - allCounts: { passed, warnings, errors, info }
 * - categoryScores: { technical, performance, visual }
 * - onLightbox: (imgSrc) => void — open lightbox
 */
export default function AuditOverviewTab({
  audit,
  allCounts,
  categoryScores,
  onLightbox,
}) {
  const { t, locale } = useLocale();
  const [summaryText, setSummaryText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);

  const hasScreenshots = audit?.screenshots && (audit.screenshots.desktop || audit.screenshots.mobile);

  // ─── AI Summary: resolve correct language ─────────────────

  useEffect(() => {
    if (!audit?.id) return;

    const translations = audit.summaryTranslations || {};
    const originalSummary = audit.summary || '';

    // Check if we already have this language
    if (translations[locale]) {
      setSummaryText(translations[locale]);
      return;
    }

    // If English and we have the original summary (generated in EN)
    if (locale === 'en' && originalSummary) {
      setSummaryText(originalSummary);
      return;
    }

    // No translation exists — need to fetch from API
    if (!originalSummary) {
      setSummaryText('');
      return;
    }

    let cancelled = false;
    setIsTranslating(true);

    fetch('/api/audit/translate-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auditId: audit.id, targetLang: locale }),
    })
      .then(res => res.json())
      .then(data => {
        if (!cancelled && data.translation) {
          setSummaryText(data.translation);
        }
      })
      .catch(err => {
        console.error('[OverviewTab] Translation failed:', err);
        // Fall back to original summary
        if (!cancelled) setSummaryText(originalSummary);
      })
      .finally(() => {
        if (!cancelled) setIsTranslating(false);
      });

    return () => { cancelled = true; };
  }, [audit?.id, audit?.summary, audit?.summaryTranslations, locale]);

  // ─── Helpers ──────────────────────────────────────────────

  function getScoreColor(score) {
    if (score >= 80) return 'good';
    if (score >= 50) return 'warning';
    return 'bad';
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * Convert URLs in text to clickable links with ExternalLink icon.
   * Returns an HTML string.
   */
  function linkifyText(text) {
    if (!text) return '';
    // Match URLs
    const urlRegex = /(https?:\/\/[^\s<>"')\]]+)/g;
    return text.replace(urlRegex, (url) => {
      const display = url.length > 60 ? url.slice(0, 57) + '...' : url;
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="${styles.summaryLink}">${display}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-inline-start:3px"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>`;
    });
  }

  /**
   * Format a line of summary text (bold markers + linkify URLs).
   */
  function formatSummaryLine(line) {
    const bolded = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    return linkifyText(bolded);
  }

  if (!audit) return null;

  return (
    <div className={styles.overview}>
      {/* ─── Score Card ─────────────────────────────────────── */}
      <div className={styles.scoreSection}>
        <div className={`${styles.scoreCircle} ${styles[getScoreColor(audit.score)]}`}>
          <span className={styles.scoreValue}>{audit.score}</span>
          <span className={styles.scoreLabel}>{t('siteAudit.healthScore')}</span>
        </div>

        <div className={styles.statsGrid}>
          <div className={`${styles.statCard} ${styles.statError}`}>
            <XCircle size={20} />
            <span className={styles.statValue}>{allCounts.errors}</span>
            <span className={styles.statLabel}>{t('siteAudit.errors')}</span>
          </div>
          <div className={`${styles.statCard} ${styles.statWarning}`}>
            <AlertTriangle size={20} />
            <span className={styles.statValue}>{allCounts.warnings}</span>
            <span className={styles.statLabel}>{t('siteAudit.warnings')}</span>
          </div>
          <div className={`${styles.statCard} ${styles.statPassed}`}>
            <CheckCircle2 size={20} />
            <span className={styles.statValue}>{allCounts.passed}</span>
            <span className={styles.statLabel}>{t('siteAudit.passed')}</span>
          </div>
          <div className={`${styles.statCard} ${styles.statInfo}`}>
            <Info size={20} />
            <span className={styles.statValue}>{allCounts.info || 0}</span>
            <span className={styles.statLabel}>{t('siteAudit.notices')}</span>
          </div>
        </div>

        {/* Meta info */}
        <div className={styles.metaRow}>
          {audit.completedAt && (
            <span className={styles.metaItem}>
              <Clock size={14} />
              {formatDate(audit.completedAt)}
            </span>
          )}
          {audit.pagesScanned > 0 && (
            <span className={styles.metaItem}>
              <FileSearch size={14} />
              {audit.pagesScanned} {t('siteAudit.pagesScanned')}
            </span>
          )}
          {audit.discoveryMethod && (
            <span className={styles.discoveryBadge}>
              {t(`siteAudit.discovery.${audit.discoveryMethod}`)}
            </span>
          )}
        </div>

        {/* Category Scores */}
        <div className={styles.categoryScores}>
          {['technical', 'performance', 'visual', 'accessibility'].map(cat => (
            <div key={cat} className={styles.categoryScore}>
              <div className={styles.categoryBar}>
                <div
                  className={`${styles.categoryFill} ${styles[getScoreColor(categoryScores[cat] ?? 0)]}`}
                  style={{ width: `${categoryScores[cat] ?? 0}%` }}
                />
              </div>
              <span className={styles.categoryName}>{t(`siteAudit.${cat}`)}</span>
              <span className={`${styles.categoryValue} ${styles[getScoreColor(categoryScores[cat] ?? 0)]}`}>
                {categoryScores[cat] ?? 0}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Homepage Screenshots ───────────────────────────── */}
      {hasScreenshots && (
        <div className={styles.screenshotsSection}>
          <h3 className={styles.sectionTitle}>
            <Monitor size={18} />
            {t('siteAudit.screenshots')}
          </h3>
          <div className={styles.screenshotsGrid}>
            {audit.screenshots.desktop && (
              <div className={styles.screenshotItem}>
                <div className={styles.screenshotLabel}>
                  <Monitor size={14} />
                  <span>{t('siteAudit.desktop')}</span>
                </div>
                <div
                  className={styles.screenshotWrapper}
                  onClick={() => onLightbox?.(toImgSrc(audit.screenshots.desktop))}
                >
                  <img
                    src={toImgSrc(audit.screenshots.desktop)}
                    alt={t('siteAudit.desktopScreenshot')}
                    className={styles.screenshotImage}
                  />
                  <div className={styles.screenshotOverlay}>
                    <Maximize2 size={20} />
                  </div>
                </div>
              </div>
            )}
            {audit.screenshots.mobile && (
              <div className={styles.screenshotItem}>
                <div className={styles.screenshotLabel}>
                  <Smartphone size={14} />
                  <span>{t('siteAudit.mobile')}</span>
                </div>
                <div
                  className={styles.screenshotWrapper}
                  onClick={() => onLightbox?.(toImgSrc(audit.screenshots.mobile))}
                >
                  <img
                    src={toImgSrc(audit.screenshots.mobile)}
                    alt={t('siteAudit.mobileScreenshot')}
                    className={`${styles.screenshotImage} ${styles.screenshotMobile}`}
                  />
                  <div className={styles.screenshotOverlay}>
                    <Maximize2 size={20} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── AI Summary ─────────────────────────────────────── */}
      {(audit.summary || isTranslating) && (
        <div className={styles.summarySection}>
          <h3 className={styles.sectionTitle}>
            <Sparkles size={18} />
            {t('siteAudit.aiSummary')}
          </h3>
          {isTranslating ? (
            <div className={styles.summaryLoading}>
              <Loader2 size={18} className={styles.spinning} />
              <span>{t('siteAudit.translatingSummary')}</span>
            </div>
          ) : (
            <div className={styles.summaryContent}>
              {summaryText.split('\n').map((line, i) => {
                if (!line.trim()) return <br key={i} />;
                const formatted = formatSummaryLine(line);
                if (line.trim().startsWith('- ') || line.trim().startsWith('• ')) {
                  return (
                    <li key={i} dangerouslySetInnerHTML={{ __html: formatted.replace(/^[-•]\s*/, '') }} />
                  );
                }
                return <p key={i} dangerouslySetInnerHTML={{ __html: formatted }} />;
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
