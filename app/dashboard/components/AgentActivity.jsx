'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Bot, CheckCircle, XCircle, Clock, AlertTriangle, Lightbulb,
  TrendingUp, TrendingDown, Minus, Search, FileText, Users, Wrench, Loader2, Play,
  ChevronDown, ChevronUp, Eye, EyeOff, ExternalLink, Sparkles,
} from 'lucide-react';
import { useSite } from '@/app/context/site-context';
import { useAgent } from '@/app/context/agent-context';
import { DashboardCard } from './DashboardCard';
import { ArrowIcon } from '@/app/components/ui/arrow-icon';
import FixPreviewModal from './FixPreviewModal';
import { formatPageUrl } from '@/lib/urlDisplay';
import styles from './AgentActivity.module.css';

const FIXABLE_INSIGHT_TYPES = new Set(['missingSeo', 'keywordStrikeZone']);

function isFixableInsight(titleKey) {
  const type = titleKey?.match(/agent\.insights\.(\w+)\.title/)?.[1];
  return FIXABLE_INSIGHT_TYPES.has(type);
}

const CATEGORY_ICONS = {
  CONTENT: FileText,
  TRAFFIC: TrendingUp,
  KEYWORDS: Search,
  COMPETITORS: Users,
  TECHNICAL: Wrench,
};

const TYPE_COLORS = {
  DISCOVERY: 'info',
  SUGGESTION: 'warning',
  ACTION: 'primary',
  ANALYSIS: 'neutral',
  ALERT: 'error',
};

const PRIORITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

// Positive insight types (trafficGrowth etc.) — direction is "up"
const POSITIVE_INSIGHT_TYPES = new Set(['trafficGrowth']);
const NEGATIVE_INSIGHT_TYPES = new Set(['trafficDrop', 'visitorsDrop', 'decliningPages']);

/**
 * Determine the display sentiment color for an insight.
 * green = positive, orange = warning, red = severe, gray = neutral/low
 */
function getInsightSentiment(insight) {
  const insightType = insight.titleKey?.match(/agent\.insights\.(\w+)\.title/)?.[1];
  const direction = getInsightDirection(insight);

  // If actual change is exactly 0 → neutral/gray
  if (direction === 'equal') return 'neutral';

  // Positive insights → green (only when direction confirms it)
  if (POSITIVE_INSIGHT_TYPES.has(insightType)) return direction === 'down' ? 'warning' : 'positive';
  if (insight.type === 'DISCOVERY' && !NEGATIVE_INSIGHT_TYPES.has(insightType)) return 'positive';

  // Severe problems → red
  if (insight.type === 'ALERT' && (insight.priority === 'CRITICAL' || insight.priority === 'HIGH')) return 'severe';

  // Low priority → gray
  if (insight.priority === 'LOW') return 'neutral';

  // Everything else (suggestions, actions, medium alerts) → orange warning
  return 'warning';
}

/**
 * Determine the direction arrow for an insight.
 * Returns 'up' | 'down' | 'equal' based on data change values.
 */
function getInsightDirection(insight) {
  const d = insight.data || {};
  const change = d.change ?? d.clicksChange ?? d.visitorsChange;
  if (change === undefined || change === null) {
    // Default direction based on insight type when data is missing
    const insightType = insight.titleKey?.match(/agent\.insights\.(\w+)\.title/)?.[1];
    if (NEGATIVE_INSIGHT_TYPES.has(insightType)) return 'down';
    if (POSITIVE_INSIGHT_TYPES.has(insightType)) return 'up';
    return null;
  }
  if (change > 0) return 'up';
  if (change < 0) return 'down';
  return 'equal';
}

/**
 * Resolves a translation key like "agent.insights.keywordStrikeZone.title"
 * and replaces {placeholders} with values from data.
 */
function resolveTranslation(translations, titleKey, data = {}) {
  // Navigate to the translation
  const parts = titleKey.split('.');
  let value = translations;
  for (const part of parts) {
    value = value?.[part];
    if (!value) return titleKey; // fallback to key
  }

  if (typeof value !== 'string') return titleKey;

  // Replace placeholders like {keyword}, {count}, {change}
  return value.replace(/\{(\w+)\}/g, (match, key) => {
    let val = data[key];

    // Fallback: {change} might be stored as clicksChange/visitorsChange (integer %)
    if (val === undefined && key === 'change') {
      if (data.clicksChange !== undefined) val = data.clicksChange / 100;
      else if (data.visitorsChange !== undefined) val = data.visitorsChange / 100;
    }

    if (val !== undefined && val !== null && !Number.isNaN(val)) {
      // Format percentages
      if (key.toLowerCase().includes('change')) {
        return Math.abs(Math.round(val * 100));
      }
      return val;
    }
    return match;
  });
}

function getInsightType(titleKey) {
  const match = titleKey?.match(/agent\.insights\.(\w+)\.title/);
  return match?.[1] || null;
}

function isInsightFullyFixed(insight) {
  const type = getInsightType(insight.titleKey);
  const isFixable = FIXABLE_INSIGHT_TYPES.has(type);

  if (!isFixable) {
    return !['PENDING', 'FAILED'].includes(insight.status);
  }

  const results = insight.executionResult?.results || [];
  if (results.length === 0) return false;

  if (type === 'keywordStrikeZone') {
    return results.some(r => r.status === 'fixed');
  }

  const pages = insight.data?.pages || [];
  if (pages.length === 0) return false;

  const fixedUrls = new Set(results.filter(r => r.status === 'fixed').map(r => r.url));
  return pages.every(p => fixedUrls.has(p.url));
}

// Moved to lib/urlDisplay.js

/**
 * Resolve change % from insight data, checking all possible fields.
 * Returns an integer percentage (e.g. -25, 100, 0).
 */
function resolveChangePercent(d) {
  if (d.change !== undefined && d.change !== null) return Math.round(d.change * 100);
  if (d.clicksChange !== undefined && d.clicksChange !== null) return d.clicksChange;
  if (d.visitorsChange !== undefined && d.visitorsChange !== null) return d.visitorsChange;
  if (d.sessionsChange !== undefined && d.sessionsChange !== null) return d.sessionsChange;
  return 0;
}

function InsightDetails({ insight, translations }) {
  const d = insight.data;
  if (!d) return null;

  const labels = translations?.agent?.detailLabels || {};
  const type = getInsightType(insight.titleKey);

  if (type === 'keywordStrikeZone') {
    return (
      <div className={styles.detailSection}>
        <div className={styles.detailStats}>
          <div className={styles.detailStat}>
            <span className={styles.detailStatLabel}>{labels.keyword || 'Keyword'}</span>
            <span className={styles.detailStatValue}>{d.keyword}</span>
          </div>
          <div className={styles.detailStat}>
            <span className={styles.detailStatLabel}>{labels.position || 'Position'}</span>
            <span className={styles.detailStatValue}>{d.position}</span>
          </div>
          <div className={styles.detailStat}>
            <span className={styles.detailStatLabel}>{labels.searchVolume || 'Search Volume'}</span>
            <span className={styles.detailStatValue}>{d.searchVolume?.toLocaleString()}</span>
          </div>
        </div>
        {d.url && (
          <a href={d.url} target="_blank" rel="noopener noreferrer" className={styles.detailLink}>
            <bdi dir="ltr">{formatPageUrl(d.url)}</bdi> <ExternalLink size={12} />
          </a>
        )}
      </div>
    );
  }

  if (type === 'unlinkedKeywords' && d.keywords?.length > 0) {
    return (
      <div className={styles.detailSection}>
        <table className={styles.detailTable}>
          <thead><tr><th>{labels.keyword || 'Keyword'}</th><th>{labels.searchVolume || 'Search Volume'}</th></tr></thead>
          <tbody>
            {d.keywords.slice(0, 5).map((k, i) => (
              <tr key={i}><td>{k.keyword}</td><td>{k.searchVolume?.toLocaleString()}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (type === 'staleContent' && d.oldestPages?.length > 0) {
    return (
      <div className={styles.detailSection}>
        <table className={styles.detailTable}>
          <thead><tr><th>{labels.page || 'Page'}</th><th>{labels.lastUpdated || 'Last Updated'}</th></tr></thead>
          <tbody>
            {d.oldestPages.slice(0, 5).map((p, i) => (
              <tr key={i}><td>{p.title}</td><td>{p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : '—'}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (type === 'missingSeo' && d.pages?.length > 0) {
    const seen = new Set();
    const uniquePages = d.pages.filter(p => {
      const key = p.url?.replace(/^https?:\/\//, '').replace(/\/$/, '') || p.slug || p.title;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const detectedDate = insight.createdAt || insight.detectedAt;
    return (
      <div className={styles.detailSection}>
        <div className={styles.seoPagesList}>
          {uniquePages.slice(0, 5).map((p, i) => (
            <div key={i} className={styles.seoPageItem}>
              {detectedDate && (
                <span className={styles.seoPageDate}>
                  <Clock size={12} />
                  {new Date(detectedDate).toLocaleDateString()}
                </span>
              )}
              <span className={styles.seoPageTitle}>{p.title}</span>
              {p.url && (
                <a href={p.url} target="_blank" rel="noopener noreferrer" className={styles.detailLink}>
                  <bdi dir="ltr">{formatPageUrl(p.url)}</bdi> <ExternalLink size={12} />
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === 'noindexDetected' && d.pages?.length > 0) {
    return (
      <div className={styles.detailSection}>
        <table className={styles.detailTable}>
          <thead><tr><th>{labels.page || 'Page'}</th><th>{labels.url || 'URL'}</th></tr></thead>
          <tbody>
            {d.pages.slice(0, 5).map((p, i) => (
              <tr key={i}>
                <td>{p.title}</td>
                <td>{p.url && <a href={p.url} target="_blank" rel="noopener noreferrer" className={styles.detailLink}><bdi dir="ltr">{formatPageUrl(p.url)}</bdi> <ExternalLink size={12} /></a>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (type === 'trafficDrop') {
    const changeVal = resolveChangePercent(d);
    return (
      <div className={styles.detailSection}>
        <div className={styles.detailStats}>
          <div className={styles.detailStat}>
            <span className={styles.detailStatLabel}>{labels.clicks || 'Clicks'}</span>
            <span className={styles.detailStatValue}>{d.clicks?.toLocaleString()}</span>
          </div>
          <div className={`${styles.detailStat} ${changeVal < 0 ? styles.detailStatNegative : changeVal > 0 ? styles.detailStatPositive : ''}`}>
            <span className={styles.detailStatLabel}>{labels.clicksChange || 'Change'}</span>
            <span className={styles.detailStatValue}>
              {changeVal < 0 ? <><TrendingDown size={14} /> {changeVal}%</> : changeVal > 0 ? <><TrendingUp size={14} /> +{changeVal}%</> : <><Minus size={14} /> 0%</>}
            </span>
          </div>
          <div className={styles.detailStat}>
            <span className={styles.detailStatLabel}>{labels.impressions || 'Impressions'}</span>
            <span className={styles.detailStatValue}>{d.impressions?.toLocaleString()}</span>
          </div>
        </div>
      </div>
    );
  }

  if (type === 'lowCtrQueries' && d.queries?.length > 0) {
    return (
      <div className={styles.detailSection}>
        <table className={styles.detailTable}>
          <thead><tr><th>{labels.query || 'Query'}</th><th>{labels.impressions || 'Impressions'}</th><th>CTR</th><th>{labels.position || 'Position'}</th></tr></thead>
          <tbody>
            {d.queries.slice(0, 5).map((q, i) => (
              <tr key={i}><td>{q.query}</td><td>{q.impressions?.toLocaleString()}</td><td>{q.ctr}%</td><td>{q.position ? Math.round(parseFloat(q.position)) : '—'}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (type === 'decliningPages' && d.pages?.length > 0) {
    return (
      <div className={styles.detailSection}>
        <table className={styles.detailTable}>
          <thead><tr><th>{labels.page || 'Page'}</th><th>{labels.clicks || 'Clicks'}</th><th>{labels.change || 'Change'}</th></tr></thead>
          <tbody>
            {d.pages.slice(0, 5).map((p, i) => (
              <tr key={i}>
                <td><bdi dir="ltr">{p.page ? formatPageUrl(p.page) : '—'}</bdi></td>
                <td>{p.clicks?.toLocaleString()}</td>
                <td className={styles.detailNegative}>{p.clicksChange}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (type === 'visitorsDrop') {
    const changeVal = resolveChangePercent(d);
    return (
      <div className={styles.detailSection}>
        <div className={styles.detailStats}>
          <div className={styles.detailStat}>
            <span className={styles.detailStatLabel}>{labels.visitors || 'Visitors'}</span>
            <span className={styles.detailStatValue}>{d.visitors?.toLocaleString()}</span>
          </div>
          <div className={`${styles.detailStat} ${changeVal < 0 ? styles.detailStatNegative : changeVal > 0 ? styles.detailStatPositive : ''}`}>
            <span className={styles.detailStatLabel}>{labels.change || 'Change'}</span>
            <span className={styles.detailStatValue}>
              {changeVal < 0 ? <><TrendingDown size={14} /> {changeVal}%</> : changeVal > 0 ? <><TrendingUp size={14} /> +{changeVal}%</> : <><Minus size={14} /> 0%</>}
            </span>
          </div>
          <div className={styles.detailStat}>
            <span className={styles.detailStatLabel}>{labels.sessions || 'Sessions'}</span>
            <span className={styles.detailStatValue}>{d.sessions?.toLocaleString()}</span>
          </div>
        </div>
      </div>
    );
  }

  if (type === 'trafficGrowth') {
    const changeVal = resolveChangePercent(d);
    return (
      <div className={styles.detailSection}>
        <div className={styles.detailStats}>
          <div className={styles.detailStat}>
            <span className={styles.detailStatLabel}>{labels.visitors || 'Visitors'}</span>
            <span className={styles.detailStatValue}>{d.visitors?.toLocaleString()}</span>
          </div>
          <div className={`${styles.detailStat} ${changeVal > 0 ? styles.detailStatPositive : changeVal < 0 ? styles.detailStatNegative : ''}`}>
            <span className={styles.detailStatLabel}>{labels.change || 'Change'}</span>
            <span className={styles.detailStatValue}>
              {changeVal > 0 ? <><TrendingUp size={14} /> +{changeVal}%</> : changeVal < 0 ? <><TrendingDown size={14} /> {changeVal}%</> : <><Minus size={14} /> 0%</>}
            </span>
          </div>
          <div className={styles.detailStat}>
            <span className={styles.detailStatLabel}>{labels.pageViews || 'Page Views'}</span>
            <span className={styles.detailStatValue}>{d.pageViews?.toLocaleString()}</span>
          </div>
        </div>
      </div>
    );
  }

  if (type === 'contentGaps' && d.topGaps?.length > 0) {
    return (
      <div className={styles.detailSection}>
        <table className={styles.detailTable}>
          <thead><tr><th>{labels.contentGap || 'Content Gap'}</th><th>{labels.competitor || 'Competitor'}</th></tr></thead>
          <tbody>
            {d.topGaps.slice(0, 5).map((g, i) => (
              <tr key={i}><td>{g.gap}</td><td>{g.competitor}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (type === 'staleCompetitorScans' && d.competitors?.length > 0) {
    return (
      <div className={styles.detailSection}>
        <table className={styles.detailTable}>
          <thead><tr><th>{labels.competitor || 'Competitor'}</th><th>{labels.lastScanned || 'Last Scanned'}</th></tr></thead>
          <tbody>
            {d.competitors.slice(0, 5).map((c, i) => (
              <tr key={i}><td>{c.domain}</td><td>{c.lastScannedAt ? new Date(c.lastScannedAt).toLocaleDateString() : '—'}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (type === 'cannibalization' && d.queries?.length > 0) {
    return (
      <div className={styles.detailSection}>
        {d.queries.slice(0, 3).map((c, i) => (
          <div key={i} style={{ marginBottom: '0.5rem' }}>
            <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem' }}>&quot;{c.query}&quot; — {c.pageCount} {labels.pageCount || 'pages competing'}</div>
            <table className={styles.detailTable}>
              <thead><tr><th>{labels.page || 'Page'}</th><th>{labels.position || 'Position'}</th><th>{labels.clicks || 'Clicks'}</th></tr></thead>
              <tbody>
                {c.pages.slice(0, 3).map((p, j) => (
                  <tr key={j}>
                    <td><bdi dir="ltr">{p.page ? formatPageUrl(p.page) : '—'}</bdi></td>
                    <td>{p.position ? Math.round(parseFloat(p.position)) : '—'}</td>
                    <td>{p.clicks?.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    );
  }

  if (type === 'newKeywordOpportunities' && d.queries?.length > 0) {
    return (
      <div className={styles.detailSection}>
        <table className={styles.detailTable}>
          <thead><tr><th>{labels.query || 'Query'}</th><th>{labels.clicks || 'Clicks'}</th><th>{labels.impressions || 'Impressions'}</th><th>{labels.position || 'Position'}</th></tr></thead>
          <tbody>
            {d.queries.slice(0, 5).map((q, i) => (
              <tr key={i}><td>{q.query}</td><td>{q.clicks?.toLocaleString()}</td><td>{q.impressions?.toLocaleString()}</td><td>{q.position ? Math.round(parseFloat(q.position)) : '—'}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (type === 'lowCtrForPosition' && d.pages?.length > 0) {
    return (
      <div className={styles.detailSection}>
        <table className={styles.detailTable}>
          <thead><tr><th>{labels.page || 'Page'}</th><th>{labels.position || 'Position'}</th><th>{labels.actualCtr || 'Actual CTR'}</th><th>{labels.expectedCtr || 'Expected CTR'}</th></tr></thead>
          <tbody>
            {d.pages.slice(0, 5).map((p, i) => (
              <tr key={i}>
                <td><bdi dir="ltr">{p.page ? formatPageUrl(p.page) : '—'}</bdi></td>
                <td>{p.position ? Math.round(parseFloat(p.position)) : '—'}</td>
                <td className={styles.detailNegative}>{p.actualCtr}%</td>
                <td>{p.expectedCtr}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (type === 'contentWithoutTraffic' && d.pages?.length > 0) {
    return (
      <div className={styles.detailSection}>
        <table className={styles.detailTable}>
          <thead><tr><th>{labels.page || 'Page'}</th><th>{labels.publishedAt || 'Published'}</th></tr></thead>
          <tbody>
            {d.pages.slice(0, 5).map((p, i) => (
              <tr key={i}>
                <td>{p.title}</td>
                <td>{p.publishedAt ? new Date(p.publishedAt).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return null;
}

function InsightLegend({ translations }) {
  const [open, setOpen] = useState(false);
  const legend = translations?.agent?.legend || {};
  const priorities = translations?.agent?.priorities || {};
  const categories = translations?.agent?.categories || {};

  return (
    <div className={styles.legend}>
      <button className={styles.legendToggle} onClick={() => setOpen(!open)}>
        <Lightbulb size={14} />
        <span>{legend.title || 'Legend'}</span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <div className={styles.legendContent}>
          <div className={styles.legendSection}>
            <span className={styles.legendSectionTitle}>{legend.priorityTitle || 'Priority'}</span>
            <div className={styles.legendItems}>
              <div className={styles.legendItem}>
                <span className={`${styles.badge} ${styles.badgeCRITICAL}`}>{priorities.CRITICAL || 'Critical'}</span>
                <span className={styles.legendDesc}>{legend.CRITICAL || 'Urgent issue'}</span>
              </div>
              <div className={styles.legendItem}>
                <span className={`${styles.badge} ${styles.badgeHIGH}`}>{priorities.HIGH || 'High'}</span>
                <span className={styles.legendDesc}>{legend.HIGH || 'Important issue'}</span>
              </div>
              <div className={styles.legendItem}>
                <span className={`${styles.badge} ${styles.badgeMEDIUM}`}>{priorities.MEDIUM || 'Medium'}</span>
                <span className={styles.legendDesc}>{legend.MEDIUM || 'Worth reviewing'}</span>
              </div>
              <div className={styles.legendItem}>
                <span className={`${styles.badge} ${styles.badgeLOW}`}>{priorities.LOW || 'Low'}</span>
                <span className={styles.legendDesc}>{legend.LOW || 'Minor observation'}</span>
              </div>
            </div>
          </div>
          <div className={styles.legendSection}>
            <span className={styles.legendSectionTitle}>{legend.categoryTitle || 'Category'}</span>
            <div className={styles.legendItems}>
              {Object.entries(CATEGORY_ICONS).map(([key, Icon]) => (
                <div key={key} className={styles.legendItem}>
                  <Icon size={14} className={styles.legendCategoryIcon} />
                  <span className={styles.legendDesc}>{categories[key] || key}</span>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.legendSection}>
            <span className={styles.legendSectionTitle}>{legend.directionTitle || 'Direction'}</span>
            <div className={styles.legendItems}>
              <div className={styles.legendItem}>
                <TrendingUp size={14} className={styles.legendIconUp} />
                <span className={styles.legendDesc}>{legend.up || 'Positive trend'}</span>
              </div>
              <div className={styles.legendItem}>
                <TrendingDown size={14} className={styles.legendIconDown} />
                <span className={styles.legendDesc}>{legend.down || 'Negative trend'}</span>
              </div>
              <div className={styles.legendItem}>
                <Minus size={14} className={styles.legendIconEqual} />
                <span className={styles.legendDesc}>{legend.equal || 'No change'}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InsightItem({ insight, translations, onAction, onOpenFix, pluginConnected }) {
  const [expanded, setExpanded] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const CategoryIcon = CATEGORY_ICONS[insight.category] || FileText;
  const sentiment = getInsightSentiment(insight);
  const direction = getInsightDirection(insight);
  const title = resolveTranslation(translations, insight.titleKey, insight.data);
  const description = resolveTranslation(translations, insight.descriptionKey, insight.data);

  const handleAction = async (actionType) => {
    setActionLoading(true);
    try {
      await onAction(insight.id, actionType);
    } finally {
      setActionLoading(false);
    }
  };

  const statusLabel = translations?.agent?.[insight.status.toLowerCase()] || insight.status;
  const categoryLabel = translations?.agent?.categories?.[insight.category] || insight.category;
  const priorityLabel = translations?.agent?.priorities?.[insight.priority] || insight.priority;

  const isActionable = insight.status === 'PENDING' && insight.type === 'ACTION';
  const isPending = insight.status === 'PENDING' || insight.status === 'FAILED';
  const canFix = pluginConnected && isFixableInsight(insight.titleKey) && ['PENDING', 'APPROVED', 'FAILED', 'EXECUTED'].includes(insight.status);
  const showActions = isPending || canFix;

  const DirectionIcon = direction === 'up' ? TrendingUp : direction === 'down' ? TrendingDown : direction === 'equal' ? Minus : null;
  const DisplayIcon = DirectionIcon || CategoryIcon;

  return (
    <div className={`${styles.insightItem} ${styles[sentiment]}`}>
      <div className={styles.insightHeader} onClick={() => setExpanded(!expanded)}>
        <div className={styles.insightLeft}>
          <div className={`${styles.insightIcon} ${styles[sentiment]}`}>
            <DisplayIcon size={16} />
          </div>
          <div className={styles.insightMeta}>
            <div className={styles.insightTitleRow}>
              <span className={styles.insightTitle}>{title}</span>
            </div>
            <div className={styles.insightBadges}>
              <span className={`${styles.badge} ${styles[`badge${insight.priority}`]}`}>{priorityLabel}</span>
              <span className={styles.badgeCategory}>{categoryLabel}</span>
            </div>
          </div>
        </div>
        <div className={styles.insightRight}>
          {!isPending && !canFix && (
            <span className={`${styles.statusBadge} ${styles[`status${insight.status}`]}`}>
              {statusLabel}
            </span>
          )}
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {expanded && (
        <div className={styles.insightBody}>
          <p className={styles.insightDescription}>{description}</p>
          <InsightDetails insight={insight} translations={translations} />
          {showActions && (
            <div className={styles.insightActions}>
              {canFix && (
                <button
                  className={`${styles.actionBtn} ${styles.fixBtn}`}
                  onClick={() => onOpenFix(insight)}
                  disabled={actionLoading}
                >
                  <Sparkles size={14} />
                  {translations?.agent?.fixWithAi || 'Fix with AI'}
                </button>
              )}
              {isActionable && (
                <button
                  className={`${styles.actionBtn} ${styles.approveBtn}`}
                  onClick={() => handleAction('approve')}
                  disabled={actionLoading}
                >
                  <CheckCircle size={14} />
                  {translations?.agent?.approve || 'Approve'}
                </button>
              )}
              {isPending && (
                <button
                  className={`${styles.actionBtn} ${styles.rejectBtn}`}
                  onClick={() => handleAction('reject')}
                  disabled={actionLoading}
                >
                  <XCircle size={14} />
                  {translations?.agent?.reject || 'Reject'}
                </button>
              )}
              {isPending && (
                <button
                  className={`${styles.actionBtn} ${styles.dismissBtn}`}
                  onClick={() => handleAction('dismiss')}
                  disabled={actionLoading}
                >
                  <EyeOff size={14} />
                  {translations?.agent?.dismiss || 'Dismiss'}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AgentActivity({ translations, onInsightsLoaded }) {
  const { selectedSite } = useSite();
  const { runningAnalysis, lastAnalysisTs, runAnalysis } = useAgent();
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  const t = translations;

  const fetchInsights = useCallback(async () => {
    if (!selectedSite?.id) return;

    try {
      setLoading(true);
      const res = await fetch(`/api/agent/insights?siteId=${selectedSite.id}&limit=10`);
      if (!res.ok) throw new Error('Failed to fetch insights');
      const data = await res.json();
      const items = data.items || [];
      // Deduplicate by titleKey + core data key
      const seen = new Set();
      const deduped = items.filter(item => {
        const key = item.titleKey + ':' + (item.data?.keyword || item.data?.query || '');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      // Dashboard only shows items that still need attention
      const unfixed = deduped.filter(i => !isInsightFullyFixed(i));
      setInsights(unfixed);
      setPendingCount(data.pendingCount || 0);
      onInsightsLoaded?.(unfixed.length > 0);
    } catch (err) {
      console.error('[AgentActivity] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedSite?.id, onInsightsLoaded]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights, lastAnalysisTs]);

  const handleAction = async (insightId, action) => {
    try {
      const res = await fetch(`/api/agent/insights/${insightId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) throw new Error('Action failed');

      // Refresh the list
      await fetchInsights();
    } catch (err) {
      console.error('[AgentActivity] Action error:', err);
    }
  };

  const pluginConnected = selectedSite?.connectionStatus === 'CONNECTED';
  const [fixModalInsight, setFixModalInsight] = useState(null);

  const handleRunAnalysis = () => runAnalysis(selectedSite?.id);

  const headerRight = (
    <button
      className={styles.runBtn}
      onClick={handleRunAnalysis}
      disabled={runningAnalysis || !selectedSite?.id}
    >
      {runningAnalysis ? (
        <><Loader2 size={14} className={styles.spinning} /> {t?.agent?.running || 'Analyzing...'}</>
      ) : (
        <><Play size={14} /> {t?.agent?.runAnalysis || 'Run Analysis'}</>
      )}
    </button>
  );

  return (
    <DashboardCard
      title={t?.agent?.title || t?.aiAgentActivity || 'AI Agent Activity'}
      headerRight={headerRight}
    >
      <div className={styles.activityContainer}>
        {loading ? (
          <div className={styles.loadingState}>
            <Loader2 size={24} className={styles.spinning} />
          </div>
        ) : insights.length === 0 ? (
          <div className={styles.emptyState}>
            <Bot size={32} className={styles.emptyIcon} />
            <p>{t?.agent?.noInsights || 'No insights yet.'}</p>
          </div>
        ) : (
          <>
            {pendingCount > 0 && (
              <div className={styles.pendingBanner}>
                <AlertTriangle size={14} />
                <span>{(t?.agent?.pendingApproval || '{count} pending approval').replace('{count}', pendingCount)}</span>
              </div>
            )}
            <InsightLegend translations={t} />
            <div className={styles.insightsList}>
              {insights.map(insight => (
                <InsightItem
                  key={insight.id}
                  insight={insight}
                  translations={t}
                  onAction={handleAction}
                  onOpenFix={setFixModalInsight}
                  pluginConnected={pluginConnected}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <Link href="/dashboard/agent" className={styles.viewAllLink}>
        {t?.agent?.viewAll || t?.viewAllActivity || 'View All Activity'}
        <ArrowIcon size={16} />
      </Link>

      <FixPreviewModal
        open={!!fixModalInsight}
        onClose={() => setFixModalInsight(null)}
        insight={fixModalInsight}
        translations={t}
        onApplied={fetchInsights}
      />
    </DashboardCard>
  );
}
