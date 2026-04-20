'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Bot, CheckCircle, XCircle, Clock, AlertTriangle, Lightbulb,
  TrendingUp, TrendingDown, Minus, Search, FileText, Users, Wrench, Loader2, Play,
  ChevronDown, ChevronUp, EyeOff, Filter, RefreshCw, ExternalLink, Sparkles, Calendar, ImageIcon,
  Plus, Check, Pencil, MapPin, Award, CircleCheck,
} from 'lucide-react';
import { useSite } from '@/app/context/site-context';
import { useAgent } from '@/app/context/agent-context';
import { useLocale } from '@/app/context/locale-context';
import { PageHeader } from '../components';
import { DashboardCard } from '../components/DashboardCard';
import { ArrowIcon } from '@/app/components/ui/arrow-icon';
import FixPreviewModal from '../components/FixPreviewModal';
import DifferentiationModal from '../components/DifferentiationModal';
import DifferentiationToast from '../components/DifferentiationToast';
import AiSuggestModal from '../components/AiSuggestModal';
import EntitiesRequiredModal from '../components/EntitiesRequiredModal/EntitiesRequiredModal';
import SitemapSubmissionModal from '../components/SitemapSubmissionModal';
import { useBackgroundJobPolling } from '@/app/hooks/useBackgroundJobPolling';
import { formatPageUrl } from '@/lib/urlDisplay';
import {
  FIXABLE_INSIGHT_TYPES,
  CATEGORY_ICONS,
  CATEGORIES,
  STATUSES,
  PRIORITY_ORDER,
  isFixableInsight,
  getInsightType,
  getInsightSentiment,
  getInsightDirection,
  resolveChangePercent,
  translateReason,
  resolveTranslation,
  isInsightFullyFixed,
  getTimeAgo,
} from '../components/insight/insight-utils';
import { useAiPricing } from '@/app/hooks/useAiPricing';
import styles from './agent.module.css';

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
  return <span className={styles.entityNone}>-</span>;
}

/**
 * Per-item fix button - generates AI SEO + applies for a single item.
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

function AiSuggestButton({ page, siteId, translations }) {
  const [open, setOpen] = useState(false);
  const t = translations?.agent?.suggestTraffic || {};
  return (
    <>
      <button className={styles.aiSuggestBtn} onClick={() => setOpen(true)}>
        <Sparkles size={12} /> {t.buttonLabel || 'AI Suggestion'}
      </button>
      <AiSuggestModal
        open={open}
        onClose={() => setOpen(false)}
        pageTitle={page.title}
        pageUrl={page.url}
        pageSlug={page.slug}
        siteId={siteId}
        translations={translations}
      />
    </>
  );
}

function InsightDetails({ insight, translations, siteId, pluginConnected, onItemFixed, onOpenFixSingle, onOpenSitemapSubmission, trackedKeywords, addingKeyword, onAddKeyword }) {
  const { locale } = useLocale();
  const d = insight.data;
  if (!d) return null;

  const labels = translations?.agent?.detailLabels || {};
  const t = translations?.agent || {};
  const entityLabel = labels.entity || 'Entity';
  const type = getInsightType(insight.titleKey);
  // Show per-item fix buttons for fixable types regardless of plugin connection.
  // The FixPreviewModal handles connection errors at action time.
  const canFix = FIXABLE_INSIGHT_TYPES.has(type) && ['PENDING', 'APPROVED', 'FAILED', 'EXECUTED', 'EXPIRED'].includes(insight.status);

  // Track which items have already been fixed from executionResult
  const fixedPostIds = new Set(
    (insight.executionResult?.results || []).filter(r => r.status === 'fixed').map(r => r.postId)
  );

  // Keyword Strike Zone - single keyword info
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
              <bdi dir="ltr">{formatPageUrl(d.url)}</bdi> <ExternalLink size={12} />
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

  // Unlinked Keywords - list of keywords with search volume
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

  // Stale Content - list of pages with last update date
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
                <td className={styles.detailPageTitle}>
                  {p.url ? (
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className={styles.detailLink}>
                      {p.title || p.slug} <ExternalLink size={12} />
                    </a>
                  ) : (p.title || p.slug)}
                </td>
                <td>{p.updatedAt ? new Date(p.updatedAt).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US') : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Missing SEO - list of pages
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
              // Get best display title - prefer actual title over slug/URL
              let displayTitle = p.title;
              if (!displayTitle || /^(https?:\/\/|\/)/i.test(displayTitle)) {
                displayTitle = p.h1 || null;
              }
              // Decode URL-encoded characters (Hebrew slugs etc.)
              if (displayTitle) {
                try { displayTitle = decodeURIComponent(displayTitle); } catch { /* keep original */ }
              }
              return (
                <tr key={i}>
                  <td className={styles.detailPageTitle}>
                    {p.url ? (
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className={styles.detailLink}>
                        {displayTitle || <bdi dir="ltr">{formatPageUrl(p.url)}</bdi>} <ExternalLink size={12} />
                      </a>
                    ) : (displayTitle || '-')}
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
      </div>
    );
  }

  // Noindex Detected - list of pages marked noindex
  if (type === 'noindexDetected' && d.pages?.length > 0) {
    return (
      <div className={styles.detailSection}>
        <table className={styles.detailTable}>
          <thead>
            <tr>
              <th>{labels.page || 'Page'}</th>
              <th>{entityLabel}</th>
            </tr>
          </thead>
          <tbody>
            {d.pages.map((p, i) => (
              <tr key={i}>
                <td className={styles.detailPageTitle}>
                  {p.url ? (
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className={styles.detailLink}>
                      {p.title || <bdi dir="ltr">{formatPageUrl(p.url)}</bdi>} <ExternalLink size={12} />
                    </a>
                  ) : (p.title || '-')}
                </td>
                <td><EntityLinkCell url={p.url} siteId={siteId} translations={translations} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Traffic Drop - stats overview
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
        {d.pages?.length > 0 && (
          <>
            <div className={styles.detailSubheading}>{labels.affectedPages || 'Affected Pages'}:</div>
            <table className={styles.detailTable}>
              <thead><tr><th>{labels.page || 'Page'}</th><th>{labels.clicks || 'Clicks'}</th><th>{labels.change || 'Change'}</th></tr></thead>
              <tbody>
                {d.pages.slice(0, 5).map((p, i) => {
                  // Get best display title
                  let displayTitle = p.title;
                  if (!displayTitle || /^(https?:\/\/|\/)/i.test(displayTitle)) {
                    displayTitle = null;
                  }
                  if (displayTitle) {
                    try { displayTitle = decodeURIComponent(displayTitle); } catch { /* keep original */ }
                  }
                  return (
                    <tr key={i}>
                      <td>
                        {displayTitle && <div className={styles.pageTitle}>{displayTitle}</div>}
                        <a href={p.page} target="_blank" rel="noopener noreferrer" className={styles.detailLink}>
                          <bdi dir="ltr">{formatPageUrl(p.page)}</bdi> <ExternalLink size={12} />
                        </a>
                      </td>
                      <td>{p.clicks?.toLocaleString()}</td>
                      <td className={styles.detailNegative}>{p.clicksChange}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </div>
    );
  }

  // Low CTR Queries - table of queries
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
                <td>{q.position ? Math.round(parseFloat(q.position)) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Declining Pages - table of pages with change
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
            {d.pages.map((p, i) => {
              // Get best display title
              let displayTitle = p.title;
              if (!displayTitle || /^(https?:\/\/|\/)/i.test(displayTitle)) {
                displayTitle = null;
              }
              if (displayTitle) {
                try { displayTitle = decodeURIComponent(displayTitle); } catch { /* keep original */ }
              }
              return (
                <tr key={i}>
                  <td>
                    {displayTitle && <div className={styles.pageTitle}>{displayTitle}</div>}
                    <a href={p.page} target="_blank" rel="noopener noreferrer" className={styles.detailLink}>
                      <bdi dir="ltr">{formatPageUrl(p.page)}</bdi> <ExternalLink size={12} />
                    </a>
                  </td>
                  <td>{p.clicks?.toLocaleString()}</td>
                  <td className={styles.detailNegative}>{p.clicksChange}%</td>
                  <td><EntityLinkCell url={p.page} siteId={siteId} translations={translations} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // Visitors Drop - stats overview
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

  // Traffic Growth - stats overview
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

  // Content Gaps - list of gaps
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

  // Stale Competitor Scans - list of competitors
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
                <td>{c.domain?.startsWith('http') ? c.domain : `https://${c.domain}`}</td>
                <td>{c.lastScannedAt ? new Date(c.lastScannedAt).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US') : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Proactive/Semantic Cannibalization - content-based issues with competing pages
  if (type === 'cannibalization' && d.issues?.length > 0) {
    const actionLabels = {
      MERGE: labels.actionMerge || 'Merge pages',
      CANONICAL: labels.actionCanonical || 'Set canonical',
      '301_REDIRECT': labels.actionRedirect || '301 Redirect',
      DIFFERENTIATE: labels.actionDifferentiate || 'Differentiate content'
    };
    const severityColors = {
      critical: '#ef4444',
      high: '#f97316', 
      medium: '#eab308',
      low: '#22c55e'
    };
    
    return (
      <div className={styles.detailSection}>
        {d.issues.map((issue, i) => (
          <div key={i} className={styles.cannibalizationIssue}>
            {/* Confidence badge */}
            <div className={styles.cannibalizationHeader}>
              <span className={styles.confidenceBadge} style={{ 
                backgroundColor: issue.confidence >= 80 ? '#fee2e2' : issue.confidence >= 60 ? '#fef3c7' : '#e0f2fe',
                color: issue.confidence >= 80 ? '#991b1b' : issue.confidence >= 60 ? '#92400e' : '#075985'
              }}>
                {issue.confidence}% {labels.confidence || 'confidence'}
              </span>
              <span className={styles.recommendedAction}>
                {labels.recommended || 'Recommended'}: <strong>{actionLabels[issue.action] || issue.action}</strong>
              </span>
            </div>
            
            {/* Reason/explanation */}
            <p className={styles.cannibalizationReason}>{translateReason(issue, labels)}</p>
            
            {/* Competing pages */}
            <div className={styles.competingPagesHeader}>
              <AlertTriangle size={14} />
              <span>{labels.competingPages || 'Competing Pages'} ({issue.urls?.length || 2}):</span>
            </div>
            <div className={styles.competingPages}>
              {/* Render all pages in the group */}
              {(issue.entities || [issue.entityA, issue.entityB].filter(Boolean)).map((entity, idx) => {
                const url = issue.urls?.[idx];
                const pageLabel = String.fromCharCode(65 + idx); // A, B, C, D...
                // Get best available title - prefer title over h1, but skip if it looks like a URL
                let displayTitle = entity?.title;
                // If title looks like a URL (starts with http, https, or /), try h1 instead
                if (!displayTitle || /^(https?:\/\/|\/)/i.test(displayTitle)) {
                  displayTitle = entity?.h1 || null;
                }
                // Decode title if it contains URL-encoded characters
                if (displayTitle) {
                  try { displayTitle = decodeURIComponent(displayTitle); } catch { /* keep original */ }
                }
                return (
                  <React.Fragment key={idx}>
                    {idx > 0 && <div className={styles.vsIndicator}>VS</div>}
                    <div className={styles.competingPage}>
                      <div className={styles.pageLabel}>{pageLabel}</div>
                      <div className={styles.pageDetails}>
                        <div className={styles.pageTitle}>{displayTitle || <bdi dir="ltr">{formatPageUrl(url)}</bdi>}</div>
                        <a href={url} target="_blank" rel="noopener noreferrer" className={styles.detailLink}>
                          <bdi dir="ltr">{formatPageUrl(url)}</bdi> <ExternalLink size={12} />
                        </a>
                        {entity?.focusKeyword && (
                          <div className={styles.pageMeta}>
                            <span className={styles.metaLabel}>{labels.focusKeyword || 'Focus'}:</span> {entity.focusKeyword}
                          </div>
                        )}
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
            
            {/* Detection signals */}
            {issue.verification?.checks?.length > 0 && (
              <div className={styles.detectionSignals}>
                <span className={styles.signalsLabel}>{labels.detectedSignals || 'Detected signals'}:</span>
                <div className={styles.signalTags}>
                  {issue.verification.checks.slice(0, 4).map((check, j) => (
                    <span key={j} className={styles.signalTag} style={{ borderColor: severityColors[check.severity] || '#94a3b8' }}>
                      {check.name.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            {/* AI Fix button */}
            {canFix && (
              <button 
                className={styles.cannibalizationFixBtn}
                onClick={() => onOpenFixSingle?.(insight, [i])}
              >
                <Sparkles size={14} />
                {t.fixCannibalization || 'Fix with AI'}
              </button>
            )}
          </div>
        ))}
        
      </div>
    );
  }

  // Keyword Cannibalization (GSC-based) - queries ranking with multiple pages
  if (type === 'cannibalization' && d.queries?.length > 0) {
    return (
      <div className={styles.detailSection}>
        {d.queries.map((c, i) => (
          <div key={i} className={styles.detailSubSection}>
            <div className={styles.detailSubTitle}>&quot;{c.query}&quot; - {c.pageCount} {labels.pageCount || 'pages competing'}</div>
            <table className={styles.detailTable}>
              <thead>
                <tr>
                  <th>{labels.page || 'Page'}</th>
                  <th>{labels.position || 'Position'}</th>
                  <th>{labels.clicks || 'Clicks'}</th>
                  <th>{labels.impressions || 'Impressions'}</th>
                </tr>
              </thead>
              <tbody>
                {c.pages.map((p, j) => (
                  <tr key={j}>
                    <td className={styles.detailPageTitle}>
                      <a href={p.page} target="_blank" rel="noopener noreferrer" className={styles.detailLink}>
                        <bdi dir="ltr">{formatPageUrl(p.page)}</bdi> <ExternalLink size={12} />
                      </a>
                    </td>
                    <td>{p.position ? Math.round(parseFloat(p.position)) : '-'}</td>
                    <td>{p.clicks?.toLocaleString()}</td>
                    <td>{p.impressions?.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    );
  }

  // New Keyword Opportunities - untracked queries from GSC
  if (type === 'newKeywordOpportunities' && d.queries?.length > 0) {
    return (
      <div className={styles.detailSection}>
        <table className={styles.detailTable}>
          <thead>
            <tr>
              <th>{labels.query || 'Query'}</th>
              <th>{labels.clicks || 'Clicks'}</th>
              <th>{labels.impressions || 'Impressions'}</th>
              <th>{labels.ctr || 'CTR'}</th>
              <th>{labels.position || 'Position'}</th>
            </tr>
          </thead>
          <tbody>
            {d.queries.map((q, i) => {
              const key = q.query?.toLowerCase().trim();
              const isTracked = trackedKeywords?.has(key);
              const isAdding = addingKeyword?.has(q.query);
              return (
                <tr key={i} className={styles.kwRow}>
                  <td>
                    <span className={styles.kwCell}>
                      {isTracked ? (
                        <span className={styles.kwTrackedIcon} title={t.alreadyTracked || 'Already tracked'}>
                          <Check size={12} />
                        </span>
                      ) : onAddKeyword ? (
                        <button
                          className={styles.kwAddBtn}
                          onClick={() => onAddKeyword(q.query)}
                          disabled={isAdding}
                          title={t.addToKeywords || 'Add to keywords'}
                        >
                          {isAdding ? <Loader2 size={11} className={styles.spinning} /> : <Plus size={11} />}
                          <span>{t.track || 'Track'}</span>
                        </button>
                      ) : null}
                      <span className={styles.kwText}>{q.query}</span>
                    </span>
                  </td>
                  <td>{q.clicks?.toLocaleString()}</td>
                  <td>{q.impressions?.toLocaleString()}</td>
                  <td>{q.ctr}%</td>
                  <td>{q.position ? Math.round(parseFloat(q.position)) : '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // Low CTR for Position - pages with CTR below expected for their ranking
  if (type === 'lowCtrForPosition' && d.pages?.length > 0) {
    return (
      <div className={styles.detailSection}>
        <table className={styles.detailTable}>
          <thead>
            <tr>
              <th>{labels.page || 'Page'}</th>
              <th>{labels.position || 'Position'}</th>
              <th>{labels.actualCtr || 'Actual CTR'}</th>
              <th>{labels.expectedCtr || 'Expected CTR'}</th>
              <th>{labels.impressions || 'Impressions'}</th>
              <th>{entityLabel}</th>
              {canFix && <th>{t.fixWithAi || 'Fix with AI'}</th>}
            </tr>
          </thead>
          <tbody>
            {d.pages.map((p, i) => {
              const itemResults = insight.executionResult?.results || [];
              const itemFixed = itemResults.some(r => r.url === p.page && r.status === 'fixed');
              return (
                <tr key={i}>
                  <td className={styles.detailPageTitle}>
                    <a href={p.page} target="_blank" rel="noopener noreferrer" className={styles.detailLink}>
                      <bdi dir="ltr">{formatPageUrl(p.page)}</bdi> <ExternalLink size={12} />
                    </a>
                  </td>
                  <td>{p.position ? Math.round(parseFloat(p.position)) : '-'}</td>
                  <td className={styles.detailNegative}>{p.actualCtr}%</td>
                  <td>{p.expectedCtr}%</td>
                  <td>{p.impressions?.toLocaleString()}</td>
                  <td><EntityLinkCell url={p.page} siteId={siteId} translations={translations} /></td>
                  {canFix && (
                    <td>
                      {itemFixed
                        ? <span className={styles.itemFixedBadge}><CheckCircle size={12} /> {t.fixItemApplied || 'Applied'}</span>
                        : <button className={styles.itemFixBtn} onClick={() => onOpenFixSingle?.(insight, [i])}>
                            <Sparkles size={12} /> {t.fixWithAiCost || `Fix with AI (${getCreditCost('AI_QUICK_FIX', 1)} Credit${getCreditCost('AI_QUICK_FIX', 1) !== 1 ? 's' : ''})`}
                          </button>
                      }
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // Content Without Organic Traffic - published pages with no GSC visibility
  if (type === 'contentWithoutTraffic' && d.pages?.length > 0) {
    return (
      <div className={styles.detailSection}>
        <table className={styles.detailTable}>
          <thead>
            <tr>
              <th>{labels.page || 'Page'}</th>
              <th>{labels.publishedAt || 'Published'}</th>
              <th>{entityLabel}</th>
              <th>{labels.aiSuggestion || 'AI Suggestion'}</th>
            </tr>
          </thead>
          <tbody>
            {d.pages.map((p, i) => (
              <tr key={i}>
                <td className={styles.detailPageTitle}>
                  {p.url ? (
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className={styles.detailLink}>
                      {p.title || <bdi dir="ltr">{formatPageUrl(p.url)}</bdi>} <ExternalLink size={12} />
                    </a>
                  ) : (p.title || '-')}
                </td>
                <td>{p.publishedAt ? new Date(p.publishedAt).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US') : '-'}</td>
                <td><EntityLinkCell url={p.url} siteId={siteId} translations={translations} /></td>
                <td>
                  <AiSuggestButton page={p} siteId={siteId} translations={translations} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Weekend vs Weekday Traffic Pattern
  if (type === 'weekendTrafficPattern') {
    return (
      <div className={styles.detailSection}>
        <div className={styles.detailStats}>
          <div className={styles.detailStat}>
            <span className={styles.detailStatLabel}>{labels.weekdayAvg || 'Weekday Avg'}</span>
            <span className={styles.detailStatValue}>{d.weekdayAvg?.toLocaleString()}</span>
          </div>
          <div className={styles.detailStat}>
            <span className={styles.detailStatLabel}>{labels.weekendAvg || 'Weekend Avg'}</span>
            <span className={styles.detailStatValue}>{d.weekendAvg?.toLocaleString()}</span>
          </div>
          <div className={styles.detailStat}>
            <span className={styles.detailStatLabel}>{labels.dominantPeriod || 'Peak Period'}</span>
            <span className={styles.detailStatValue}>{d.dominantPeriod === 'weekday' ? (translations?.agent?.weekday || 'Weekdays') : (translations?.agent?.weekend || 'Weekends')}</span>
          </div>
        </div>
      </div>
    );
  }

  // Traffic Spike Detection
  if (type === 'trafficSpike' && d.spikes?.length > 0) {
    return (
      <div className={styles.detailSection}>
        <div className={styles.detailStats}>
          <div className={styles.detailStat}>
            <span className={styles.detailStatLabel}>{labels.avgDaily || 'Daily Average'}</span>
            <span className={styles.detailStatValue}>{d.avgDaily?.toLocaleString()}</span>
          </div>
        </div>
        <table className={styles.detailTable}>
          <thead>
            <tr>
              <th>{labels.date || 'Date'}</th>
              <th>{labels.visitors || 'Visitors'}</th>
              <th>{labels.multiplier || '× Average'}</th>
              <th>{labels.source || 'Likely Source'}</th>
              <th>{labels.topPage || 'Top Landing Page'}</th>
            </tr>
          </thead>
          <tbody>
            {d.spikes.map((s, i) => (
              <tr key={i}>
                <td>{s.date ? `${s.date.slice(0,4)}-${s.date.slice(4,6)}-${s.date.slice(6,8)}` : '-'}</td>
                <td className={styles.detailPositive}>{s.visitors?.toLocaleString()}</td>
                <td>{s.multiplier}×</td>
                <td>
                  {s.source
                    ? `${s.source}${s.medium && s.medium !== '(not set)' ? ` / ${s.medium}` : ''}`
                    : '-'}
                </td>
                <td>{s.topLandingPage || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Impression-Click Gap
  if (type === 'impressionClickGap') {
    return (
      <div className={styles.detailSection}>
        <div className={styles.detailStats}>
          <div className={styles.detailStat}>
            <span className={styles.detailStatLabel}>{labels.impressions || 'Impressions'}</span>
            <span className={styles.detailStatValue}>{d.impressions?.toLocaleString()}</span>
          </div>
          <div className={`${styles.detailStat} ${styles.detailStatPositive}`}>
            <span className={styles.detailStatLabel}>{labels.impressions || 'Impressions'} {labels.change || 'Change'}</span>
            <span className={styles.detailStatValue}><TrendingUp size={14} /> +{d.impressionsChange}%</span>
          </div>
          <div className={styles.detailStat}>
            <span className={styles.detailStatLabel}>{labels.clicks || 'Clicks'}</span>
            <span className={styles.detailStatValue}>{d.clicks?.toLocaleString()}</span>
          </div>
          <div className={`${styles.detailStat} ${d.clicksChange > 0 ? styles.detailStatPositive : d.clicksChange < 0 ? styles.detailStatNegative : ''}`}>
            <span className={styles.detailStatLabel}>{labels.clicks || 'Clicks'} {labels.change || 'Change'}</span>
            <span className={styles.detailStatValue}>
              {d.clicksChange > 0 ? <><TrendingUp size={14} /> +{d.clicksChange}%</> : d.clicksChange < 0 ? <><TrendingDown size={14} /> {d.clicksChange}%</> : <>0%</>}
            </span>
          </div>
          <div className={styles.detailStat}>
            <span className={styles.detailStatLabel}>{labels.gapPercent || 'Gap'}</span>
            <span className={styles.detailStatValue}>{d.gapPercent}%</span>
          </div>
        </div>
      </div>
    );
  }

  // AI Traffic Growth / Drop
  if ((type === 'aiTrafficGrowth' || type === 'aiTrafficDrop') && d.sessions != null) {
    const isGrowth = type === 'aiTrafficGrowth';
    return (
      <div className={styles.detailSection}>
        <div className={styles.detailStats}>
          <div className={styles.detailStat}>
            <span className={styles.detailStatLabel}>{labels.sessions || 'Sessions'}</span>
            <span className={styles.detailStatValue}>{d.sessions?.toLocaleString()}</span>
          </div>
          <div className={`${styles.detailStat} ${isGrowth ? styles.detailStatPositive : styles.detailStatNegative}`}>
            <span className={styles.detailStatLabel}>{labels.change || 'Change'}</span>
            <span className={styles.detailStatValue}>
              {isGrowth ? <><TrendingUp size={14} /> +{d.change}%</> : <><TrendingDown size={14} /> {d.change}%</>}
            </span>
          </div>
          <div className={styles.detailStat}>
            <span className={styles.detailStatLabel}>{labels.sharePercent || 'Traffic Share'}</span>
            <span className={styles.detailStatValue}>{d.sharePercent}%</span>
          </div>
        </div>
        {d.topEngines?.length > 0 && (
          <table className={styles.detailTable}>
            <thead>
              <tr>
                <th>{labels.engine || 'AI Engine'}</th>
                <th>{labels.sessions || 'Sessions'}</th>
              </tr>
            </thead>
            <tbody>
              {d.topEngines.map((e, i) => (
                <tr key={i}>
                  <td>{e.name}</td>
                  <td>{e.sessions?.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  // Traffic Concentration
  if (type === 'trafficConcentration' && d.topPages?.length > 0) {
    return (
      <div className={styles.detailSection}>
        <div className={styles.detailStats}>
          <div className={styles.detailStat}>
            <span className={styles.detailStatLabel}>{labels.concentrationPercent || 'Concentration'}</span>
            <span className={styles.detailStatValue}>{d.concentrationPercent}%</span>
          </div>
        </div>
        <table className={styles.detailTable}>
          <thead>
            <tr>
              <th>{labels.page || 'Page'}</th>
              <th>{labels.clicks || 'Clicks'}</th>
              <th>{labels.sharePercent || 'Traffic Share'}</th>
            </tr>
          </thead>
          <tbody>
            {d.topPages.map((p, i) => (
              <tr key={i}>
                <td className={styles.detailPageTitle}>
                  <a href={p.page} target="_blank" rel="noopener noreferrer" className={styles.detailLink}>
                    <bdi dir="ltr">{formatPageUrl(p.page)}</bdi> <ExternalLink size={12} />
                  </a>
                </td>
                <td>{p.clicks?.toLocaleString()}</td>
                <td>{p.sharePercent}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Missing Featured Image - list of posts without featured image
  if (type === 'missingFeaturedImage' && d.pages?.length > 0) {
    return (
      <div className={styles.detailSection}>
        <table className={styles.detailTable}>
          <thead>
            <tr>
              <th></th>
              <th>{labels.page || 'Page'}</th>
              <th>{entityLabel}</th>
              {canFix && <th>{t.fixWithAi || 'Fix with AI'}</th>}
            </tr>
          </thead>
          <tbody>
            {d.pages.map((p, i) => {
              const itemFixed = (insight.executionResult?.results || []).some(r => r.pageId === p.id && r.status === 'fixed');
              let displayTitle = p.title;
              if (displayTitle) { try { displayTitle = decodeURIComponent(displayTitle); } catch { /* keep */ } }
              return (
                <tr key={i}>
                  <td><ImageIcon size={14} className={styles.missingImageIcon} /></td>
                  <td className={styles.detailPageTitle}>
                    {p.url ? (
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className={styles.detailLink}>
                        {displayTitle || p.slug} <ExternalLink size={12} />
                      </a>
                    ) : (displayTitle || p.slug)}
                  </td>
                  <td><EntityLinkCell url={p.url} siteId={siteId} translations={translations} /></td>
                  {canFix && (
                    <td>
                      {itemFixed
                        ? <span className={styles.itemFixedBadge}><CheckCircle size={12} /> {t.fixItemApplied || 'Applied'}</span>
                        : <button className={styles.itemFixBtn} onClick={() => onOpenFixSingle?.(insight, [i])}>
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
      </div>
    );
  }

  // Insufficient Content Images - posts needing more images
  if (type === 'insufficientContentImages' && d.pages?.length > 0) {
    return (
      <div className={styles.detailSection}>
        <table className={styles.detailTable}>
          <thead>
            <tr>
              <th>{labels.page || 'Page'}</th>
              <th>{t.wordCount || 'Words'}</th>
              <th>{t.currentImages || 'Images'}</th>
              <th>{t.recommendedImages || 'Recommended'}</th>
              {canFix && <th>{t.fixWithAi || 'Fix with AI'}</th>}
            </tr>
          </thead>
          <tbody>
            {d.pages.map((p, i) => {
              const itemFixed = (insight.executionResult?.results || []).some(r => r.pageId === p.id && r.status === 'fixed');
              let displayTitle = p.title;
              if (displayTitle) { try { displayTitle = decodeURIComponent(displayTitle); } catch { /* keep */ } }
              return (
                <tr key={i}>
                  <td className={styles.detailPageTitle}>
                    {p.url ? (
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className={styles.detailLink}>
                        {displayTitle || p.slug} <ExternalLink size={12} />
                      </a>
                    ) : (displayTitle || p.slug)}
                  </td>
                  <td>{p.wordCount?.toLocaleString()}</td>
                  <td>{p.imageCount}</td>
                  <td>{p.recommendedImages}</td>
                  {canFix && (
                    <td>
                      {itemFixed
                        ? <span className={styles.itemFixedBadge}><CheckCircle size={12} /> {t.fixItemApplied || 'Applied'}</span>
                        : <button className={styles.itemFixBtn} onClick={() => onOpenFixSingle?.(insight, [i])}>
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
      </div>
    );
  }

  // Sitemaps Not Submitted to GSC
  if (type === 'sitemapsNotSubmitted') {
    const isExecuted = insight.status === 'EXECUTED';
    const sitemapT = t.sitemapSubmission || {};
    return (
      <div className={styles.detailSection}>
        <div className={styles.detailStats}>
          <div className={styles.detailStat}>
            <span className={styles.detailStatLabel}>{labels.gscSiteUrl || 'GSC Property'}</span>
            <span className={styles.detailStatValue}><bdi dir="ltr">{d.gscSiteUrl}</bdi></span>
          </div>
          {d.isWordPress && (
            <div className={styles.detailStat}>
              <span className={styles.detailStatLabel}>{labels.platform || 'Platform'}</span>
              <span className={styles.detailStatValue}>WordPress</span>
            </div>
          )}
        </div>
        {isExecuted ? (
          <span className={styles.itemFixedBadge}>
            <CheckCircle size={12} /> {sitemapT.alreadySubmitted || 'Sitemaps submitted'}
          </span>
        ) : (
          <button className={styles.itemFixBtn} onClick={() => onOpenSitemapSubmission?.(insight)}>
            <MapPin size={12} /> {sitemapT.quickFix || 'Submit Sitemaps to GSC'}
          </button>
        )}
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

function InsightRow({ insight, translations, onAction, onOpenFix, onOpenSitemapSubmission, siteId, pluginConnected, onItemFixed, trackedKeywords, addingKeyword, onAddKeyword }) {
  const { locale } = useLocale();
  const [expanded, setExpanded] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const bodyRef = useRef(null);

  const CategoryIcon = CATEGORY_ICONS[insight.category] || FileText;
  const sentiment = getInsightSentiment(insight);
  const direction = getInsightDirection(insight);
  const title = resolveTranslation(translations, insight.titleKey, insight.data, locale);
  const description = resolveTranslation(translations, insight.descriptionKey, insight.data, locale);

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
  const isFixable = isFixableInsight(insight.titleKey);
  const canFix = pluginConnected && isFixable && ['PENDING', 'APPROVED', 'FAILED', 'EXECUTED', 'EXPIRED'].includes(insight.status);
  const showActions = isPending || canFix;

  const timeAgo = getTimeAgo(insight.createdAt, translations);
  const DirectionIcon = direction === 'up' ? TrendingUp : direction === 'down' ? TrendingDown : direction === 'equal' ? Minus : null;
  const DisplayIcon = DirectionIcon || CategoryIcon;

  useEffect(() => {
    if (!expanded || !bodyRef.current) return;

    const headers = bodyRef.current.querySelectorAll('th');
    headers.forEach((th) => {
      const text = (th.textContent || '').trim();
      if (!text) return;
      th.classList.add(styles.hasTooltip);
      th.setAttribute('data-tooltip', text);
    });
  }, [expanded, insight.id]);

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
        <div className={styles.insightRowBody} ref={bodyRef}>
          <p className={styles.insightDescription}>{description}</p>

          {insight.data?.periodStart && insight.data?.comparePeriodStart && (
            <p className={styles.insightPeriod}>
              <Calendar size={12} />
              <span>{new Date(insight.data.periodStart).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US')} – {new Date(insight.data.periodEnd).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US')}</span>
              <span className={styles.periodVs}>{translations?.agent?.vs || 'vs'}</span>
              <span>{new Date(insight.data.comparePeriodStart).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US')} – {new Date(insight.data.comparePeriodEnd).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US')}</span>
            </p>
          )}

          {canFix && !['cannibalization'].includes(getInsightType(insight.titleKey)) && (
            <div className={styles.insightActions}>
              <button className={`${styles.actionBtn} ${styles.fixBtn}`} onClick={() => onOpenFix(insight, null)} disabled={actionLoading}>
                <Sparkles size={14} />
                {translations?.agent?.fixWithAi || 'Fix with AI'}
              </button>
            </div>
          )}

          <InsightDetails insight={insight} translations={translations} siteId={siteId} pluginConnected={pluginConnected} onItemFixed={onItemFixed} onOpenFixSingle={(i, indices) => onOpenFix(i, indices)} onOpenSitemapSubmission={onOpenSitemapSubmission} trackedKeywords={trackedKeywords} addingKeyword={addingKeyword} onAddKeyword={onAddKeyword} />

          {(insight.status === 'EXECUTED' || isInsightFullyFixed(insight)) && (
            <div className={styles.insightActions}>
              <button
                className={`${styles.actionBtn} ${styles.resolveBtn}`}
                onClick={() => handleAction('resolve')}
                disabled={actionLoading}
              >
                <CircleCheck size={14} />
                {actionLoading ? (translations?.agent?.clearing || 'Clearing...') : (translations?.agent?.clearIssue || 'Clear Issue')}
              </button>
            </div>
          )}

          {/* TODO: Re-enable reject/dismiss when functionality is ready
          {showActions && (
            <div className={styles.insightActions}>
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
          */}
        </div>
      )}
    </div>
  );
}

export default function AgentPageContent({ translations, mode = 'full', onInsightsLoaded }) {
  const isCompact = mode === 'compact';
  const t = translations;
  const { locale } = useLocale();
  const { selectedSite } = useSite();
  const { getCreditCost } = useAiPricing();
  const { runningAnalysis, lastAnalysisTs, runAnalysis, entitiesRequired, setEntitiesRequired } = useAgent();

  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [resolvedCount, setResolvedCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState(null);

  // Filters (full mode only)
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterFixStatus, setFilterFixStatus] = useState('unfixed'); // '' | 'unfixed' | 'fixed'

  const [runs, setRuns] = useState([]);

  // Keyword tracking state
  const [trackedKeywords, setTrackedKeywords] = useState(new Map());
  const [addingKeyword, setAddingKeyword] = useState(new Set());

  const dedup = (items) => {
    const seen = new Set();
    return items.filter(item => {
      let key = item.titleKey + ':' + (item.data?.keyword || item.data?.query || '');
      // Per-cluster cannibalization: include sorted URLs so each pair is unique
      if (item.titleKey?.includes('cannibalization') && item.data?.issues?.[0]?.urls) {
        key += ':' + [...item.data.issues[0].urls].sort().join('|');
      }
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const fetchInsights = useCallback(async (append = false) => {
    if (!selectedSite?.id) return;

    try {
      if (!append) setLoading(true);
      const limit = isCompact ? '10' : '30';
      const params = new URLSearchParams({ siteId: selectedSite.id, limit });
      if (!isCompact) {
        if (filterCategory) params.set('category', filterCategory);
        if (filterStatus) params.set('status', filterStatus);
        if (filterFixStatus === 'fixed' && !filterStatus) params.set('includeResolved', 'true');
        if (append && cursor) params.set('cursor', cursor);
      }

      const res = await fetch(`/api/agent/insights?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();

      let items = dedup(data.items || []);
      if (isCompact) {
        // Dashboard compact mode: only show items that still need attention
        items = items.filter(i => !isInsightFullyFixed(i));
        setInsights(items);
        onInsightsLoaded?.(items.length > 0);
      } else if (append) {
        setInsights(prev => dedup([...prev, ...(data.items || [])]));
      } else {
        setInsights(items);
      }
      setTotalCount(data.totalCount || 0);
      setPendingCount(data.pendingCount || 0);
      setResolvedCount(data.resolvedCount || 0);
      setHasMore(data.hasMore || false);
      setCursor(data.nextCursor || null);
    } catch (err) {
      console.error('[AgentPage] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedSite?.id, filterCategory, filterStatus, filterFixStatus, cursor, isCompact, onInsightsLoaded]);

  // Fetch runs (full mode only)
  const fetchRuns = useCallback(async () => {
    if (!selectedSite?.id || isCompact) return;
    try {
      const res = await fetch(`/api/agent/runs?siteId=${selectedSite.id}&limit=5`);
      if (res.ok) {
        const data = await res.json();
        setRuns(data.runs || []);
      }
    } catch {}
  }, [selectedSite?.id, isCompact]);

  useEffect(() => {
    setCursor(null);
    fetchInsights();
    fetchRuns();
  }, [selectedSite?.id, filterCategory, filterStatus, filterFixStatus, lastAnalysisTs]);

  // Fetch tracked keywords for the current site
  const fetchTrackedKeywords = useCallback(async () => {
    if (!selectedSite?.id) return;
    try {
      const res = await fetch(`/api/keywords?siteId=${selectedSite.id}`);
      if (res.ok) {
        const data = await res.json();
        const kwMap = new Map();
        (data.keywords || []).forEach(kw => {
          kwMap.set(kw.keyword?.toLowerCase().trim(), kw);
        });
        setTrackedKeywords(kwMap);
      }
    } catch (err) {
      console.error('[AgentPage] Error fetching tracked keywords:', err);
    }
  }, [selectedSite?.id]);

  useEffect(() => {
    fetchTrackedKeywords();
  }, [fetchTrackedKeywords]);

  // Handler for adding keyword to tracking
  const handleAddKeyword = async (query) => {
    if (!selectedSite?.id || addingKeyword.has(query)) return;
    setAddingKeyword(prev => new Set([...prev, query]));
    try {
      const res = await fetch('/api/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: selectedSite.id, keywords: query }),
      });
      if (res.ok) {
        const data = await res.json();
        const kw = data.keywords?.[0];
        if (kw) {
          setTrackedKeywords(prev => new Map([...prev, [query.toLowerCase().trim(), kw]]));
        }
      }
    } catch (err) {
      console.error('[AgentPage] Error adding keyword:', err);
    } finally {
      setAddingKeyword(prev => { const next = new Set(prev); next.delete(query); return next; });
    }
  };

  const handleAction = async (insightId, action) => {
    try {
      const res = await fetch(`/api/agent/insights/${insightId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error('[AgentPage] Action failed:', res.status, data);
        throw new Error(data.error || `Action failed (${res.status})`);
      }
      await fetchInsights();
    } catch (err) {
      console.error('[AgentPage] Action error:', err);
    }
  };

  const pluginConnected = selectedSite?.connectionStatus === 'CONNECTED';
  const [fixModalInsight, setFixModalInsight] = useState(null);
  const [fixModalItemIndices, setFixModalItemIndices] = useState(null);

  // Sitemap Submission modal state
  const [sitemapModalInsight, setSitemapModalInsight] = useState(null);

  // Content Differentiation state
  const [diffJobId, setDiffJobId] = useState(null);
  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [diffExecuting, setDiffExecuting] = useState(false);
  const { job: diffJob } = useBackgroundJobPolling(diffJobId);

  // Auto-open modal when differentiation job completes
  useEffect(() => {
    if (diffJob?.status === 'COMPLETED' && !diffModalOpen) {
      setDiffModalOpen(true);
    }
  }, [diffJob?.status]);

  const startDifferentiationJob = useCallback(async (insight, itemIndices) => {
    const issueIndex = itemIndices?.[0] ?? 0;
    const issue = insight?.data?.issues?.[issueIndex];
    if (!issue) return;

    // Collect page URLs from the issue (entities may not have IDs)
    const pageUrls = issue.urls?.filter(Boolean);
    if (!pageUrls || pageUrls.length < 2) {
      console.error('[Agent] Cannot start differentiation: need at least 2 URLs');
      return;
    }

    try {
      const res = await fetch('/api/content-differentiation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageUrls,
          siteId: selectedSite?.id,
          siteLanguage: selectedSite?.language || selectedSite?.locale,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to start differentiation job');
      }
      const { jobId } = await res.json();
      setDiffJobId(jobId);
      setDiffModalOpen(true);
    } catch (err) {
      console.error('[Agent] Differentiation start error:', err);
    }
  }, [selectedSite?.id, selectedSite?.language, selectedSite?.locale]);

  const handleDiffExecute = useCallback(async () => {
    if (!diffJobId || !selectedSite?.id) return;
    setDiffExecuting(true);
    try {
      const res = await fetch('/api/content-differentiation/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: diffJobId, siteId: selectedSite.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Execution failed');
      }
      await fetchInsights();
    } catch (err) {
      console.error('[Agent] Differentiation execute error:', err);
    } finally {
      setDiffExecuting(false);
    }
  }, [diffJobId, selectedSite?.id, fetchInsights]);

  // Pre-confirmation state for differentiation
  const [confirmDiffData, setConfirmDiffData] = useState(null);

  const openFixModal = useCallback((insight, itemIndices = null) => {
    // Check if this is a DIFFERENTIATE cannibalization action
    const issueIndex = itemIndices?.[0] ?? 0;
    const issue = insight?.data?.issues?.[issueIndex];
    if (issue?.action === 'DIFFERENTIATE') {
      // Show pre-confirmation step instead of starting immediately
      setConfirmDiffData({ insight, itemIndices });
      setDiffModalOpen(true);
      return;
    }
    setFixModalInsight(insight);
    setFixModalItemIndices(itemIndices);
  }, []);

  const handleConfirmDifferentiation = useCallback(() => {
    if (!confirmDiffData) return;
    startDifferentiationJob(confirmDiffData.insight, confirmDiffData.itemIndices);
    setConfirmDiffData(null);
  }, [confirmDiffData, startDifferentiationJob]);

  const handleRunAnalysis = () => runAnalysis(selectedSite?.id);

  const insightRowProps = {
    translations: t,
    onAction: handleAction,
    onOpenFix: openFixModal,
    onOpenSitemapSubmission: (insight) => setSitemapModalInsight(insight),
    siteId: selectedSite?.id,
    pluginConnected,
    onItemFixed: fetchInsights,
    trackedKeywords,
    addingKeyword,
    onAddKeyword: handleAddKeyword,
  };

  const modals = (
    <>
      <FixPreviewModal
        open={!!fixModalInsight}
        onClose={() => { setFixModalInsight(null); setFixModalItemIndices(null); }}
        insight={fixModalInsight}
        translations={t}
        onApplied={fetchInsights}
        itemIndices={fixModalItemIndices}
      />
      <DifferentiationModal
        open={diffModalOpen}
        onClose={() => { setDiffModalOpen(false); setDiffJobId(null); setConfirmDiffData(null); }}
        job={diffJob}
        onExecute={handleDiffExecute}
        isExecuting={diffExecuting}
        translations={t}
        confirmData={confirmDiffData}
        onConfirmStart={handleConfirmDifferentiation}
      />
      {diffJob?.status === 'COMPLETED' && !diffModalOpen && (
        <DifferentiationToast
          show
          message={diffJob?.resultData?.supportingPages?.length
            ? (t?.agent?.differentiation?.toast?.pagesDifferentiated || '{count} pages differentiated').replace('{count}', diffJob.resultData.supportingPages.length)
            : (t?.agent?.differentiation?.toast?.completed || 'Content differentiation completed')}
          onClick={() => setDiffModalOpen(true)}
          onDismiss={() => setDiffJobId(null)}
        />
      )}
      <EntitiesRequiredModal open={entitiesRequired} onClose={() => setEntitiesRequired(false)} />
      <SitemapSubmissionModal
        open={!!sitemapModalInsight}
        onClose={() => { setSitemapModalInsight(null); fetchInsights(); }}
        siteId={selectedSite?.id}
        insight={sitemapModalInsight}
        translations={t}
      />
    </>
  );

  // ── Compact mode (Dashboard Card) ──
  if (isCompact) {
    const headerRight = (
      <button
        className={styles.runButton}
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
        <div className={styles.compactContainer}>
          {loading ? (
            <div className={styles.compactLoading}>
              <Loader2 size={24} className={styles.spinning} />
            </div>
          ) : insights.length === 0 ? (
            <div className={styles.compactEmpty}>
              <Bot size={32} className={styles.compactEmptyIcon} />
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
                  <InsightRow key={insight.id} insight={insight} {...insightRowProps} />
                ))}
              </div>
            </>
          )}
        </div>

        <Link href="/dashboard/agent" className={styles.viewAllLink}>
          {t?.agent?.viewAll || t?.viewAllActivity || 'View All Activity'}
          <ArrowIcon size={16} />
        </Link>

        {modals}
      </DashboardCard>
    );
  }

  // ── Full mode (Agent Page) ──
  const lastRun = runs[0];

  return (
    <>
      <PageHeader
        title={t.title || 'AI Agent'}
        subtitle={lastRun ? (t.lastRun || 'Last run: {time}').replace('{time}', `${getTimeAgo(lastRun.startedAt, t)} - ${lastRun.insightsCount} ${t.agent?.insightsCountLabel || 'insights'}`) : null}
        dataOnboarding="page-agent"
      >
        <button
          type="button"
          className={styles.runButton}
          onClick={handleRunAnalysis}
          disabled={runningAnalysis || !selectedSite?.id}
          data-onboarding="agent-run-cta"
        >
          {runningAnalysis ? (
            <><Loader2 size={16} className={styles.spinning} /> {t.running || 'Analyzing...'}</>
          ) : (
            <><Play size={16} /> {t.runAnalysis || 'Run Analysis'}</>
          )}
        </button>
      </PageHeader>

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
            <div className={`${styles.statCard} ${resolvedCount > 0 ? styles.statSuccess : ''}`}>
              <div className={styles.statValue}>
                {resolvedCount > 0 && <Award size={16} className={styles.statIcon} />}
                {resolvedCount}
              </div>
              <div className={styles.statLabel}>{t.agent?.resolvedIssuesLabel || 'Issues Resolved'}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{runs.length}</div>
              <div className={styles.statLabel}>{t.recentRuns || 'Recent Runs'}</div>
            </div>
          </>
        )}
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
            <button type="button" className={styles.runButton} onClick={handleRunAnalysis} disabled={runningAnalysis}>
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
              <InsightRow key={insight.id} insight={insight} {...insightRowProps} />
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

      {modals}
    </>
  );
}
