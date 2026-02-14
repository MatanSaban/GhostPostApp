'use client';

import {
  ExternalLink,
  Edit3,
  RefreshCw,
  FileText,
  Loader2,
  Coins,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { useState } from 'react';
import { useLocale } from '@/app/context/locale-context';
import { emitCreditsUpdated } from '@/app/context/user-context';
import { handleLimitError } from '@/app/context/limit-guard-context';
import styles from './ScannedPageRow.module.css';

// Issue types eligible for AI Quick Fix
const FIXABLE_ISSUES = new Set([
  'audit.issues.noTitle',
  'audit.issues.noMetaDescription',
  'audit.issues.metaDescriptionShort',
  'audit.issues.noCanonical',
  'audit.issues.imagesNoAlt',
  'audit.issues.missingOG',
  'audit.issues.titleTooShort',
]);

/**
 * Shorten a URL for display
 */
function shortenUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname === '/' ? '' : u.pathname);
    return u.hostname + (path.length > 40 ? path.slice(0, 37) + '...' : path);
  } catch {
    try {
      const decoded = decodeURIComponent(url);
      return decoded.length > 50 ? decoded.slice(0, 47) + '...' : decoded;
    } catch {
      return url.length > 50 ? url.slice(0, 47) + '...' : url;
    }
  }
}

function getScoreColor(score) {
  if (score >= 80) return 'good';
  if (score >= 50) return 'warning';
  return 'bad';
}

function getStatusColor(code) {
  if (!code) return '';
  if (code >= 200 && code < 300) return 'statusGood';
  if (code >= 300 && code < 400) return 'statusRedirect';
  return 'statusError';
}

/**
 * ScannedPageRow — reusable row for a scanned page
 *
 * Props:
 * - pageResult: AuditPageResult object
 * - auditId: current audit ID
 * - siteId: current site ID
 * - onRescanComplete: callback after rescan finishes
 * - onViewDetails: callback to show issue details for this page
 * - compact: if true, show less columns (for drill-down view)
 * - pageIssues: Array<AuditIssue> — issues for this specific page (for Quick Fix)
 * - onFixComplete: callback after AI fix completes
 * - isPluginConnected: boolean — whether the WP plugin is connected
 * - onPluginRequired: callback when fix attempted without plugin
 */
export default function ScannedPageRow({
  pageResult,
  auditId,
  siteId,
  onRescanComplete,
  onViewDetails,
  compact = false,
  pageIssues = [],
  onFixComplete,
  isPluginConnected = false,
  onPluginRequired,
}) {
  const { t } = useLocale();
  const [isRescanning, setIsRescanning] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [fixResult, setFixResult] = useState(null);

  const pr = pageResult;

  // Check if this page has any fixable issues
  const fixableIssues = pageIssues.filter(i => FIXABLE_ISSUES.has(i.message));
  const hasFixableIssues = fixableIssues.length > 0;

  const handleRescan = async (e) => {
    e.stopPropagation();
    if (isRescanning) return;
    setIsRescanning(true);

    try {
      const res = await fetch('/api/audit/rescan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auditId,
          siteId,
          url: pr.url,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (handleLimitError(data)) return; // shows global modal
        console.error('[Rescan] Error:', data.error);
        alert(data.error || 'Rescan failed');
        return;
      }

      const data = await res.json();
      // Immediately update credits display across all components
      if (data.creditsUpdated?.used != null) {
        emitCreditsUpdated(data.creditsUpdated.used);
      }

      if (onRescanComplete) onRescanComplete();
    } catch (err) {
      console.error('[Rescan] Failed:', err.message);
    } finally {
      setIsRescanning(false);
    }
  };

  const handleQuickFix = async (e) => {
    e.stopPropagation();
    if (isFixing || !hasFixableIssues) return;

    // Check plugin connection first
    if (!isPluginConnected) {
      onPluginRequired?.();
      return;
    }

    setIsFixing(true);
    setFixResult(null);

    try {
      // Fix the first fixable issue found
      const issue = fixableIssues[0];

      const res = await fetch('/api/audit/fix-issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auditId,
          siteId,
          issueType: issue.message,
          pageUrl: pr.url,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (handleLimitError(data)) return; // shows global modal
        console.error('[QuickFix] Error:', data.error);
        alert(data.error || 'Quick fix failed');
        return;
      }

      // Immediately update credits display across all components
      if (data.creditsUpdated?.used != null) {
        emitCreditsUpdated(data.creditsUpdated.used);
      }

      setFixResult(data.fix);
      if (onFixComplete) onFixComplete(data);
    } catch (err) {
      console.error('[QuickFix] Failed:', err.message);
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <div className={styles.row}>
      {/* Page URL + Title */}
      <div className={styles.pageInfo}>
        <a
          href={pr.url}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.pageUrl}
        >
          {shortenUrl(pr.url)}
        </a>
        {pr.title && (
          <span className={styles.pageTitle}>{pr.title}</span>
        )}
      </div>

      {/* Metrics (hidden in compact mode) */}
      {!compact && (
        <div className={styles.metrics}>
          <span className={`${styles.metric} ${styles[getStatusColor(pr.statusCode)]}`}>
            {pr.statusCode || '—'}
          </span>
          <span className={styles.metricMono}>
            {pr.ttfb ? `${pr.ttfb}ms` : '—'}
          </span>
          <span className={`${styles.metric} ${pr.performanceScore ? styles[getScoreColor(pr.performanceScore)] : ''}`}>
            {pr.performanceScore != null ? pr.performanceScore : t('siteAudit.na')}
          </span>
          <span className={styles.metricMono}>
            {pr.lcp != null ? `${pr.lcp.toFixed(1)}s` : t('siteAudit.na')}
          </span>
          <span className={styles.metricMono}>
            {pr.cls != null ? pr.cls.toFixed(3) : t('siteAudit.na')}
          </span>
          <span className={styles.metricCount}>
            {pr.issueCount ?? 0}
          </span>
        </div>
      )}

      {/* Compact metrics */}
      {compact && (
        <div className={styles.compactMetrics}>
          <span className={`${styles.metric} ${styles[getStatusColor(pr.statusCode)]}`}>
            {pr.statusCode || '—'}
          </span>
          <span className={`${styles.metric} ${pr.performanceScore ? styles[getScoreColor(pr.performanceScore)] : ''}`}>
            {pr.performanceScore != null ? `${t('siteAudit.pr.psi')} ${pr.performanceScore}` : `${t('siteAudit.pr.psi')} ${t('siteAudit.na')}`}
          </span>
        </div>
      )}

      {/* Actions */}
      <div className={styles.actions}>
        {/* Rescan (1 Credit) */}
        <button
          className={`${styles.actionBtn} ${styles.creditBtn}`}
          onClick={handleRescan}
          disabled={isRescanning}
          title={`${t('siteAudit.actions.rescan')} (1 ${t('siteAudit.credit')})`}
        >
          {isRescanning ? (
            <Loader2 size={14} className={styles.spinning} />
          ) : (
            <>
              <RefreshCw size={13} />
              <Coins size={10} className={styles.creditIcon} />
            </>
          )}
        </button>

        {/* AI Quick Fix (2 Credits) — only shown for fixable issues */}
        {hasFixableIssues && (
          <button
            className={`${styles.actionBtn} ${styles.fixBtn}`}
            onClick={handleQuickFix}
            disabled={isFixing}
            title={`${t('siteAudit.actions.quickFix')} (2 ${t('siteAudit.credits')})`}
          >
            {isFixing ? (
              <Loader2 size={14} className={styles.spinning} />
            ) : (
              <>
                <Wand2 size={13} />
                <Coins size={10} className={styles.creditIcon} />
              </>
            )}
          </button>
        )}

        <a
          href={pr.url}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.actionBtn}
          title={t('siteAudit.actions.viewLive')}
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink size={14} />
        </a>
        {onViewDetails && (
          <button
            className={styles.actionBtn}
            onClick={(e) => { e.stopPropagation(); onViewDetails(pr); }}
            title={t('siteAudit.actions.viewDetails')}
          >
            <FileText size={14} />
          </button>
        )}
      </div>

      {/* Fix result tooltip */}
      {fixResult?.explanation && (
        <div className={styles.fixResultBanner}>
          <Sparkles size={12} />
          <span>{fixResult.explanation}</span>
        </div>
      )}
    </div>
  );
}
