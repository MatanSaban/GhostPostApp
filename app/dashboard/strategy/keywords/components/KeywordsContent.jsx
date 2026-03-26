'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { TrendingUp, TrendingDown, Minus, Search, Loader2, Tag, Trash2, Plus, X, Sparkles, BarChart3, Crosshair, Trophy, ChevronDown, Info, Navigation, ShoppingCart, DollarSign, ExternalLink, FileText, Wand2, Calendar } from 'lucide-react';
import { useSite } from '@/app/context/site-context';
import { useTranslation } from '@/app/context/locale-context';
import { emitCreditsUpdated } from '@/app/context/user-context';
import { usePermissions } from '@/app/hooks/usePermissions';
import { Skeleton } from '@/app/dashboard/components/Skeleton';
import GeneratePostModal from './GeneratePostModal';
import styles from '../page.module.css';

const getPositionClass = (position) => {
  if (!position) return 'below20';
  if (position <= 3) return 'top3';
  if (position <= 10) return 'top10';
  if (position <= 20) return 'top20';
  return 'below20';
};

const getDifficultyLevel = (difficulty) => {
  if (!difficulty) return null;
  if (difficulty <= 30) return 'easy';
  if (difficulty <= 60) return 'medium';
  return 'hard';
};

const fmtDate = (d) => d.toISOString().split('T')[0];

const getDateRange = (preset) => {
  const end = new Date();
  end.setDate(end.getDate() - 3); // GSC has 2-3 day delay
  const start = new Date(end);
  switch (preset) {
    case '7d':
      start.setDate(start.getDate() - 7);
      return { start: fmtDate(start), end: fmtDate(end) };
    case '30d':
      start.setDate(start.getDate() - 30);
      return { start: fmtDate(start), end: fmtDate(end) };
    case '90d':
      start.setDate(start.getDate() - 90);
      return { start: fmtDate(start), end: fmtDate(end) };
    case '180d':
      start.setDate(start.getDate() - 180);
      return { start: fmtDate(start), end: fmtDate(end) };
    case '365d':
      start.setDate(start.getDate() - 365);
      return { start: fmtDate(start), end: fmtDate(end) };
    default:
      return null;
  }
};

const getPreviousPeriod = (startStr, endStr, preset) => {
  const s = new Date(startStr + 'T00:00:00');
  const e = new Date(endStr + 'T00:00:00');
  if (preset === 'custom') {
    const ps = new Date(s);
    ps.setFullYear(ps.getFullYear() - 1);
    const pe = new Date(e);
    pe.setFullYear(pe.getFullYear() - 1);
    return { start: fmtDate(ps), end: fmtDate(pe) };
  }
  const diffMs = e.getTime() - s.getTime();
  const pe = new Date(s);
  pe.setDate(pe.getDate() - 1);
  const ps = new Date(pe.getTime() - diffMs);
  return { start: fmtDate(ps), end: fmtDate(pe) };
};

function KeywordsPageSkeleton() {
  return (
    <>
      {/* Filter Tabs Skeleton */}
      <div className={styles.filterTabs}>
        <div className={styles.filterButtons}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} width={`${60 + i * 8}px`} height="2rem" borderRadius="full" />
          ))}
        </div>
        <Skeleton width="7rem" height="1.75rem" borderRadius="md" />
      </div>

      {/* Stat Cards Skeleton */}
      <div className={styles.statsRow}>
        {['purple', 'blue', 'green', 'orange'].map((color) => (
          <div key={color} className={styles.statCard}>
            <div className={styles.statCardGlow} />
            <div className={styles.statCardContent}>
              <div className={styles.statHeader}>
                <Skeleton width="2.25rem" height="2.25rem" borderRadius="lg" />
              </div>
              <Skeleton width="60%" height="0.75rem" borderRadius="sm" />
              <Skeleton width="3rem" height="1.4rem" borderRadius="sm" />
            </div>
          </div>
        ))}
      </div>

      {/* Add Keyword Button Skeleton */}
      <Skeleton width="9rem" height="2.25rem" borderRadius="md" className={styles.skeletonAddBtn} />

      {/* Table Skeleton */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <Skeleton width="10rem" height="1.25rem" borderRadius="sm" />
            <Skeleton width="6rem" height="0.8rem" borderRadius="sm" className={styles.skeletonSubtitle} />
          </div>
        </div>
        <div className={styles.tableHeader}>
          <Skeleton width="4rem" height="0.75rem" borderRadius="sm" />
          <Skeleton width="3rem" height="0.75rem" borderRadius="sm" />
          <Skeleton width="3rem" height="0.75rem" borderRadius="sm" />
          <Skeleton width="3rem" height="0.75rem" borderRadius="sm" />
          <Skeleton width="3rem" height="0.75rem" borderRadius="sm" />
          <Skeleton width="2rem" height="0.75rem" borderRadius="sm" />
          <Skeleton width="3rem" height="0.75rem" borderRadius="sm" />
          <Skeleton width="4rem" height="0.75rem" borderRadius="sm" />
          <Skeleton width="3rem" height="0.75rem" borderRadius="sm" />
          <Skeleton width="1rem" height="0.75rem" borderRadius="sm" />
        </div>
        <div className={styles.tableBody}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={styles.tableRow}>
              <div className={styles.keywordCell}>
                <Skeleton width={`${55 + (i % 3) * 15}%`} height="0.875rem" borderRadius="sm" />
              </div>
              <div className={`${styles.cell} ${styles.positionCell}`}>
                <Skeleton width="2.5rem" height="1.5rem" borderRadius="full" />
              </div>
              <div className={`${styles.cell} ${styles.volumeCell}`}>
                <Skeleton width="3rem" height="0.875rem" borderRadius="sm" />
              </div>
              <div className={`${styles.cell} ${styles.gscMetricCell}`}>
                <Skeleton width="2.5rem" height="0.875rem" borderRadius="sm" />
              </div>
              <div className={`${styles.cell} ${styles.gscMetricCell}`}>
                <Skeleton width="3rem" height="0.875rem" borderRadius="sm" />
              </div>
              <div className={`${styles.cell} ${styles.gscMetricCell}`}>
                <Skeleton width="2rem" height="0.875rem" borderRadius="sm" />
              </div>
              <div className={`${styles.cell} ${styles.intentCell}`}>
                <Skeleton width="4rem" height="1.4rem" borderRadius="full" />
              </div>
              <div className={`${styles.cell} ${styles.relatedPostCell}`}>
                <Skeleton width="2rem" height="1.4rem" borderRadius="sm" />
              </div>
              <div className={`${styles.cell} ${styles.statusCell}`}>
                <Skeleton width="4.5rem" height="1.4rem" borderRadius="full" />
              </div>
              <div className={`${styles.cell} ${styles.actionsCell}`}>
                <Skeleton width="1.5rem" height="1.5rem" borderRadius="sm" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export function KeywordsContent() {
  const { t } = useTranslation();
  const { selectedSite, isLoading: isSiteLoading } = useSite();
  const { canCreate, canEdit, canDelete, MODULES } = usePermissions();
  
  // Permission checks for keywords
  const canCreateKeywords = canCreate(MODULES.KEYWORDS);
  const canEditKeywords = canEdit(MODULES.KEYWORDS);
  const canDeleteKeywords = canDelete(MODULES.KEYWORDS);
  
  const [keywords, setKeywords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, tracking, targeting, ranking, archived
  const [showAddForm, setShowAddForm] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');
  const [addingKeyword, setAddingKeyword] = useState(false);
  const [addError, setAddError] = useState('');
  const [editingStatus, setEditingStatus] = useState(null); // keywordId being edited
  const [editingIntent, setEditingIntent] = useState(null); // keywordId being edited
  const [updatingKeywords, setUpdatingKeywords] = useState(new Set()); // keywordIds being updated
  const [generatePostKeyword, setGeneratePostKeyword] = useState(null); // keyword for post generation modal
  const [gscData, setGscData] = useState(null); // GSC metrics keyed by query
  const [gscLoading, setGscLoading] = useState(false);
  const [gscPreset, setGscPreset] = useState('30d');
  const [gscCustomStart, setGscCustomStart] = useState('');
  const [gscCustomEnd, setGscCustomEnd] = useState('');
  const dropdownRef = useRef(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setEditingStatus(null);
        setEditingIntent(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Stop loading if site context resolved with no sites
  useEffect(() => {
    if (!isSiteLoading && !selectedSite?.id) {
      setIsLoading(false);
    }
  }, [isSiteLoading, selectedSite?.id]);

  useEffect(() => {
    if (!selectedSite?.id) return;
    fetchKeywords(selectedSite.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSite?.id]);

  // Re-fetch GSC data when date range changes
  useEffect(() => {
    if (!selectedSite?.id || keywords.length === 0) return;
    if (gscPreset === 'custom' && (!gscCustomStart || !gscCustomEnd)) return;
    fetchGSCData(selectedSite.id, keywords.map(k => k.keyword));
  }, [gscPreset, gscCustomStart, gscCustomEnd]);

  const getPeriodName = () => {
    const names = {
      '7d': t('dashboard.comparison.vsPrev7'),
      '30d': t('dashboard.comparison.vsPrev30'),
      '90d': t('dashboard.comparison.vsPrev90'),
      '180d': t('dashboard.comparison.vsPrev180'),
      '365d': t('dashboard.comparison.vsPrev365'),
    };
    if (gscPreset !== 'custom') {
      const name = names[gscPreset] || '';
      return name.replace(/^(vs |מול )/, '');
    }
    const s = new Date(gscCustomStart + 'T00:00:00');
    const e = new Date(gscCustomEnd + 'T00:00:00');
    s.setFullYear(s.getFullYear() - 1);
    e.setFullYear(e.getFullYear() - 1);
    const fmt = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    return `${fmt(s)} – ${fmt(e)}`;
  };

  const fetchKeywords = async (siteId) => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/keywords?siteId=${siteId}`);
      if (res.ok) {
        const data = await res.json();
        const kws = data.keywords || [];
        setKeywords(kws);
        // Fetch GSC data for all tracked keywords
        if (kws.length > 0) {
          fetchGSCData(siteId, kws.map(k => k.keyword));
        }
      }
    } catch (err) {
      console.error('Error fetching keywords:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchGSCData = async (siteId, keywordList) => {
    setGscLoading(true);
    try {
      let start, end;
      if (gscPreset === 'custom' && gscCustomStart && gscCustomEnd) {
        start = gscCustomStart;
        end = gscCustomEnd;
      } else {
        const range = getDateRange(gscPreset);
        if (!range) return;
        start = range.start;
        end = range.end;
      }
      const prev = getPreviousPeriod(start, end, gscPreset);

      const keywordsParam = encodeURIComponent(keywordList.join(','));
      const res = await fetch(
        `/api/dashboard/stats/gsc?siteId=${siteId}&section=trackedKeywords&keywords=${keywordsParam}&startDate=${start}&endDate=${end}&compareStartDate=${prev.start}&compareEndDate=${prev.end}`
      );
      if (res.ok) {
        const json = await res.json();
        const map = new Map();
        for (const q of (json.trackedQueries || [])) {
          map.set(q.query.toLowerCase().trim(), q);
        }
        setGscData(map);
      }
    } catch (err) {
      console.error('Error fetching GSC data:', err);
    } finally {
      setGscLoading(false);
    }
  };

  const handleAddKeyword = async (e) => {
    e?.preventDefault();
    const kw = newKeyword.trim();
    if (!kw || !selectedSite?.id) return;

    setAddingKeyword(true);
    setAddError('');

    try {
      const res = await fetch('/api/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: selectedSite.id, keywords: kw }),
      });
      const data = await res.json();

      if (!res.ok) {
        setAddError(data.duplicates
          ? t('keywordStrategy.duplicateKeyword')
          : (data.error || t('keywordStrategy.addError')));
        return;
      }

      setKeywords(prev => [...(data.keywords || []), ...prev]);
      setNewKeyword('');
      setShowAddForm(false);
    } catch (err) {
      setAddError(t('keywordStrategy.addError'));
    } finally {
      setAddingKeyword(false);
    }
  };

  const handleUpdateStatus = async (keywordId, newStatus) => {
    setUpdatingKeywords(prev => new Set(prev).add(keywordId));
    try {
      const res = await fetch('/api/keywords', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywordId, status: newStatus }),
      });
      if (res.ok) {
        const data = await res.json();
        setKeywords(prev => prev.map(kw => 
          kw.id === keywordId ? { ...kw, status: data.keyword.status } : kw
        ));
      }
    } catch (err) {
      console.error('Error updating status:', err);
    } finally {
      setUpdatingKeywords(prev => { const s = new Set(prev); s.delete(keywordId); return s; });
      setEditingStatus(null);
    }
  };

  const handleUpdateIntent = async (keywordId, intentToToggle) => {
    const keyword = keywords.find(kw => kw.id === keywordId);
    if (!keyword) return;

    setUpdatingKeywords(prev => new Set(prev).add(keywordId));
    
    // Get current intents array (or empty)
    const currentIntents = keyword.intents || [];
    
    // Toggle the intent
    let newIntents;
    if (currentIntents.includes(intentToToggle)) {
      // Remove it
      newIntents = currentIntents.filter(i => i !== intentToToggle);
    } else {
      // Add it
      newIntents = [...currentIntents, intentToToggle];
    }

    try {
      const res = await fetch('/api/keywords', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywordId, intents: newIntents }),
      });
      if (res.ok) {
        const data = await res.json();
        setKeywords(prev => prev.map(kw => 
          kw.id === keywordId ? { ...kw, intents: data.keyword.intents } : kw
        ));
      }
    } catch (err) {
      console.error('Error updating intents:', err);
    } finally {
      setUpdatingKeywords(prev => { const s = new Set(prev); s.delete(keywordId); return s; });
    }
  };

  const handleClearIntents = async (keywordId) => {
    setUpdatingKeywords(prev => new Set(prev).add(keywordId));
    try {
      const res = await fetch('/api/keywords', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywordId, intents: [] }),
      });
      if (res.ok) {
        setKeywords(prev => prev.map(kw => 
          kw.id === keywordId ? { ...kw, intents: [] } : kw
        ));
      }
    } catch (err) {
      console.error('Error clearing intents:', err);
    } finally {
      setUpdatingKeywords(prev => { const s = new Set(prev); s.delete(keywordId); return s; });
      setEditingIntent(null);
    }
  };

  const handleAnalyzeIntent = async (keywordId) => {
    setUpdatingKeywords(prev => new Set(prev).add(keywordId));
    try {
      const res = await fetch('/api/keywords', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywordId, analyzeIntent: true }),
      });
      if (res.ok) {
        const data = await res.json();
        setKeywords(prev => prev.map(kw => 
          kw.id === keywordId ? { ...kw, intents: data.keyword.intents } : kw
        ));
        if (data.creditsUsed) {
          emitCreditsUpdated();
        }
      }
    } catch (err) {
      console.error('Error analyzing intent:', err);
    } finally {
      setUpdatingKeywords(prev => { const s = new Set(prev); s.delete(keywordId); return s; });
    }
  };

  const handleDeleteKeyword = async (keywordId) => {
    if (!confirm(t('keywordStrategy.confirmDelete'))) return;
    
    try {
      const res = await fetch(`/api/keywords?keywordId=${keywordId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setKeywords(prev => prev.filter(kw => kw.id !== keywordId));
      }
    } catch (err) {
      console.error('Error deleting keyword:', err);
    }
  };

  // Intent options
  const intentOptions = [
    { value: 'INFORMATIONAL', label: t('keywordStrategy.intent.informational'), desc: t('keywordStrategy.intent.informationalDesc'), icon: Info },
    { value: 'NAVIGATIONAL', label: t('keywordStrategy.intent.navigational'), desc: t('keywordStrategy.intent.navigationalDesc'), icon: Navigation },
    { value: 'TRANSACTIONAL', label: t('keywordStrategy.intent.transactional'), desc: t('keywordStrategy.intent.transactionalDesc'), icon: ShoppingCart },
    { value: 'COMMERCIAL', label: t('keywordStrategy.intent.commercial'), desc: t('keywordStrategy.intent.commercialDesc'), icon: DollarSign },
  ];

  // Status options
  const statusOptions = [
    { value: 'TRACKING', label: t('keywordStrategy.statusLabels.tracking') },
    { value: 'TARGETING', label: t('keywordStrategy.statusLabels.targeting') },
    { value: 'RANKING', label: t('keywordStrategy.statusLabels.ranking') },
    { value: 'ARCHIVED', label: t('keywordStrategy.statusLabels.archived') },
  ];

  const getIntentLabel = (intent) => {
    const option = intentOptions.find(o => o.value === intent);
    return option?.label || intent;
  };

  const getIntentDesc = (intent) => {
    const option = intentOptions.find(o => o.value === intent);
    return option?.desc || '';
  };

  const filteredKeywords = filter === 'all'
    ? keywords
    : keywords.filter(kw => kw.status === filter.toUpperCase());

  // Stats — aggregate from GSC data for the selected date range
  const totalKeywords = keywords.length;
  const gscStats = (() => {
    if (!gscData) return { clicks: 0, impressions: 0, avgPosition: 0, top10: 0 };
    let clicks = 0, impressions = 0, posSum = 0, posCount = 0, top10 = 0;
    for (const kw of keywords) {
      const g = gscData.get(kw.keyword.toLowerCase().trim());
      if (!g) continue;
      clicks += g.clicks || 0;
      impressions += g.impressions || 0;
      const pos = parseFloat(g.position);
      if (pos) { posSum += pos; posCount++; if (pos <= 10) top10++; }
    }
    return {
      clicks,
      impressions,
      avgPosition: posCount ? (posSum / posCount).toFixed(1) : 0,
      top10,
    };
  })();

  const getDifficultyText = (level) => {
    switch (level) {
      case 'easy': return t('keywordStrategy.easy');
      case 'medium': return t('keywordStrategy.medium');
      case 'hard': return t('keywordStrategy.hard');
      default: return '';
    }
  };

  const getGSCMetrics = (keyword) => {
    if (!gscData) return null;
    return gscData.get(keyword.toLowerCase().trim()) || null;
  };

  const changeTip = (change, value, metric) => {
    if (change == null) return undefined;
    const period = getPeriodName();
    if (change === 0) return t('keywordStrategy.tooltips.noChange', { value, metric, period });
    return change > 0
      ? t('keywordStrategy.tooltips.moreFromPrev', { value, metric, percent: Math.abs(change), period })
      : t('keywordStrategy.tooltips.lessFromPrev', { value, metric, percent: Math.abs(change), period });
  };

  const positionTip = (change) => {
    if (change == null) return undefined;
    const period = getPeriodName();
    if (change === 0) return t('keywordStrategy.tooltips.positionNoChange', { period });
    return change > 0
      ? t('keywordStrategy.tooltips.positionUp', { percent: Math.abs(change), period })
      : t('keywordStrategy.tooltips.positionDown', { percent: Math.abs(change), period });
  };

  const ChangeBadge = ({ value, tooltip }) => {
    if (value == null) return null;
    const isZero = value === 0;
    const isUp = value > 0;
    const cls = isZero ? styles.changeBadgeNeutral : isUp ? styles.changeBadgeUp : styles.changeBadgeDown;
    return (
      <span
        className={`${styles.changeBadge} ${cls} ${tooltip ? styles.hasTooltip : ''}`}
        data-tooltip={tooltip || undefined}
      >
        {isZero ? '0% —' : <>{isUp ? '↑' : '↓'}{Math.abs(value)}%</>}
      </span>
    );
  };

  const fmtNum = (n) => {
    if (n == null) return '—';
    return n.toLocaleString();
  };

  if (isSiteLoading || isLoading) {
    return <KeywordsPageSkeleton />;
  }

  if (!selectedSite) {
    return (
      <div className={styles.emptyState}>
        <Search size={32} />
        <p>{t('keywordStrategy.noSiteSelected')}</p>
      </div>
    );
  }

  return (
    <>
      {/* Filter Tabs */}
      <div className={styles.filterTabs}>
        <div className={styles.filterButtons}>
          {['all', 'tracking', 'targeting', 'ranking', 'archived'].map((f) => (
            <button
              key={f}
              className={`${styles.filterTab} ${filter === f ? styles.active : ''}`}
              onClick={() => setFilter(f)}
            >
              {t(`keywordStrategy.filter.${f}`)}
              <span className={styles.filterCount}>
                {f === 'all' ? keywords.length : keywords.filter(kw => kw.status === f.toUpperCase()).length}
              </span>
            </button>
          ))}
        </div>
        <div className={styles.dateRangeSelect}>
          <select
            className={styles.chartDateSelect}
            value={gscPreset}
            onChange={(e) => setGscPreset(e.target.value)}
            disabled={gscLoading}
          >
            <option value="7d">{t('dashboard.dateRange.last7')}</option>
            <option value="30d">{t('dashboard.dateRange.last30')}</option>
            <option value="90d">{t('dashboard.dateRange.last90')}</option>
            <option value="180d">{t('dashboard.dateRange.last180')}</option>
            <option value="365d">{t('dashboard.dateRange.last365')}</option>
            <option value="custom">{t('dashboard.dateRange.custom')}</option>
          </select>
          {gscPreset === 'custom' && (
            <>
              <label className={styles.chartDateLabel}>
                <span className={styles.chartDateLabelText}>{t('common.from')}</span>
                <input
                  type="date"
                  className={styles.chartDateInput}
                  value={gscCustomStart}
                  onChange={(e) => setGscCustomStart(e.target.value)}
                  max={gscCustomEnd || fmtDate(new Date())}
                />
              </label>
              <span className={styles.chartDateSeparator}>—</span>
              <label className={styles.chartDateLabel}>
                <span className={styles.chartDateLabelText}>{t('common.to')}</span>
                <input
                  type="date"
                  className={styles.chartDateInput}
                  value={gscCustomEnd}
                  onChange={(e) => setGscCustomEnd(e.target.value)}
                  min={gscCustomStart}
                  max={fmtDate(new Date())}
                />
              </label>
            </>
          )}
        </div>
      </div>

      {/* Stats Row */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={styles.statCardGlow} />
          <div className={styles.statCardContent}>
            <div className={styles.statHeader}>
              <div className={`${styles.statIconWrap} ${styles.statIconPurple}`}>
                <Tag className={styles.statIcon} />
              </div>
            </div>
            <span className={styles.statLabel}>{t('keywordStrategy.trackedKeywords')}</span>
            <span className={styles.statValue}>{totalKeywords}</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statCardGlow} />
          <div className={styles.statCardContent}>
            <div className={styles.statHeader}>
              <div className={`${styles.statIconWrap} ${styles.statIconBlue}`}>
                <BarChart3 className={styles.statIcon} />
              </div>
            </div>
            <span className={styles.statLabel}>{t('keywordStrategy.clicks')}</span>
            {gscLoading ? <Skeleton width="3rem" height="1.4rem" borderRadius="sm" /> : <span className={styles.statValue}>{gscStats.clicks.toLocaleString()}</span>}
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statCardGlow} />
          <div className={styles.statCardContent}>
            <div className={styles.statHeader}>
              <div className={`${styles.statIconWrap} ${styles.statIconGreen}`}>
                <Trophy className={styles.statIcon} />
              </div>
            </div>
            <span className={styles.statLabel}>{t('keywordStrategy.topRankings')}</span>
            {gscLoading ? <Skeleton width="3rem" height="1.4rem" borderRadius="sm" /> : <span className={styles.statValue}>{gscStats.top10}</span>}
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statCardGlow} />
          <div className={styles.statCardContent}>
            <div className={styles.statHeader}>
              <div className={`${styles.statIconWrap} ${styles.statIconOrange}`}>
                <Crosshair className={styles.statIcon} />
              </div>
            </div>
            <span className={styles.statLabel}>{t('keywordStrategy.impressions')}</span>
            {gscLoading ? <Skeleton width="3rem" height="1.4rem" borderRadius="sm" /> : <span className={styles.statValue}>{gscStats.impressions.toLocaleString()}</span>}
          </div>
        </div>
      </div>

      {/* Add Keyword */}
      {/* Add Keyword Form - Only show if user can create keywords */}
      {canCreateKeywords && (
        showAddForm ? (
          <div className={styles.addKeywordCard}>
            <form onSubmit={handleAddKeyword} className={styles.addKeywordForm}>
              <input
                type="text"
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                placeholder={t('keywordStrategy.enterKeyword')}
                className={styles.addKeywordInput}
                autoFocus
              />
              <button
                type="submit"
                className={styles.addKeywordBtn}
                disabled={addingKeyword || !newKeyword.trim()}
              >
                {addingKeyword ? <Loader2 size={14} className={styles.spinner} /> : <Plus size={14} />}
                {t('common.add')}
              </button>
              <button
                type="button"
                className={styles.addKeywordCancel}
                onClick={() => { setShowAddForm(false); setAddError(''); }}
              >
                <X size={14} />
              </button>
            </form>
            {addError && <p className={styles.addError}>{addError}</p>}
          </div>
        ) : (
          <button
            className={styles.addKeywordToggle}
            onClick={() => setShowAddForm(true)}
          >
            <Plus size={14} />
            {t('keywordStrategy.addKeyword')}
          </button>
        )
      )}

      {/* Keywords Table */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h3 className={styles.cardTitle}>{t('keywordStrategy.currentRankings')}</h3>
            <p className={styles.cardSubtitle}>
              {filteredKeywords.length} {t('keywordStrategy.keywordsFound')}
            </p>
          </div>
        </div>

        {filteredKeywords.length === 0 ? (
          <div className={styles.emptyState}>
            <Tag size={24} />
            <p>{t('keywordStrategy.noKeywords')}</p>
            <p className={styles.emptyStateHint}>{t('keywordStrategy.noKeywordsHint')}</p>
            <Link href="/dashboard/strategy/site-profile" className={styles.startInterviewBtn}>
              <Sparkles size={16} />
              {t('keywordStrategy.startInterview')}
            </Link>
          </div>
        ) : (
          <>
            <div className={styles.tableHeader}>
              <span className={styles.hasTooltip} data-tooltip={t('keywordStrategy.tooltips.keyword')}>{t('keywordStrategy.keyword')}</span>
              <span className={styles.hasTooltip} data-tooltip={t('keywordStrategy.tooltips.position')}>{t('keywordStrategy.position')}</span>
              <span className={styles.hasTooltip} data-tooltip={t('keywordStrategy.tooltips.volume')}>{t('keywordStrategy.volume')}</span>
              <span className={styles.hasTooltip} data-tooltip={t('keywordStrategy.tooltips.clicks')}>{t('keywordStrategy.clicks')}</span>
              <span className={styles.hasTooltip} data-tooltip={t('keywordStrategy.tooltips.impressions')}>{t('keywordStrategy.impressions')}</span>
              <span className={styles.hasTooltip} data-tooltip={t('keywordStrategy.tooltips.ctr')}>{t('keywordStrategy.ctr')}</span>
              <span className={styles.hasTooltip} data-tooltip={t('keywordStrategy.tooltips.intent')}>{t('keywordStrategy.intent.label')}</span>
              <span className={styles.hasTooltip} data-tooltip={t('keywordStrategy.tooltips.relatedPost')}>{t('keywordStrategy.columns.relatedPost')}</span>
              <span className={styles.hasTooltip} data-tooltip={t('keywordStrategy.tooltips.status')}>{t('keywordStrategy.status')}</span>
              <span></span>
            </div>
            <div className={styles.tableBody}>
              {filteredKeywords.map((kw) => {
                const diffLevel = getDifficultyLevel(kw.difficulty);
                const isUpdating = updatingKeywords.has(kw.id);
                const gsc = getGSCMetrics(kw.keyword);
                const position = gsc?.position ?? kw.position;
                const volume = gsc?.impressions ?? kw.searchVolume;
                return (
                  <div key={kw.id} className={styles.tableRow}>
                    <div className={styles.keywordCell}>
                      {kw.keyword}
                      {kw.tags?.includes('interview') && (
                        <span className={styles.interviewBadge}>
                          {t('keywordStrategy.fromInterview')}
                        </span>
                      )}
                      {kw.tags?.includes('gsc') && (
                        <span className={styles.gscBadge}>GSC</span>
                      )}
                      {kw.tags?.includes('manual') && (
                        <span className={styles.manualBadge}>
                          {t('keywordStrategy.fromManual')}
                        </span>
                      )}
                    </div>
                    <div className={`${styles.cell} ${styles.positionCell}`}>
                      {gscLoading ? (
                        <Skeleton width="2.5rem" height="1.5rem" borderRadius="full" />
                      ) : position ? (
                        <>
                          <span className={`${styles.positionBadge} ${styles[getPositionClass(position)]}`}>
                            #{Math.round(position)}
                          </span>
                          {gsc && <ChangeBadge value={gsc.positionChange} tooltip={positionTip(gsc.positionChange)} />}
                        </>
                      ) : (
                        <span className={styles.noData}>—</span>
                      )}
                    </div>
                    <div className={`${styles.cell} ${styles.volumeCell}`}>
                      {gscLoading ? <Skeleton width="3rem" height="0.875rem" borderRadius="sm" /> : volume ? fmtNum(volume) : '—'}
                    </div>
                    <div className={`${styles.cell} ${styles.gscMetricCell}`}>
                      {gscLoading ? (
                        <Skeleton width="2.5rem" height="0.875rem" borderRadius="sm" />
                      ) : (
                        <>
                          {gsc ? fmtNum(gsc.clicks) : '—'}
                          {gsc && <ChangeBadge value={gsc.clicksChange} tooltip={changeTip(gsc.clicksChange, fmtNum(gsc.clicks), t('keywordStrategy.clicks'))} />}
                        </>
                      )}
                    </div>
                    <div className={`${styles.cell} ${styles.gscMetricCell}`}>
                      {gscLoading ? (
                        <Skeleton width="3rem" height="0.875rem" borderRadius="sm" />
                      ) : (
                        <>
                          {gsc ? fmtNum(gsc.impressions) : '—'}
                          {gsc && <ChangeBadge value={gsc.impressionsChange} tooltip={changeTip(gsc.impressionsChange, fmtNum(gsc.impressions), t('keywordStrategy.impressions'))} />}
                        </>
                      )}
                    </div>
                    <div className={`${styles.cell} ${styles.gscMetricCell}`}>
                      {gscLoading ? (
                        <Skeleton width="2rem" height="0.875rem" borderRadius="sm" />
                      ) : (
                        <>
                          {gsc ? `${gsc.ctr}%` : '—'}
                          {gsc && <ChangeBadge value={gsc.ctrChange} tooltip={changeTip(gsc.ctrChange, `${gsc.ctr}%`, t('keywordStrategy.ctr'))} />}
                        </>
                      )}
                    </div>
                    {/* Intent Column */}
                    <div className={`${styles.cell} ${styles.intentCell}`} ref={editingIntent === kw.id ? dropdownRef : null}>
                      <div className={styles.dropdownWrapper}>
                        {kw.intents?.length > 0 ? (
                          <div 
                            className={styles.intentBadges}
                            onClick={() => canEditKeywords && setEditingIntent(editingIntent === kw.id ? null : kw.id)}
                            style={{ cursor: canEditKeywords ? 'pointer' : 'default' }}
                          >
                            {isUpdating ? (
                              <Loader2 size={12} className={styles.spinner} />
                            ) : (
                              kw.intents.map(intent => (
                                <span 
                                  key={intent}
                                  className={`${styles.intentBadge} ${styles[`intent${intent}`]} ${styles.hasTooltip}`}
                                  data-tooltip={getIntentDesc(intent)}
                                >
                                  {getIntentLabel(intent)}
                                </span>
                              ))
                            )}
                          </div>
                        ) : canEditKeywords ? (
                          <button 
                            className={styles.analyzeIntentBtn}
                            onClick={() => handleAnalyzeIntent(kw.id)}
                            disabled={isUpdating}
                          >
                            {isUpdating ? <Loader2 size={12} className={styles.spinner} /> : <Sparkles size={12} />}
                            {t('keywordStrategy.setIntent')}
                          </button>
                        ) : (
                          <span className={styles.noPermission}>—</span>
                        )}
                        {canEditKeywords && editingIntent === kw.id && (
                          <div className={styles.dropdown}>
                            {intentOptions.map((opt) => {
                              const Icon = opt.icon;
                              const isSelected = kw.intents?.includes(opt.value);
                              return (
                                <button
                                  key={opt.value}
                                  className={`${styles.dropdownItem} ${isSelected ? styles.active : ''}`}
                                  onClick={() => handleUpdateIntent(kw.id, opt.value)}
                                >
                                  <span className={styles.checkmark}>{isSelected ? '✓' : ''}</span>
                                  <Icon size={14} />
                                  {opt.label}
                                </button>
                              );
                            })}
                            {kw.intents?.length > 0 && (
                              <>
                                <div className={styles.dropdownDivider} />
                                <button
                                  className={styles.dropdownItem}
                                  onClick={() => { handleAnalyzeIntent(kw.id); setEditingIntent(null); }}
                                >
                                  <Sparkles size={14} />
                                  {t('keywordStrategy.reanalyze')}
                                </button>
                                <button
                                  className={styles.dropdownItem}
                                  onClick={() => handleClearIntents(kw.id)}
                                >
                                  <X size={14} />
                                  {t('common.clear')}
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Related Post Column */}
                    <div className={`${styles.cell} ${styles.relatedPostCell}`}>
                      {kw.relatedPost ? (
                        <div className={styles.relatedPostLinks}>
                          <Link 
                            href={`/dashboard/entities/posts/${kw.relatedPost.id}`}
                            className={styles.relatedPostLink}
                            title={kw.relatedPost.title}
                          >
                            <FileText size={12} />
                          </Link>
                          {kw.relatedPost.url && (
                            <a 
                              href={kw.relatedPost.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.externalLink}
                              title={kw.relatedPost.url}
                            >
                              <ExternalLink size={12} />
                            </a>
                          )}
                        </div>
                      ) : (
                        <button 
                          className={styles.addPostBtn}
                          onClick={() => setGeneratePostKeyword(kw)}
                          title={t('keywordStrategy.generatePost')}
                        >
                          <Wand2 size={12} />
                          <Plus size={10} />
                        </button>
                      )}
                    </div>
                    {/* Status Column */}
                    <div className={`${styles.cell} ${styles.statusCell}`} ref={editingStatus === kw.id ? dropdownRef : null}>
                      <div className={styles.dropdownWrapper}>
                        <span 
                          className={`${styles.statusBadge} ${styles[`status${kw.status}`]}`}
                          onClick={() => canEditKeywords && setEditingStatus(editingStatus === kw.id ? null : kw.id)}
                          style={{ cursor: canEditKeywords ? 'pointer' : 'default' }}
                        >
                          {isUpdating ? <Loader2 size={12} className={styles.spinner} /> : (t(`keywordStrategy.statusLabels.${kw.status.toLowerCase()}`) || kw.status)}
                        </span>
                        {canEditKeywords && editingStatus === kw.id && (
                          <div className={styles.dropdown}>
                            {statusOptions.map((opt) => (
                              <button
                                key={opt.value}
                                className={`${styles.dropdownItem} ${kw.status === opt.value ? styles.active : ''}`}
                                onClick={() => handleUpdateStatus(kw.id, opt.value)}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Actions */}
                    <div className={`${styles.cell} ${styles.actionsCell}`}>
                      {canDeleteKeywords && (
                        <button
                          className={styles.deleteBtn}
                          onClick={() => handleDeleteKeyword(kw.id)}
                          title={t('common.delete')}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
      
      {/* Generate Post Modal */}
      <GeneratePostModal
        isOpen={!!generatePostKeyword}
        onClose={() => setGeneratePostKeyword(null)}
        keyword={generatePostKeyword}
        onSuccess={(content) => {
          // Update only the affected keyword row (not full refetch)
          if (content?.wpPostUrl && generatePostKeyword?.id) {
            setKeywords(prev => prev.map(kw =>
              kw.id === generatePostKeyword.id
                ? { ...kw, url: content.wpPostUrl, relatedPost: { id: content.siteEntityId || content.id, title: content.title, url: content.wpPostUrl } }
                : kw
            ));
          } else {
            fetchKeywords(selectedSite.id);
          }
        }}
      />
    </>
  );
}
