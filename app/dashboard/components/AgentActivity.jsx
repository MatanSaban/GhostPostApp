'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Bot, CheckCircle, XCircle, Clock, AlertTriangle, Lightbulb,
  TrendingUp, TrendingDown, Minus, Search, FileText, Users, Wrench, Loader2, Play,
  ChevronDown, ChevronUp, Eye, EyeOff, ExternalLink, Sparkles, Calendar, Plus, Check, Pencil,
} from 'lucide-react';
import { useSite } from '@/app/context/site-context';
import { useAgent } from '@/app/context/agent-context';
import { DashboardCard } from './DashboardCard';
import { ArrowIcon } from '@/app/components/ui/arrow-icon';
import FixPreviewModal from './FixPreviewModal';
import AiSuggestModal from './AiSuggestModal';
import EntitiesRequiredModal from './EntitiesRequiredModal/EntitiesRequiredModal';
import { formatPageUrl } from '@/lib/urlDisplay';
import {
  FIXABLE_INSIGHT_TYPES,
  CATEGORY_ICONS,
  PRIORITY_ORDER,
  isFixableInsight,
  getInsightType,
  getInsightSentiment,
  getInsightDirection,
  resolveChangePercent,
  translateReason,
  resolveTranslation,
  isInsightFullyFixed,
} from './insight/insight-utils';
import styles from './AgentActivity.module.css';

// Entity link cell component for showing edit links
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
    return (
      <Link href={`/dashboard/entities/${entity.entityTypeSlug}/${entity.entityId}`} className={styles.entityEditLink}>
        <Pencil size={12} /> {labels.edit || 'Edit'}
      </Link>
    );
  }
  return <span className={styles.entityNone}>-</span>;
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

function InsightDetails({ insight, translations, pluginConnected, onOpenFixSingle, trackedKeywords, addingKeyword, onAddKeyword, siteId }) {
  const d = insight.data;
  if (!d) return null;

  const labels = translations?.agent?.detailLabels || {};
  const t = translations?.agent || {};
  const entityLabel = labels.entity || 'Entity';
  const type = getInsightType(insight.titleKey);
  const canFix = pluginConnected && FIXABLE_INSIGHT_TYPES.has(type) && ['PENDING', 'APPROVED', 'FAILED', 'EXECUTED'].includes(insight.status);

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
              <tr key={i}><td>{p.title}</td><td>{p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : '-'}</td></tr>
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
          {uniquePages.slice(0, 5).map((p, i) => {
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
            <div key={i} className={styles.seoPageItem}>
              {detectedDate && (
                <span className={styles.seoPageDate}>
                  <Clock size={12} />
                  {new Date(detectedDate).toLocaleDateString()}
                </span>
              )}
              <span className={styles.seoPageTitle}>{displayTitle || <bdi dir="ltr">{formatPageUrl(p.url)}</bdi>}</span>
              {p.url && (
                <a href={p.url} target="_blank" rel="noopener noreferrer" className={styles.detailLink}>
                  <bdi dir="ltr">{formatPageUrl(p.url)}</bdi> <ExternalLink size={12} />
                </a>
              )}
            </div>
          );})}
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
            {d.pages.slice(0, 5).map((p, i) => {
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
                <td>{displayTitle || <bdi dir="ltr">{formatPageUrl(p.url)}</bdi>}</td>
                <td>{p.url && <a href={p.url} target="_blank" rel="noopener noreferrer" className={styles.detailLink}><bdi dir="ltr">{formatPageUrl(p.url)}</bdi> <ExternalLink size={12} /></a>}</td>
              </tr>
            );})}
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

  if (type === 'lowCtrQueries' && d.queries?.length > 0) {
    return (
      <div className={styles.detailSection}>
        <table className={styles.detailTable}>
          <thead><tr><th>{labels.query || 'Query'}</th><th>{labels.impressions || 'Impressions'}</th><th>CTR</th><th>{labels.position || 'Position'}</th></tr></thead>
          <tbody>
            {d.queries.slice(0, 5).map((q, i) => (
              <tr key={i}><td>{q.query}</td><td>{q.impressions?.toLocaleString()}</td><td>{q.ctr}%</td><td>{q.position ? Math.round(parseFloat(q.position)) : '-'}</td></tr>
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
          <thead><tr><th>{labels.page || 'Page'}</th><th>{labels.clicks || 'Clicks'}</th><th>{labels.change || 'Change'}</th><th></th></tr></thead>
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
                  <td>
                    <div className={styles.pageActions}>
                      {p.entityId && (
                        <Link
                          href={`/dashboard/entities/${typeof p.entityType === 'string' ? p.entityType : p.entityType?.slug}/${p.entityId}`}
                          className={styles.pageActionBtn}
                          title={t.editPage || 'Edit page'}
                        >
                          <Pencil size={14} />
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
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
              <tr key={i}><td>{c.domain?.startsWith('http') ? c.domain : `https://${c.domain}`}</td><td>{c.lastScannedAt ? new Date(c.lastScannedAt).toLocaleDateString() : '-'}</td></tr>
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
            <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem' }}>&quot;{c.query}&quot; - {c.pageCount} {labels.pageCount || 'pages competing'}</div>
            <table className={styles.detailTable}>
              <thead><tr><th>{labels.page || 'Page'}</th><th>{labels.position || 'Position'}</th><th>{labels.clicks || 'Clicks'}</th></tr></thead>
              <tbody>
                {c.pages.slice(0, 3).map((p, j) => (
                  <tr key={j}>
                    <td><bdi dir="ltr">{p.page ? formatPageUrl(p.page) : '-'}</bdi></td>
                    <td>{p.position ? Math.round(parseFloat(p.position)) : '-'}</td>
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

  // AI-verified cannibalization (proactive/semantic) with issues array
  if (type === 'cannibalization' && d.issues?.length > 0) {
    const actionLabels = {
      MERGE: labels.actionMerge || 'Merge pages',
      CANONICAL: labels.actionCanonical || 'Set canonical',
      '301_REDIRECT': labels.actionRedirect || '301 Redirect',
      DIFFERENTIATE: labels.actionDifferentiate || 'Differentiate content'
    };
    return (
      <div className={styles.detailSection}>
        {d.issues.slice(0, 3).map((issue, i) => (
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
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
            
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
        
        {d.count > d.issues.length && (
          <p className={styles.detailMore}>
            {(labels.andMore || 'and {count} more...').replace('{count}', d.count - d.issues.length)}
          </p>
        )}
      </div>
    );
  }

  if (type === 'newKeywordOpportunities' && d.queries?.length > 0) {
    return (
      <div className={styles.detailSection}>
        <table className={styles.detailTable}>
          <thead><tr><th>{labels.query || 'Query'}</th><th>{labels.clicks || 'Clicks'}</th><th>{labels.impressions || 'Impressions'}</th><th>{labels.position || 'Position'}</th></tr></thead>
          <tbody>
            {d.queries.slice(0, 5).map((q, i) => {
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
                      ) : (
                        <button
                          className={styles.kwAddBtn}
                          onClick={() => onAddKeyword?.(q.query)}
                          disabled={isAdding}
                          title={t.addToKeywords || 'Add to keywords'}
                        >
                          {isAdding ? <Loader2 size={11} className={styles.spinning} /> : <Plus size={11} />}
                          <span>{t.track || 'Track'}</span>
                        </button>
                      )}
                      <span className={styles.kwText}>{q.query}</span>
                    </span>
                  </td>
                  <td>{q.clicks?.toLocaleString()}</td>
                  <td>{q.impressions?.toLocaleString()}</td>
                  <td>{q.position ? Math.round(parseFloat(q.position)) : '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  if (type === 'lowCtrForPosition' && d.pages?.length > 0) {
    return (
      <div className={styles.detailSection}>
        <table className={styles.detailTable}>
          <thead><tr><th>{labels.page || 'Page'}</th><th>{labels.position || 'Position'}</th><th>{labels.actualCtr || 'Actual CTR'}</th><th>{labels.expectedCtr || 'Expected CTR'}</th><th>{labels.entity || 'Entity'}</th>{canFix && <th>{t.fixWithAi || 'Fix with AI'}</th>}</tr></thead>
          <tbody>
            {d.pages.slice(0, 5).map((p, i) => {
              const itemResults = insight.executionResult?.results || [];
              const itemFixed = itemResults.some(r => r.url === p.page && r.status === 'fixed');
              return (
                <tr key={i}>
                  <td><bdi dir="ltr">{p.page ? formatPageUrl(p.page) : '-'}</bdi></td>
                  <td>{p.position ? Math.round(parseFloat(p.position)) : '-'}</td>
                  <td className={styles.detailNegative}>{p.actualCtr}%</td>
                  <td>{p.expectedCtr}%</td>
                  <td><EntityLinkCell url={p.page} siteId={siteId} translations={translations} /></td>
                  {canFix && (
                    <td>
                      {itemFixed
                        ? <span className={styles.itemFixedBadge}><CheckCircle size={12} /> {t.fixItemApplied || 'Applied'}</span>
                        : <button className={styles.itemFixBtn} onClick={() => onOpenFixSingle?.(insight, [i])}>
                            <Sparkles size={12} /> {t.fixWithAiCost || 'Fix with AI (1 Credit)'}
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

  if (type === 'contentWithoutTraffic' && d.pages?.length > 0) {
    return (
      <div className={styles.detailSection}>
        <table className={styles.detailTable}>
          <thead>
            <tr>
              <th>{labels.page || 'Page'}</th>
              <th>{labels.url || 'URL'}</th>
              <th>{labels.publishedAt || 'Published'}</th>
              <th>{entityLabel}</th>
              <th>{labels.aiSuggestion || 'AI Suggestion'}</th>
            </tr>
          </thead>
          <tbody>
            {d.pages.map((p, i) => (
              <tr key={i}>
                <td className={styles.detailPageTitle}>{p.title}</td>
                <td>
                  {p.url && (
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className={styles.detailLink}>
                      <bdi dir="ltr">{formatPageUrl(p.url)}</bdi> <ExternalLink size={12} />
                    </a>
                  )}
                </td>
                <td>{p.publishedAt ? new Date(p.publishedAt).toLocaleDateString() : '-'}</td>
                <td><EntityLinkCell url={p.url} siteId={siteId} translations={translations} /></td>
                <td>
                  <AiSuggestButton page={p} siteId={siteId} translations={translations} />
                </td>
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
          <thead><tr><th>{labels.date || 'Date'}</th><th>{labels.visitors || 'Visitors'}</th><th>{labels.multiplier || '× Average'}</th><th>{labels.source || 'Likely Source'}</th></tr></thead>
          <tbody>
            {d.spikes.slice(0, 3).map((s, i) => (
              <tr key={i}>
                <td>{s.date ? `${s.date.slice(0,4)}-${s.date.slice(4,6)}-${s.date.slice(6,8)}` : '-'}</td>
                <td className={styles.detailPositive}>{s.visitors?.toLocaleString()}</td>
                <td>{s.multiplier}×</td>
                <td>{s.source ? `${s.source}${s.medium && s.medium !== '(not set)' ? ` / ${s.medium}` : ''}` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (type === 'impressionClickGap') {
    return (
      <div className={styles.detailSection}>
        <div className={styles.detailStats}>
          <div className={`${styles.detailStat} ${styles.detailStatPositive}`}>
            <span className={styles.detailStatLabel}>{labels.impressions || 'Impressions'}</span>
            <span className={styles.detailStatValue}><TrendingUp size={14} /> +{d.impressionsChange}%</span>
          </div>
          <div className={styles.detailStat}>
            <span className={styles.detailStatLabel}>{labels.clicks || 'Clicks'}</span>
            <span className={styles.detailStatValue}>{d.clicksChange > 0 ? `+${d.clicksChange}` : d.clicksChange}%</span>
          </div>
          <div className={styles.detailStat}>
            <span className={styles.detailStatLabel}>{labels.gapPercent || 'Gap'}</span>
            <span className={styles.detailStatValue}>{d.gapPercent}%</span>
          </div>
        </div>
      </div>
    );
  }

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
      </div>
    );
  }

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
          <thead><tr><th>{labels.page || 'Page'}</th><th>{labels.sharePercent || 'Share'}</th></tr></thead>
          <tbody>
            {d.topPages.slice(0, 3).map((p, i) => (
              <tr key={i}>
                <td><bdi dir="ltr">{p.page ? formatPageUrl(p.page) : '-'}</bdi></td>
                <td>{p.sharePercent}%</td>
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

function InsightItem({ insight, translations, onAction, onOpenFix, pluginConnected, trackedKeywords, addingKeyword, onAddKeyword, siteId }) {
  const [expanded, setExpanded] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const bodyRef = useRef(null);

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
        <div className={styles.insightBody} ref={bodyRef}>
          <p className={styles.insightDescription}>{description}</p>
          {insight.data?.periodStart && insight.data?.comparePeriodStart && (
            <p className={styles.insightPeriod}>
              <Calendar size={12} />
              <span>{new Date(insight.data.periodStart).toLocaleDateString()} – {new Date(insight.data.periodEnd).toLocaleDateString()}</span>
              <span className={styles.periodVs}>{translations?.agent?.vs || 'vs'}</span>
              <span>{new Date(insight.data.comparePeriodStart).toLocaleDateString()} – {new Date(insight.data.comparePeriodEnd).toLocaleDateString()}</span>
            </p>
          )}
          <InsightDetails
            insight={insight}
            translations={translations}
            pluginConnected={pluginConnected}
            onOpenFixSingle={(item, indices) => onOpenFix(item, indices)}
            trackedKeywords={trackedKeywords}
            addingKeyword={addingKeyword}
            onAddKeyword={onAddKeyword}
            siteId={siteId}
          />
          {showActions && (
            <div className={styles.insightActions}>
              {canFix && getInsightType(insight.titleKey) !== 'cannibalization' && (
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
              {/* TODO: Re-enable reject/dismiss when functionality is ready
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
              */}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AgentActivity({ translations, onInsightsLoaded }) {
  const { selectedSite } = useSite();
  const { runningAnalysis, lastAnalysisTs, runAnalysis, entitiesRequired, setEntitiesRequired } = useAgent();
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  
  // Keyword tracking state
  const [trackedKeywords, setTrackedKeywords] = useState(new Map());
  const [addingKeyword, setAddingKeyword] = useState(new Set());

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
        let key = item.titleKey + ':' + (item.data?.keyword || item.data?.query || '');
        // Per-cluster cannibalization: include sorted URLs so each pair is unique
        if (item.titleKey?.includes('cannibalization') && item.data?.issues?.[0]?.urls) {
          key += ':' + [...item.data.issues[0].urls].sort().join('|');
        }
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
      console.error('[AgentActivity] Error fetching tracked keywords:', err);
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
      console.error('[AgentActivity] Error adding keyword:', err);
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

      if (!res.ok) throw new Error('Action failed');

      // Refresh the list
      await fetchInsights();
    } catch (err) {
      console.error('[AgentActivity] Action error:', err);
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
                  onOpenFix={openFixModal}
                  pluginConnected={pluginConnected}
                  trackedKeywords={trackedKeywords}
                  addingKeyword={addingKeyword}
                  onAddKeyword={handleAddKeyword}
                  siteId={selectedSite?.id}
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
        onClose={() => {
          setFixModalInsight(null);
          setFixModalItemIndices(null);
        }}
        insight={fixModalInsight}
        translations={t}
        itemIndices={fixModalItemIndices}
        onApplied={fetchInsights}
      />
      <EntitiesRequiredModal open={entitiesRequired} onClose={() => setEntitiesRequired(false)} />
    </DashboardCard>
  );
}
