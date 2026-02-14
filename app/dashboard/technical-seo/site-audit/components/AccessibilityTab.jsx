'use client';

import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  Filter,
  Accessibility,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import AccessibilityIssueCard from './AccessibilityIssueCard';
import styles from './AccessibilityTab.module.css';

/**
 * AccessibilityTab — Dedicated tab for Axe-core accessibility results
 *
 * Groups violations by rule, shows impact filter, score summary,
 * and renders each rule as an expandable AccessibilityIssueCard.
 *
 * Props:
 * - issues: AuditIssue[] — all issues with type === 'accessibility'
 * - auditId, siteId: for API calls
 * - score: number (0-100) — accessibility category score
 * - onFixComplete: callback after fix
 */
export default function AccessibilityTab({
  issues = [],
  auditId,
  siteId,
  score,
  onFixComplete,
  translateIssueMsg,
  locale,
}) {
  const { t } = useLocale();
  const [impactFilter, setImpactFilter] = useState('all');

  // Parse structured details from each issue, then GROUP by ruleId
  const parsedRules = useMemo(() => {
    const ruleMap = new Map();

    for (const issue of issues) {
      let details = {};
      try {
        details = typeof issue.details === 'string' ? JSON.parse(issue.details) : (issue.details || {});
      } catch {
        details = {};
      }

      const ruleId = details.ruleId || issue.message?.replace('a11y.', '') || 'unknown';

      if (!ruleMap.has(ruleId)) {
        ruleMap.set(ruleId, {
          ruleId,
          impact: details.impact || 'moderate',
          description: details.description || issue.suggestion || issue.message || '',
          helpUrl: details.helpUrl || '',
          tags: details.tags || [],
          message: issue.message,
          suggestion: issue.suggestion || '',
          severity: issue.severity,
          source: issue.source,
          urls: [],
          nodes: [],
          nodeCount: 0,
          translationKey: `a11y:${ruleId}`,
        });
      }

      const group = ruleMap.get(ruleId);

      // Collect unique URLs
      if (issue.url && !group.urls.includes(issue.url)) {
        group.urls.push(issue.url);
      }

      // Merge nodes, tagging each with its page URL
      const issueNodes = (details.nodes || []).map((n) => ({
        ...n,
        pageUrl: issue.url || '',
      }));
      group.nodes.push(...issueNodes);
      group.nodeCount += details.nodeCount || issueNodes.length || 1;

      // Keep the worst severity
      const severityRank = { error: 0, warning: 1, info: 2, passed: 3 };
      if ((severityRank[issue.severity] ?? 4) < (severityRank[group.severity] ?? 4)) {
        group.severity = issue.severity;
      }
      // Keep the worst impact
      const impactRank = { critical: 0, serious: 1, moderate: 2, minor: 3 };
      if ((impactRank[details.impact] ?? 4) < (impactRank[group.impact] ?? 4)) {
        group.impact = details.impact;
      }
    }

    // Sort: critical → serious → moderate → minor
    const impactOrder = { critical: 0, serious: 1, moderate: 2, minor: 3 };
    const result = Array.from(ruleMap.values());
    result.sort((a, b) => (impactOrder[a.impact] ?? 4) - (impactOrder[b.impact] ?? 4));

    return result;
  }, [issues]);

  // Impact counts
  const impactCounts = useMemo(() => {
    const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
    for (const r of parsedRules) {
      counts[r.impact] = (counts[r.impact] || 0) + 1;
    }
    return counts;
  }, [parsedRules]);

  // Filtered rules
  const filteredRules = impactFilter === 'all'
    ? parsedRules
    : parsedRules.filter((r) => r.impact === impactFilter);

  // Total element count
  const totalElements = parsedRules.reduce((sum, r) => sum + r.nodeCount, 0);

  if (issues.length === 0) {
    return (
      <div className={styles.empty}>
        <CheckCircle2 size={32} className={styles.emptyIcon} />
        <h3>{t('siteAudit.a11y.noIssues')}</h3>
        <p>{t('siteAudit.a11y.noIssuesDescription')}</p>
      </div>
    );
  }

  return (
    <div className={styles.tab}>
      {/* Summary Bar */}
      <div className={styles.summary}>
        <div className={styles.summaryScore}>
          <Accessibility size={20} />
          <span className={styles.summaryScoreLabel}>{t('siteAudit.a11y.score')}</span>
          <span className={`${styles.summaryScoreValue} ${styles[getScoreColor(score)]}`}>
            {score ?? '—'}
          </span>
        </div>
        <div className={styles.summaryStats}>
          <span className={styles.stat}>
            <XCircle size={14} className={styles.statCritical} />
            {impactCounts.critical + impactCounts.serious} {t('siteAudit.a11y.criticalSerious')}
          </span>
          <span className={styles.stat}>
            <AlertTriangle size={14} className={styles.statModerate} />
            {impactCounts.moderate} {t('siteAudit.a11y.moderate')}
          </span>
          <span className={styles.stat}>
            <Info size={14} className={styles.statMinor} />
            {impactCounts.minor} {t('siteAudit.a11y.minor')}
          </span>
          <span className={styles.statTotal}>
            {totalElements} {t('siteAudit.a11y.totalElements')}
          </span>
        </div>
      </div>

      {/* Impact Filter Chips */}
      <div className={styles.filters}>
        <Filter size={14} />
        {['all', 'critical', 'serious', 'moderate', 'minor'].map((level) => (
          <button
            key={level}
            className={`${styles.filterChip} ${impactFilter === level ? styles.filterActive : ''} ${level !== 'all' ? styles[`filter_${level}`] : ''}`}
            onClick={() => setImpactFilter(level)}
          >
            {level === 'all'
              ? t('siteAudit.a11y.allImpacts')
              : t(`siteAudit.a11y.${level}`)}
            {level !== 'all' && (
              <span className={styles.filterCount}>
                {impactCounts[level] || 0}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Rule Cards */}
      <div className={styles.ruleList}>
        {filteredRules.map((rule, idx) => (
          <AccessibilityIssueCard
            key={`${rule.ruleId}-${rule.url}-${idx}`}
            rule={rule}
            auditId={auditId}
            siteId={siteId}
            onFixComplete={onFixComplete}
            translateIssueMsg={translateIssueMsg}
            locale={locale}
          />
        ))}

        {filteredRules.length === 0 && (
          <div className={styles.noMatch}>
            <p>{t('siteAudit.a11y.noMatchFilter')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function getScoreColor(score) {
  if (score >= 80) return 'good';
  if (score >= 50) return 'warning';
  return 'bad';
}
