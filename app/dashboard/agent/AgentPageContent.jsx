'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Bot, CheckCircle, XCircle, Clock, AlertTriangle, Lightbulb,
  TrendingUp, TrendingDown, Minus, Search, FileText, Users, Wrench, Loader2, Play,
  ChevronDown, ChevronUp, EyeOff, Filter, RefreshCw, ExternalLink, Sparkles,
} from 'lucide-react';
import { useSite } from '@/app/context/site-context';
import { useAgent } from '@/app/context/agent-context';
import { PageHeader } from '../components';
import FixPreviewModal from '../components/FixPreviewModal';
import styles from './agent.module.css';

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

const CATEGORIES = ['CONTENT', 'TRAFFIC', 'KEYWORDS', 'COMPETITORS', 'TECHNICAL'];
const STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'EXECUTED', 'FAILED', 'EXPIRED', 'RESOLVED'];

const POSITIVE_INSIGHT_TYPES = new Set(['trafficGrowth']);
const NEGATIVE_INSIGHT_TYPES = new Set(['trafficDrop', 'visitorsDrop', 'decliningPages']);

function getInsightSentiment(insight) {
  const insightType = insight.titleKey?.match(/agent\.insights\.(\w+)\.title/)?.[1];
  const direction = getInsightDirection(insight);

  // If actual change is exactly 0 → neutral/gray
  if (direction === 'equal') return 'neutral';

  // Positive insights → green (only when direction confirms it)
  if (POSITIVE_INSIGHT_TYPES.has(insightType)) return direction === 'down' ? 'warning' : 'positive';
  if (insight.type === 'DISCOVERY' && !NEGATIVE_INSIGHT_TYPES.has(insightType)) return 'positive';
  if (insight.type === 'ALERT' && (insight.priority === 'CRITICAL' || insight.priority === 'HIGH')) return 'severe';
  if (insight.priority === 'LOW') return 'neutral';
  return 'warning';
}

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

function resolveTranslation(translations, titleKey, data = {}) {
  const parts = titleKey.split('.');
  let value = translations;
  for (const part of parts) {
    value = value?.[part];
    if (!value) return titleKey;
  }
  if (typeof value !== 'string') return titleKey;
  return value.replace(/\{(\w+)\}/g, (match, key) => {
    let val = data[key];

    // Fallback: {change} might be stored as clicksChange/visitorsChange (integer %)
    if (val === undefined && key === 'change') {
      if (data.clicksChange !== undefined) val = data.clicksChange / 100;
      else if (data.visitorsChange !== undefined) val = data.visitorsChange / 100;
    }

    if (val !== undefined && val !== null && !Number.isNaN(val)) {
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

/**
 * Check if an insight is "fully fixed" — all fixable items have been applied.
 * For non-fixable insights, checks if status is resolved (not PENDING/FAILED).
 */
function isInsightFullyFixed(insight) {
  const type = getInsightType(insight.titleKey);
  const isFixable = FIXABLE_INSIGHT_TYPES.has(type);

  if (!isFixable) {
    // Non-fixable insights: consider "fixed" if resolved status
    return !['PENDING', 'FAILED'].includes(insight.status);
  }

  const results = insight.executionResult?.results || [];
  if (results.length === 0) return false;

  // Count how many items need fixing
  if (type === 'keywordStrikeZone') {
    return results.some(r => r.status === 'fixed');
  }

  // missingSeo — check if all pages have been fixed
  const pages = insight.data?.pages || [];
  if (pages.length === 0) return false;

  const fixedUrls = new Set(results.filter(r => r.status === 'fixed').map(r => r.url));
  return pages.every(p => fixedUrls.has(p.url));
}

function formatPageUrl(url) {
  try {
    const parsed = new URL(url);
    const display = parsed.pathname === '/' ? parsed.origin : parsed.pathname;
    return decodeURIComponent(display);
  } catch {
    try { return decodeURIComponent(url); } catch { return url; }
  }
}

function resolveChangePercent(d) {
  if (d.change !== undefined && d.change !== null) return Math.round(d.change * 100);
  if (d.clicksChange !== undefined && d.clicksChange !== null) return d.clicksChange;
  if (d.visitorsChange !== undefined && d.visitorsChange !== null) return d.visitorsChange;
  if (d.sessionsChange !== undefined && d.sessionsChange !== null) return d.sessionsChange;
  return 0;
}

function EntityLinkCell({ url, siteId, translations }) {
  const [entity, setEntity] = useState(undefined); // undefined=loading, null=not found, object=found
  const labels = translations?.agent?.detailLabels || {};

  useEffect(() => {
    if (!url || !siteId) { setEntity(null); return; }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/agent/entity-lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteId, urls: [url] }),
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        const found = data.urlMap?.[url] || null;
        if (!cancelled) setEntity(found);
      } catch {
        if (!cancelled) setEntity(null);
      }
    })();
    return () => { cancelled = true; };
  }, [url, siteId]);

  if (entity === undefined) return <span className={styles.entitySkeleton}><span className={styles.entitySkeletonBar} /></span>;
  if (entity) {
    const entityTypes = translations?.entities || {};
    const raw = entityTypes[entity.entityTypeSlug];
    const typeLabel = (typeof raw === 'string' ? raw : raw?.title) || entity.entityTypeName || entity.entityTypeSlug;
    return (
      <span className={styles.entityCell}>
        {entity.entityTypeSlug && (
          <><a href={`/dashboard/entities/${entity.entityTypeSlug}`} className={styles.entityTypeLink}>
            {typeLabel}
          </a><span className={styles.entitySep}>&gt;</span></>
        )}
        <a href={`/dashboard/entities/${entity.entityTypeSlug}/${entity.entityId}`} className={styles.entityLink}>
          {entity.title || (labels.viewEntity || 'View')}
        </a>
      </span>
    );
  }
  return <span className={styles.entityNone}>—</span>;
}

/**
 * Per-item fix button — generates AI SEO + applies for a single item.
 * Shows: idle → generating → applying → done/error
 */
function ItemFixButton({ insightId, itemIndex, translations, onItemFixed }) {
  const [phase, setPhase] = useState('idle'); // idle | generating | applying | done | error
  const [errorMsg, setErrorMsg] = useState(null);

  const handleFix = async () => {
    setPhase('generating');
    setErrorMsg(null);
    try {
      // Step 1: Generate AI proposal for this item
      const genRes = await fetch(`/api/agent/insights/${insightId}/fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'regenerate', itemIndex }),
      });
      const genData = await genRes.json();
      if (!genRes.ok || !genData.proposal) throw new Error(genData.error || 'Generation failed');

      // Step 2: Apply the proposal
      setPhase('applying');
      const applyRes = await fetch(`/api/agent/insights/${insightId}/fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'apply', proposals: [genData.proposal] }),
      });
      const applyData = await applyRes.json();
      if (!applyRes.ok) throw new Error(applyData.error || 'Apply failed');

      const itemResult = applyData.results?.[0];
      if (itemResult?.status === 'fixed') {
        setPhase('done');
        if (onItemFixed) onItemFixed();
      } else {
        throw new Error(itemResult?.reason || 'Fix failed');
      }
    } catch (err) {
      console.error('[ItemFix] error:', err);
      setPhase('error');
      setErrorMsg(err.message);
    }
  };

  if (phase === 'done') {
    return <span className={styles.itemFixedBadge}><CheckCircle size={12} /> {translations.fixItemApplied || 'Applied'}</span>;
  }

  if (phase === 'error') {
    return (
      <button className={styles.itemFixBtn} onClick={handleFix} title={errorMsg}>
        <RefreshCw size={12} /> {translations.fixRetry || 'Retry'}
      </button>
    );
  }

  if (phase === 'generating' || phase === 'applying') {
    return (
      <span className={styles.itemFixingBadge}>
        <Loader2 size={12} className={styles.spinning} />
        {phase === 'generating' ? (translations.fixGeneratingShort || 'Generating...') : (translations.fixApplyingItem || 'Applying...')}
      </span>
    );
  }

  return (
    <button className={styles.itemFixBtn} onClick={handleFix}>
      <Sparkles size={12} /> {translations.fixApplyItem || 'Apply'}
    </button>
  );
}

function InsightDetails({ insight, translations, siteId, pluginConnected, onItemFixed, onOpenFixSingle }) {
  const d = insight.data;
  if (!d) return null;

  const labels = translations?.agent?.detailLabels || {};
  const t = translations?.agent || {};
  const entityLabel = labels.entity || 'Entity';
  const type = getInsightType(insight.titleKey);
  const canFix = pluginConnected && FIXABLE_INSIGHT_TYPES.has(type) && ['PENDING', 'APPROVED', 'FAILED', 'EXECUTED'].includes(insight.status);

  // Track which items have already been fixed from executionResult
  const fixedPostIds = new Set(
    (insight.executionResult?.results || []).filter(r => r.status === 'fixed').map(r => r.postId)
  );

  // Keyword Strike Zone — single keyword info
  if (type === 'keywordStrikeZone') {
    const isFixed = fixedPostIds.size > 0;
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
          <div className={styles.detailUrlRow}>
            <a href={d.url} target="_blank" rel="noopener noreferrer" className={styles.detailLink}>
              {formatPageUrl(d.url)} <ExternalLink size={12} />
            </a>
            <EntityLinkCell url={d.url} siteId={siteId} translations={translations} />
            {canFix && (
              isFixed
                ? <span className={styles.itemFixedBadge}><CheckCircle size={12} /> {t.fixItemApplied || 'Applied'}</span>
                : <button className={styles.itemFixBtn} onClick={() => onOpenFixSingle?.(insight, [0])}>
                    <Sparkles size={12} /> {t.fixWithAi || 'Fix with AI'}
                  </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // Unlinked Keywords — list of keywords with search volume
  if (type === 'unlinkedKeywords' && d.keywords?.length > 0) {
    return (
      <div className={styles.detailSection}>
        <table className={styles.detailTable}>
          <thead>
            <tr>
              <th>{labels.keyword || 'Keyword'}</th>
              <th>{labels.searchVolume || 'Search Volume'}</th>
            </tr>
          </thead>
          <tbody>
            {d.keywords.map((k, i) => (
              <tr key={i}>
                <td>{k.keyword}</td>
                <td>{k.searchVolume?.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Stale Content — list of pages with last update date
  if (type === 'staleContent' && d.oldestPages?.length > 0) {
    return (
      <div className={styles.detailSection}>
        <table className={styles.detailTable}>
          <thead>
            <tr>
              <th>{labels.page || 'Page'}</th>
              <th>{labels.lastUpdated || 'Last Updated'}</th>
            </tr>
          </thead>
          <tbody>
            {d.oldestPages.map((p, i) => (
              <tr key={i}>
                <td className={styles.detailPageTitle}>{p.title}</td>
                <td>{p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Missing SEO — list of pages
  if (type === 'missingSeo' && d.pages?.length > 0) {
    // Deduplicate pages by normalized URL
    const seen = new Set();
    const uniquePages = d.pages.filter(p => {
      const key = p.url?.replace(/^https?:\/\//, '').replace(/\/$/, '') || p.slug || p.title;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return (
      <div className={styles.detailSection}>
        <table className={styles.detailTable}>
          <thead>
            <tr>
              <th>{labels.page || 'Page'}</th>
              <th>{labels.url || 'URL'}</th>
              <th>{labels.seoPriority || 'Priority'}</th>
              <th>{entityLabel}</th>
              {canFix && <th>{t.fixWithAi || 'Fix with AI'}</th>}
            </tr>
          </thead>
          <tbody>
            {uniquePages.map((p, i) => {
              const originalIndex = d.pages.indexOf(p);
              const itemResults = insight.executionResult?.results || [];
              const itemFixed = itemResults.some(r => r.url === p.url && r.status === 'fixed');
              const priorityLabel = t.seoPriorities?.[p.seoPriority] || p.seoPriority;
              return (
                <tr key={i}>
                  <td className={styles.detailPageTitle}>{p.title}</td>
                  <td>
                    {p.url && (
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className={styles.detailLink}>
                        {formatPageUrl(p.url)} <ExternalLink size={12} />
                      </a>
                    )}
                  </td>
                  <td>{p.seoPriority && <span className={`${styles.seoPriorityBadge} ${styles[`seoPriority_${p.seoPriority}`]}`}>{priorityLabel}</span>}</td>
                  <td><EntityLinkCell url={p.url} siteId={siteId} translations={translations} /></td>
                  {canFix && (
                    <td>
                      {itemFixed
                        ? <span className={styles.itemFixedBadge}><CheckCircle size={12} /> {t.fixItemApplied || 'Applied'}</span>
                        : <button className={styles.itemFixBtn} onClick={() => {
                            onOpenFixSingle?.(insight, [originalIndex]);
                          }}>
                            <Sparkles size={12} /> {t.fixWithAi || 'Fix with AI'}
                          </button>
                      }
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {d.count > d.pages.length && (
          <p className={styles.detailMore}>
            {(labels.andMore || 'and {count} more...').replace('{count}', d.count - d.pages.length)}
          </p>
        )}
      </div>
    );
  }

  // Noindex Detected — list of pages marked noindex
  if (type === 'noindexDetected' && d.pages?.length > 0) {
    return (
      <div className={styles.detailSection}>
        <table className={styles.detailTable}>
          <thead>
            <tr>
              <th>{labels.page || 'Page'}</th>
              <th>{labels.url || 'URL'}</th>
              <th>{entityLabel}</th>
            </tr>
          </thead>
          <tbody>
            {d.pages.map((p, i) => (
              <tr key={i}>
                <td className={styles.detailPageTitle}>{p.title}</td>
                <td>
                  {p.url && (
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className={styles.detailLink}>
                      {formatPageUrl(p.url)} <ExternalLink size={12} />
                    </a>
                  )}
                </td>
                <td><EntityLinkCell url={p.url} siteId={siteId} translations={translations} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {d.count > d.pages.length && (
          <p className={styles.detailMore}>
            {(labels.andMore || 'and {count} more...').replace('{count}', d.count - d.pages.length)}
          </p>
        )}
      </div>
    );
  }

  // Traffic Drop — stats overview
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

  // Low CTR Queries — table of queries
  if (type === 'lowCtrQueries' && d.queries?.length > 0) {
    return (
      <div className={styles.detailSection}>
        <table className={styles.detailTable}>
          <thead>
            <tr>
              <th>{labels.query || 'Query'}</th>
              <th>{labels.impressions || 'Impressions'}</th>
              <th>CTR</th>
              <th>{labels.position || 'Position'}</th>
            </tr>
          </thead>
          <tbody>
            {d.queries.map((q, i) => (
              <tr key={i}>
                <td>{q.query}</td>
                <td>{q.impressions?.toLocaleString()}</td>
                <td>{q.ctr}%</td>
                <td>{q.position ? Math.round(parseFloat(q.position)) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Declining Pages — table of pages with change
  if (type === 'decliningPages' && d.pages?.length > 0) {
    return (
      <div className={styles.detailSection}>
        <table className={styles.detailTable}>
          <thead>
            <tr>
              <th>{labels.page || 'Page'}</th>
              <th>{labels.clicks || 'Clicks'}</th>
              <th>{labels.change || 'Change'}</th>
              <th>{entityLabel}</th>
            </tr>
          </thead>
          <tbody>
            {d.pages.map((p, i) => (
              <tr key={i}>
                <td className={styles.detailPageTitle}>
                  {p.page ? formatPageUrl(p.page) : '—'}
                </td>
                <td>{p.clicks?.toLocaleString()}</td>
                <td className={styles.detailNegative}>{p.clicksChange}%</td>
                <td><EntityLinkCell url={p.page} siteId={siteId} translations={translations} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Visitors Drop — stats overview
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

  // Traffic Growth — stats overview
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

  // Content Gaps — list of gaps
  if (type === 'contentGaps' && d.topGaps?.length > 0) {
    return (
      <div className={styles.detailSection}>
        <table className={styles.detailTable}>
          <thead>
            <tr>
              <th>{labels.contentGap || 'Content Gap'}</th>
              <th>{labels.competitor || 'Competitor'}</th>
            </tr>
          </thead>
          <tbody>
            {d.topGaps.map((g, i) => (
              <tr key={i}>
                <td>{g.gap}</td>
                <td>{g.competitor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Stale Competitor Scans — list of competitors
  if (type === 'staleCompetitorScans' && d.competitors?.length > 0) {
    return (
      <div className={styles.detailSection}>
        <table className={styles.detailTable}>
          <thead>
            <tr>
              <th>{labels.competitor || 'Competitor'}</th>
              <th>{labels.lastScanned || 'Last Scanned'}</th>
            </tr>
          </thead>
          <tbody>
            {d.competitors.map((c, i) => (
              <tr key={i}>
                <td>{c.domain}</td>
                <td>{c.lastScannedAt ? new Date(c.lastScannedAt).toLocaleDateString() : '—'}</td>
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
                <span className={`${styles.tag} ${styles.tagCRITICAL}`}>{priorities.CRITICAL || 'Critical'}</span>
                <span className={styles.legendDesc}>{legend.CRITICAL || 'Urgent issue'}</span>
              </div>
              <div className={styles.legendItem}>
                <span className={`${styles.tag} ${styles.tagHIGH}`}>{priorities.HIGH || 'High'}</span>
                <span className={styles.legendDesc}>{legend.HIGH || 'Important issue'}</span>
              </div>
              <div className={styles.legendItem}>
                <span className={`${styles.tag} ${styles.tagMEDIUM}`}>{priorities.MEDIUM || 'Medium'}</span>
                <span className={styles.legendDesc}>{legend.MEDIUM || 'Worth reviewing'}</span>
              </div>
              <div className={styles.legendItem}>
                <span className={`${styles.tag} ${styles.tagLOW}`}>{priorities.LOW || 'Low'}</span>
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

function InsightRow({ insight, translations, onAction, onOpenFix, siteId, pluginConnected, onItemFixed }) {
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

  const t = translations?.agent || {};
  const statusLabel = t[insight.status.toLowerCase()] || insight.status;
  const categoryLabel = t.categories?.[insight.category] || insight.category;
  const typeLabel = t.types?.[insight.type] || insight.type;
  const priorityLabel = t.priorities?.[insight.priority] || insight.priority;

  const isPending = insight.status === 'PENDING' || insight.status === 'FAILED';
  const isActionable = insight.status === 'PENDING' && insight.type === 'ACTION';
  const canFix = pluginConnected && isFixableInsight(insight.titleKey) && ['PENDING', 'APPROVED', 'FAILED', 'EXECUTED'].includes(insight.status);
  const showActions = isPending || canFix;

  const timeAgo = getTimeAgo(insight.createdAt, translations);
  const DirectionIcon = direction === 'up' ? TrendingUp : direction === 'down' ? TrendingDown : direction === 'equal' ? Minus : null;
  const DisplayIcon = DirectionIcon || CategoryIcon;

  return (
    <div className={`${styles.insightRow} ${styles[sentiment]}`}>
      <div className={styles.insightRowHeader} onClick={() => setExpanded(!expanded)}>
        <div className={`${styles.insightIcon} ${styles[sentiment]}`}>
          <DisplayIcon size={16} />
        </div>
        <div className={styles.insightInfo}>
          <div className={styles.insightTitleRow}>
            <span className={styles.insightTitle}>{title}</span>
          </div>
          <div className={styles.insightTags}>
            <span className={`${styles.tag} ${styles[`tag${insight.priority}`]}`}>{priorityLabel}</span>
            <span className={styles.tagCategory}>{categoryLabel}</span>
            <span className={styles.tagType}>{typeLabel}</span>
          </div>
        </div>
        <div className={styles.insightStatus}>
          <span className={`${styles.statusBadge} ${styles[`status${insight.status}`]}`}>{statusLabel}</span>
        </div>
        <span className={styles.insightTime}>{timeAgo}</span>
        <div className={styles.insightExpand}>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {expanded && (
        <div className={styles.insightRowBody}>
          <p className={styles.insightDescription}>{description}</p>

          <InsightDetails insight={insight} translations={translations} siteId={siteId} pluginConnected={pluginConnected} onItemFixed={onItemFixed} onOpenFixSingle={(i, indices) => onOpenFix(i, indices)} />

          {showActions && (
            <div className={styles.insightActions}>
              {canFix && (
                <button className={`${styles.actionBtn} ${styles.fixBtn}`} onClick={() => onOpenFix(insight, null)} disabled={actionLoading}>
                  <Sparkles size={14} />
                  {translations?.agent?.fixWithAi || 'Fix with AI'}
                </button>
              )}
              {isActionable && (
                <button className={`${styles.actionBtn} ${styles.approveBtn}`} onClick={() => handleAction('approve')} disabled={actionLoading}>
                  <CheckCircle size={14} /> {translations?.approve || 'Approve'}
                </button>
              )}
              {isPending && (
                <button className={`${styles.actionBtn} ${styles.rejectBtn}`} onClick={() => handleAction('reject')} disabled={actionLoading}>
                  <XCircle size={14} /> {translations?.reject || 'Reject'}
                </button>
              )}
              {isPending && (
                <button className={`${styles.actionBtn} ${styles.dismissBtn}`} onClick={() => handleAction('dismiss')} disabled={actionLoading}>
                  <EyeOff size={14} /> {translations?.dismiss || 'Dismiss'}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function getTimeAgo(dateStr, t = {}) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return (t.minutesAgo || '{n}m ago').replace('{n}', mins);
  const hours = Math.floor(mins / 60);
  if (hours < 24) return (t.hoursAgo || '{n}h ago').replace('{n}', hours);
  const days = Math.floor(hours / 24);
  return (t.daysAgo || '{n}d ago').replace('{n}', days);
}

export default function AgentPageContent({ translations }) {
  const t = translations;
  const { selectedSite } = useSite();
  const { runningAnalysis, lastAnalysisTs, runAnalysis } = useAgent();

  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState(null);

  // Filters
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterFixStatus, setFilterFixStatus] = useState('unfixed'); // '' | 'unfixed' | 'fixed'

  const [runs, setRuns] = useState([]);

  const dedup = (items) => {
    const seen = new Set();
    return items.filter(item => {
      const key = item.titleKey + ':' + (item.data?.keyword || item.data?.query || '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const fetchInsights = useCallback(async (append = false) => {
    if (!selectedSite?.id) return;

    try {
      if (!append) setLoading(true);
      const params = new URLSearchParams({ siteId: selectedSite.id, limit: '30' });
      if (filterCategory) params.set('category', filterCategory);
      if (filterStatus) params.set('status', filterStatus);
      if (append && cursor) params.set('cursor', cursor);

      const res = await fetch(`/api/agent/insights?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();

      if (append) {
        setInsights(prev => dedup([...prev, ...(data.items || [])]));
      } else {
        setInsights(dedup(data.items || []));
      }
      setTotalCount(data.totalCount || 0);
      setPendingCount(data.pendingCount || 0);
      setHasMore(data.hasMore || false);
      setCursor(data.nextCursor || null);
    } catch (err) {
      console.error('[AgentPage] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedSite?.id, filterCategory, filterStatus, cursor]);

  // Fetch runs
  const fetchRuns = useCallback(async () => {
    if (!selectedSite?.id) return;
    try {
      const res = await fetch(`/api/agent/runs?siteId=${selectedSite.id}&limit=5`);
      if (res.ok) {
        const data = await res.json();
        setRuns(data.runs || []);
      }
    } catch {}
  }, [selectedSite?.id]);

  useEffect(() => {
    setCursor(null);
    fetchInsights();
    fetchRuns();
  }, [selectedSite?.id, filterCategory, filterStatus, lastAnalysisTs]);

  const handleAction = async (insightId, action) => {
    try {
      const res = await fetch(`/api/agent/insights/${insightId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error('Action failed');
      await fetchInsights();
    } catch (err) {
      console.error('[AgentPage] Action error:', err);
    }
  };

  const pluginConnected = selectedSite?.connectionStatus === 'CONNECTED';
  const [fixModalInsight, setFixModalInsight] = useState(null);
  const [fixModalItemIndices, setFixModalItemIndices] = useState(null);

  const openFixModal = useCallback((insight, itemIndices = null) => {
    setFixModalInsight(insight);
    setFixModalItemIndices(itemIndices);
  }, []);

  const handleRunAnalysis = () => runAnalysis(selectedSite?.id);

  const lastRun = runs[0];

  return (
    <>
      <PageHeader
        title={t.title || 'AI Agent'}
        subtitle={lastRun ? (t.lastRun || 'Last run: {time}').replace('{time}', `${getTimeAgo(lastRun.startedAt, t)} — ${lastRun.insightsCount} ${t.agent?.insightsCountLabel || 'insights'}`) : null}
      >
        <button
          className={styles.runButton}
          onClick={handleRunAnalysis}
          disabled={runningAnalysis || !selectedSite?.id}
        >
          {runningAnalysis ? (
            <><Loader2 size={16} className={styles.spinning} /> {t.running || 'Analyzing...'}</>
          ) : (
            <><Play size={16} /> {t.runAnalysis || 'Run Analysis'}</>
          )}
        </button>
      </PageHeader>

      {/* Stats */}
      <div className={styles.statsRow}>
        {loading ? (
          <>
            {[0, 1, 2].map(i => (
              <div key={i} className={`${styles.statCard} ${styles.statCardSkeleton}`}>
                <div className={styles.skeletonLine} style={{ width: '2rem', height: '1.5rem' }} />
                <div className={styles.skeletonLine} style={{ width: '5rem', height: '0.75rem' }} />
              </div>
            ))}
          </>
        ) : (
          <>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{totalCount}</div>
              <div className={styles.statLabel}>{t.totalInsights || 'Total Insights'}</div>
            </div>
            <div className={`${styles.statCard} ${pendingCount > 0 ? styles.statHighlight : ''}`}>
              <div className={styles.statValue}>{pendingCount}</div>
              <div className={styles.statLabel}>{t.pendingReview || 'Pending Review'}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{runs.length}</div>
              <div className={styles.statLabel}>{t.recentRuns || 'Recent Runs'}</div>
            </div>
          </>
        )}
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <Filter size={14} />
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className={styles.filterSelect}
          >
            <option value="">{t.agent?.filterAllCategories || 'All Categories'}</option>
            {CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{t.agent?.categories?.[cat] || cat}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className={styles.filterSelect}
          >
            <option value="">{t.agent?.filterAllStatuses || 'All Statuses'}</option>
            {STATUSES.map(s => (
              <option key={s} value={s}>{t.agent?.[s.toLowerCase()] || s}</option>
            ))}
          </select>
          <select
            value={filterFixStatus}
            onChange={e => setFilterFixStatus(e.target.value)}
            className={styles.filterSelect}
          >
            <option value="">{t.agent?.filterAllFix || 'All'}</option>
            <option value="unfixed">{t.agent?.filterUnfixed || 'Needs Attention'}</option>
            <option value="fixed">{t.agent?.filterFixed || 'Fixed'}</option>
          </select>
        </div>
        <button className={styles.refreshBtn} onClick={() => fetchInsights()} title="Refresh">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Insights List */}
      <div className={styles.insightsList}>
        {loading ? (
          <div className={styles.skeletonList}>
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className={styles.skeletonRow}>
                <div className={styles.skeletonIcon} />
                <div className={styles.skeletonContent}>
                  <div className={styles.skeletonLine} style={{ width: '60%', height: '0.875rem' }} />
                  <div className={styles.skeletonTags}>
                    <div className={styles.skeletonLine} style={{ width: '3rem', height: '0.7rem' }} />
                    <div className={styles.skeletonLine} style={{ width: '4rem', height: '0.7rem' }} />
                  </div>
                </div>
                <div className={styles.skeletonLine} style={{ width: '4rem', height: '0.75rem' }} />
              </div>
            ))}
          </div>
        ) : insights.length === 0 ? (
          <div className={styles.emptyState}>
            <Bot size={48} className={styles.emptyIcon} />
            <h3>{t.noInsightsFound || 'No Insights Found'}</h3>
            <p>{t.noInsights || 'The AI Agent will analyze your site data and provide suggestions.'}</p>
            <button className={styles.runButton} onClick={handleRunAnalysis} disabled={runningAnalysis}>
              <Play size={16} /> {t.runAnalysis || 'Run Analysis'}
            </button>
          </div>
        ) : (() => {
          const filtered = filterFixStatus
            ? insights.filter(i => filterFixStatus === 'fixed' ? isInsightFullyFixed(i) : !isInsightFullyFixed(i))
            : insights;
          return filtered.length === 0 ? (
            <div className={styles.emptyState}>
              <Bot size={48} className={styles.emptyIcon} />
              <p>{t.agent?.noMatchingInsights || 'No insights match the current filters.'}</p>
            </div>
          ) : (
          <>
            <InsightLegend translations={t} />
            {filtered.map(insight => (
              <InsightRow
                key={insight.id}
                insight={insight}
                translations={t}
                onAction={handleAction}
                onOpenFix={openFixModal}
                siteId={selectedSite?.id}
                pluginConnected={pluginConnected}
                onItemFixed={fetchInsights}
              />
            ))}
            {hasMore && (
              <button className={styles.loadMoreBtn} onClick={() => fetchInsights(true)}>
                {t.loadMore || 'Load More'}
              </button>
            )}
          </>
          );
        })()}
      </div>

      <FixPreviewModal
        open={!!fixModalInsight}
        onClose={() => { setFixModalInsight(null); setFixModalItemIndices(null); }}
        insight={fixModalInsight}
        translations={t}
        onApplied={fetchInsights}
        itemIndices={fixModalItemIndices}
      />
    </>
  );
}
