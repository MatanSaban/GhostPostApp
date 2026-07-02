'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { TrendingUp, TrendingDown, Minus, Search, Loader2, Tag, Trash2, Plus, X, Sparkles, BarChart3, Crosshair, Trophy, ChevronDown, ChevronUp, Info, Navigation, ShoppingCart, DollarSign, ExternalLink, FileText, Wand2, Calendar, ArrowUpDown, Link2, Link2Off, MapPin, RefreshCw } from 'lucide-react';
import { useSite } from '@/app/context/site-context';
import { useTranslation } from '@/app/context/locale-context';
import { emitCreditsUpdated } from '@/app/context/user-context';
import { handleLimitError } from '@/app/context/limit-guard-context';
import { usePermissions } from '@/app/hooks/usePermissions';
import { Skeleton } from '@/app/dashboard/components/Skeleton';
import { Button } from '@/app/dashboard/components';
import { decodeDisplayUrl } from '@/lib/urlDisplay';
import GeneratePostModal from './GeneratePostModal';
import { LinkEntityModal } from './LinkEntityModal';
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

function KeywordsPageSkeleton({ t }) {
  const STAT_ICONS = [
    { icon: Tag, color: 'Purple', label: t('keywordStrategy.trackedKeywords') },
    { icon: BarChart3, color: 'Blue', label: t('keywordStrategy.clicks') },
    { icon: Trophy, color: 'Green', label: t('keywordStrategy.topRankings') },
    { icon: Crosshair, color: 'Orange', label: t('keywordStrategy.impressions') },
  ];
  return (
    <>
      {/* Filter Tabs Skeleton */}
      <div className={styles.filterTabs}>
        <div className={styles.filterButtons}>
          {['all', 'tracking', 'targeting', 'ranking', 'archived'].map((f) => (
            <button key={f} className={styles.filterTab} disabled>
              {t(`keywordStrategy.filter.${f}`)}
            </button>
          ))}
        </div>
        <Skeleton width="7rem" height="1.75rem" borderRadius="md" />
      </div>

      {/* Stat Cards Skeleton */}
      <div className={styles.statsRow}>
        {STAT_ICONS.map(({ icon: Icon, color, label }) => (
          <div key={color} className={styles.statCard}>
            <div className={styles.statCardGlow} />
            <div className={styles.statCardContent}>
              <div className={styles.statHeader}>
                <div className={`${styles.statIconWrap} ${styles[`statIcon${color}`]}`}>
                  <Icon className={styles.statIcon} />
                </div>
              </div>
              <span className={styles.statLabel}>{label}</span>
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
  const { t, locale } = useTranslation();
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
  const [linkEntityKeyword, setLinkEntityKeyword] = useState(null); // keyword for the "link existing entity" modal
  const [unlinkingKeywordId, setUnlinkingKeywordId] = useState(null); // keyword mid-unlink (spinner on its button)
  const [gscData, setGscData] = useState(null); // GSC metrics keyed by query
  const [gscStatus, setGscStatus] = useState(null); // null | 'ok' | 'notConnected' | 'tokenError'
  const [gscLoading, setGscLoading] = useState(false);
  const [gscPreset, setGscPreset] = useState('30d');
  const [gscCustomStart, setGscCustomStart] = useState('');
  const [gscCustomEnd, setGscCustomEnd] = useState('');
  const [sortBy, setSortBy] = useState('keyword'); // keyword, position, serp, clicks, impressions, ctr, status
  const [sortDir, setSortDir] = useState('asc'); // asc, desc
  const [refreshingVolume, setRefreshingVolume] = useState(false);
  const [checkingRanks, setCheckingRanks] = useState(false);
  const [serpGeo, setSerpGeo] = useState(null); // { countryCode, label, languageCode } the last rank check ran against
  const [serpBillingError, setSerpBillingError] = useState(false);
  const [rowBusy, setRowBusy] = useState(new Set()); // per-cell refresh keys: `${keywordId}:rank|vol|gsc`
  const dropdownRef = useRef(null);

  const setRowBusyKey = (key, on) => setRowBusy(prev => {
    const s = new Set(prev);
    if (on) s.add(key); else s.delete(key);
    return s;
  });

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
    didAutoFill.current = false; // re-run the column auto-fill for the new site
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
    const fmt = (d) => d.toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

  // Track if we've done the initial force refresh to clear stale cache
  const didForceRefresh = useRef(false);

  const fetchGSCData = async (siteId, keywordList, forceRefresh = false) => {
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
      // Force refresh on first load to clear any stale cached data
      const shouldForceRefresh = forceRefresh || !didForceRefresh.current;
      if (shouldForceRefresh) didForceRefresh.current = true;
      
      const res = await fetch(
        `/api/dashboard/stats/gsc?siteId=${siteId}&section=trackedKeywords&keywords=${keywordsParam}&startDate=${start}&endDate=${end}&compareStartDate=${prev.start}&compareEndDate=${prev.end}${shouldForceRefresh ? '&forceRefresh=true' : ''}`
      );
      if (res.ok) {
        const json = await res.json();
        if (json.gscConnected === false) setGscStatus('notConnected');
        else if (json.tokenError) setGscStatus('tokenError');
        else setGscStatus('ok');
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

  const handleRefreshVolume = async () => {
    if (!selectedSite?.id || keywords.length === 0 || refreshingVolume) return;
    setRefreshingVolume(true);
    try {
      const res = await fetch('/api/keywords/search-volume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: selectedSite.id,
          keywords: keywords.map(k => k.keyword),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.results) {
          setKeywords(prev => prev.map(kw => {
            const vol = data.results[kw.keyword.toLowerCase().trim()];
            if (vol?.avgMonthlySearches != null) {
              return { ...kw, searchVolume: vol.avgMonthlySearches };
            }
            return kw;
          }));
        }
      }
    } catch (err) {
      console.error('Error refreshing search volume:', err);
    } finally {
      setRefreshingVolume(false);
    }
  };

  // Live Google rank check - position of this site's domain in organic
  // results per keyword. Results persist server-side on the Keyword
  // rows, so they survive reloads; the button forces a fresh check, while the
  // auto-fill on load only checks keywords that were never checked.
  const checkRankings = async (keywordList, forceRefresh) => {
    if (!selectedSite?.id || keywordList.length === 0 || checkingRanks) return;
    setCheckingRanks(true);
    try {
      const res = await fetch('/api/keywords/serp-position', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: selectedSite.id,
          keywords: keywordList,
          forceRefresh,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.geo) setSerpGeo(data.geo);
        setSerpBillingError(!!data.billingError);
        if (data.results) {
          setKeywords(prev => prev.map(kw => {
            const r = data.results[kw.keyword.toLowerCase().trim()];
            if (r === undefined || r === null) return kw;
            return { ...kw, serpPosition: r.position, serpUrl: r.url, serpCheckedAt: r.checkedAt };
          }));
        }
      }
    } catch (err) {
      console.error('Error checking keyword rankings:', err);
    } finally {
      setCheckingRanks(false);
    }
  };

  // "Israel · Hebrew" style label for the market the rank check ran against.
  const geoLabel = serpGeo
    ? `${serpGeo.label}${serpGeo.languageCode ? ` · ${serpGeo.languageCode.toUpperCase()}` : ''}`
    : null;

  const handleCheckRankings = () => checkRankings(keywords.map(k => k.keyword), true);

  // ---- Per-keyword refreshes (single-row, independent spinners) ----
  // Each targets one keyword so the user can refresh a single cell without
  // re-spending API quota on the whole table.

  const refreshRowRank = async (kw) => {
    const key = `${kw.id}:rank`;
    if (rowBusy.has(key) || !selectedSite?.id) return;
    setRowBusyKey(key, true);
    try {
      const res = await fetch('/api/keywords/serp-position', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: selectedSite.id, keywords: [kw.keyword], forceRefresh: true }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.geo) setSerpGeo(data.geo);
        setSerpBillingError(!!data.billingError);
        const r = data.results?.[kw.keyword.toLowerCase().trim()];
        if (r) {
          setKeywords(prev => prev.map(k =>
            k.id === kw.id ? { ...k, serpPosition: r.position, serpUrl: r.url, serpCheckedAt: r.checkedAt } : k
          ));
        }
      }
    } catch (err) {
      console.error('[Keywords] row rank refresh failed:', err);
    } finally {
      setRowBusyKey(key, false);
    }
  };

  const refreshRowVolume = async (kw) => {
    const key = `${kw.id}:vol`;
    if (rowBusy.has(key) || !selectedSite?.id) return;
    setRowBusyKey(key, true);
    try {
      const res = await fetch('/api/keywords/search-volume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: selectedSite.id, keywords: [kw.keyword] }),
      });
      if (res.ok) {
        const data = await res.json();
        const vol = data.results?.[kw.keyword.toLowerCase().trim()];
        if (vol?.avgMonthlySearches != null) {
          setKeywords(prev => prev.map(k =>
            k.id === kw.id ? { ...k, searchVolume: vol.avgMonthlySearches } : k
          ));
        }
      }
    } catch (err) {
      console.error('[Keywords] row volume refresh failed:', err);
    } finally {
      setRowBusyKey(key, false);
    }
  };

  // Refreshes all four GSC metrics (position/clicks/impressions/CTR) for one
  // keyword - they all come from a single GSC fetch. noStore avoids clobbering
  // the shared full-set cache with a single-keyword result.
  const refreshRowGsc = async (kw) => {
    const key = `${kw.id}:gsc`;
    if (rowBusy.has(key) || !selectedSite?.id) return;
    setRowBusyKey(key, true);
    try {
      let start, end;
      if (gscPreset === 'custom' && gscCustomStart && gscCustomEnd) {
        start = gscCustomStart; end = gscCustomEnd;
      } else {
        const range = getDateRange(gscPreset);
        if (!range) return;
        start = range.start; end = range.end;
      }
      const prevPeriod = getPreviousPeriod(start, end, gscPreset);
      const kwParam = encodeURIComponent(kw.keyword);
      const res = await fetch(
        `/api/dashboard/stats/gsc?siteId=${selectedSite.id}&section=trackedKeywords&keywords=${kwParam}&startDate=${start}&endDate=${end}&compareStartDate=${prevPeriod.start}&compareEndDate=${prevPeriod.end}&forceRefresh=true&noStore=true`
      );
      if (res.ok) {
        const json = await res.json();
        if (json.gscConnected === false) setGscStatus('notConnected');
        else if (json.tokenError) setGscStatus('tokenError');
        else setGscStatus('ok');
        const q = (json.trackedQueries || [])[0];
        if (q) {
          setGscData(prevMap => {
            const m = new Map(prevMap || []);
            m.set(q.query.toLowerCase().trim(), q);
            return m;
          });
        }
      }
    } catch (err) {
      console.error('[Keywords] row GSC refresh failed:', err);
    } finally {
      setRowBusyKey(key, false);
    }
  };

  // Auto-fill missing column data once per site load. Both paths are
  // cache-first server-side, so reloading the page doesn't re-spend API
  // quota: volume comes from KeywordVolumeCache (30d TTL) and rank checks
  // are limited to keywords that were never checked at all.
  const didAutoFill = useRef(false);
  useEffect(() => {
    if (didAutoFill.current || keywords.length === 0) return;
    didAutoFill.current = true;
    if (keywords.some(kw => kw.searchVolume == null)) {
      handleRefreshVolume();
    }
    const neverChecked = keywords.filter(kw => !kw.serpCheckedAt).map(kw => kw.keyword);
    if (neverChecked.length > 0) {
      checkRankings(neverChecked, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keywords]);

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
        // Handle limit reached error with global modal
        if (handleLimitError(data)) {
          return;
        }
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

  // Called by LinkEntityModal after a successful PATCH - patch our local
  // state so the row updates without a full refetch.
  const handleEntityLinked = (keywordId, entity) => {
    setKeywords(prev => prev.map(kw =>
      kw.id === keywordId
        ? {
            ...kw,
            url: entity.url,
            relatedPost: {
              id: entity.id,
              title: entity.title,
              url: entity.url,
              entityTypeSlug: entity.entityTypeSlug,
              entityTypeName: entity.entityTypeName,
              entityTypeLabels: entity.entityTypeLabels,
            },
          }
        : kw
    ));
  };

  const handleUnlinkEntity = async (keywordId) => {
    setUnlinkingKeywordId(keywordId);
    try {
      const res = await fetch('/api/keywords', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywordId, url: null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to unlink entity');
      }
      setKeywords(prev => prev.map(kw =>
        kw.id === keywordId ? { ...kw, url: null, relatedPost: null } : kw
      ));
    } catch (err) {
      console.error('[Keywords] unlink failed:', err);
    } finally {
      setUnlinkingKeywordId(null);
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

  // Sort keywords
  const sortedKeywords = [...filteredKeywords].sort((a, b) => {
    const gscA = gscData?.get(a.keyword.toLowerCase().trim());
    const gscB = gscData?.get(b.keyword.toLowerCase().trim());
    
    let valA, valB;
    switch (sortBy) {
      case 'keyword':
        valA = a.keyword.toLowerCase();
        valB = b.keyword.toLowerCase();
        break;
      case 'position':
        valA = parseFloat(gscA?.position) || 999;
        valB = parseFloat(gscB?.position) || 999;
        break;
      case 'serp':
        // Checked-but-not-found sorts after ranked rows, unchecked rows last
        valA = a.serpPosition || (a.serpCheckedAt ? 500 : 999);
        valB = b.serpPosition || (b.serpCheckedAt ? 500 : 999);
        break;
      case 'clicks':
        valA = gscA?.clicks || 0;
        valB = gscB?.clicks || 0;
        break;
      case 'impressions':
        valA = gscA?.impressions || 0;
        valB = gscB?.impressions || 0;
        break;
      case 'ctr':
        valA = parseFloat(gscA?.ctr) || 0;
        valB = parseFloat(gscB?.ctr) || 0;
        break;
      case 'status':
        valA = a.status || '';
        valB = b.status || '';
        break;
      default:
        return 0;
    }
    
    if (valA < valB) return sortDir === 'asc' ? -1 : 1;
    if (valA > valB) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      // Default to desc for metrics (higher is better), asc for text
      setSortDir(['position', 'serp'].includes(column) ? 'asc' : ['clicks', 'impressions', 'ctr'].includes(column) ? 'desc' : 'asc');
    }
  };

  const SortIcon = ({ column }) => {
    if (sortBy !== column) return <ArrowUpDown size={12} className={styles.sortIconInactive} />;
    return sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
  };

  // Stats - aggregate from GSC data for the selected date range
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

  const positionTip = (change, currentPos, prevPos) => {
    // Don't show tooltip if we don't have valid comparison data
    if (change == null || prevPos == null || currentPos == null) return undefined;
    const period = getPeriodName();
    if (change === 0) return t('keywordStrategy.tooltips.positionNoChange', { period });
    // prevPos is now already a rounded integer from API
    const curRank = Math.round(parseFloat(currentPos));
    const prevRank = typeof prevPos === 'number' ? prevPos : Math.round(parseFloat(prevPos));
    // Sanity check: if ranks are unreasonable, don't show tooltip
    if (isNaN(curRank) || isNaN(prevRank) || prevRank <= 0 || curRank <= 0) return undefined;
    return change > 0
      ? t('keywordStrategy.tooltips.positionUp', { ranks: Math.abs(change), from: prevRank, to: curRank, period })
      : t('keywordStrategy.tooltips.positionDown', { ranks: Math.abs(change), from: prevRank, to: curRank, period });
  };

  const serpTip = (kw) => {
    if (!kw.serpCheckedAt) return undefined;
    const date = new Date(kw.serpCheckedAt).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', { month: 'short', day: 'numeric' });
    if (!kw.serpPosition) return t('keywordStrategy.serp.notFoundTooltip', { date });
    if (!kw.serpUrl) return t('keywordStrategy.serp.rankTooltipNoUrl', { date });
    // Decode percent-encoded paths (e.g. Hebrew slugs) so the tooltip shows
    // readable text instead of %D7%92%D7%A0...; fall back to raw URL if invalid.
    let displayUrl = kw.serpUrl;
    try {
      displayUrl = decodeURI(kw.serpUrl);
    } catch {
      // Malformed escape sequence — keep the original encoded URL.
    }
    return t('keywordStrategy.serp.rankTooltip', { url: displayUrl, date });
  };

  // A keyword's live rank can only be re-checked once every 24h (the server
  // enforces this too). These drive the per-row button's disabled state and
  // the "next refresh" messaging - no mention of why beyond the 24h window.
  const SERP_COOLDOWN_MS = 24 * 60 * 60 * 1000;
  const serpCooldownMsLeft = (kw) => {
    if (!kw.serpCheckedAt) return 0;
    const left = SERP_COOLDOWN_MS - (Date.now() - new Date(kw.serpCheckedAt).getTime());
    return left > 0 ? left : 0;
  };
  const serpRankTip = (kw) => {
    const left = serpCooldownMsLeft(kw);
    if (left <= 0) return t('keywordStrategy.refreshRow.rank');
    const hours = Math.ceil(left / 3600000);
    return t('keywordStrategy.serp.cooldown', { hours });
  };
  const anyRankEligible = keywords.some((kw) => serpCooldownMsLeft(kw) === 0);

  // Check if positionChange value looks reasonable (actual rank diff should be small, not percentage)
  const isValidRankChange = (change, currentPos) => {
    if (change == null || change === 0) return false; // Don't show badge if no change
    // If change is over 50 and current position is also a small number, 
    // it's likely old cached percentage data, not actual rank difference
    const absChange = Math.abs(change);
    const pos = parseFloat(currentPos);
    // Reasonable: change should be less than current position + 100 (you can't drop more than your rank)
    // And change shouldn't be exactly 100 (old fallback for "no previous data")
    if (change === 100 && pos > 10) return false; // likely old cache fallback
    if (absChange > 100) return false; // percentage values were often > 100
    return true;
  };

  const RankChangeBadge = ({ value, prevPos, currentPos, tooltip }) => {
    if (value == null || value === 0) return null; // No badge if no change
    // Skip display if this looks like old percentage-based cached data
    if (!isValidRankChange(value, currentPos) || prevPos == null) return null;
    const isUp = value > 0;
    const cls = isUp ? styles.changeBadgeUp : styles.changeBadgeDown;
    return (
      <span
        className={`${styles.changeBadge} ${cls} ${tooltip ? styles.hasTooltip : ''}`}
        data-tooltip={tooltip || undefined}
      >
        {isUp ? '↑' : '↓'}{Math.abs(value)}
      </span>
    );
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
        {isZero ? '0% -' : <>{isUp ? '↑' : '↓'}{Math.abs(value)}%</>}
      </span>
    );
  };

  const fmtNum = (n) => {
    if (n == null) return '-';
    return n.toLocaleString();
  };

  if (isSiteLoading || isLoading) {
    return <KeywordsPageSkeleton t={t} />;
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
              <span className={styles.chartDateSeparator}>-</span>
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
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={addingKeyword || !newKeyword.trim()}
              >
                {addingKeyword ? <Loader2 size={14} className={styles.spinner} /> : <Plus size={14} />}
                {t('common.add')}
              </Button>
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
            data-onboarding="keywords-add-cta"
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
          {keywords.length > 0 && (
            <div className={styles.cardHeaderActions}>
              {geoLabel && (
                <span
                  className={`${styles.serpGeoChip} ${styles.hasTooltip}`}
                  data-tooltip={t('keywordStrategy.serp.geoTooltip', { market: geoLabel })}
                >
                  <MapPin size={12} />
                  {geoLabel}
                </span>
              )}
              <button
                className={styles.addKeywordToggle}
                onClick={handleCheckRankings}
                disabled={checkingRanks || !anyRankEligible}
                title={anyRankEligible ? t('keywordStrategy.serp.checkTooltip') : t('keywordStrategy.serp.allFresh')}
              >
                {checkingRanks ? <Loader2 size={14} className={styles.spinner} /> : <MapPin size={14} />}
                {t('keywordStrategy.serp.check')}
              </button>
              <button
                className={styles.addKeywordToggle}
                onClick={handleRefreshVolume}
                disabled={refreshingVolume}
                title={t('keywordStrategy.refreshVolume')}
              >
                {refreshingVolume ? <Loader2 size={14} className={styles.spinner} /> : <BarChart3 size={14} />}
                {t('keywordStrategy.refreshVolume')}
              </button>
            </div>
          )}
        </div>

        {/* Rank check couldn't complete mid-batch - tell the user instead of
            leaving rows silently unchecked. */}
        {serpBillingError && (
          <div className={`${styles.gscNotice} ${styles.gscNoticeError}`}>
            <Info size={14} />
            <span>{t('keywordStrategy.serp.billingError')}</span>
          </div>
        )}

        {/* Google search columns (Position/Clicks/Impressions/CTR) stay empty
            without the Google connection - say so instead of silent dashes */}
        {(gscStatus === 'notConnected' || gscStatus === 'tokenError') && (
          <div className={styles.gscNotice}>
            <Info size={14} />
            <span>
              {gscStatus === 'tokenError'
                ? t('keywordStrategy.gscNotice.tokenError')
                : t('keywordStrategy.gscNotice.notConnected')}
            </span>
            <Link
              href={gscStatus === 'tokenError'
                ? '/dashboard/settings?tab=integrations&reconnect=google'
                : '/dashboard/settings?tab=integrations'}
              className={styles.gscNoticeLink}
            >
              {gscStatus === 'tokenError'
                ? t('keywordStrategy.gscNotice.reconnect')
                : t('keywordStrategy.gscNotice.connect')}
            </Link>
          </div>
        )}

        {filteredKeywords.length === 0 ? (
          <div className={styles.emptyState}>
            <Tag size={24} />
            <p>{t('keywordStrategy.noKeywords')}</p>
            <p className={styles.emptyStateHint}>{t('keywordStrategy.noKeywordsHint')}</p>
            <Link
              href="/dashboard/strategy/site-profile"
              className={styles.startInterviewBtn}
              data-onboarding="keywords-empty-ai-interview"
              onClick={() => window.dispatchEvent(new CustomEvent('ghostpost:onboarding:keywords-interview-started'))}
            >
              <Sparkles size={16} />
              {t('keywordStrategy.startInterview')}
            </Link>
          </div>
        ) : (
          <>
            <div className={styles.tableHeader}>
              <button className={`${styles.sortableHeader} ${sortBy === 'keyword' ? styles.active : ''}`} onClick={() => handleSort('keyword')}>
                <span className={styles.hasTooltip} data-tooltip={t('keywordStrategy.tooltips.keyword')}>{t('keywordStrategy.keyword')}</span>
                <SortIcon column="keyword" />
              </button>
              <button className={`${styles.sortableHeader} ${sortBy === 'position' ? styles.active : ''}`} onClick={() => handleSort('position')}>
                <span className={styles.hasTooltip} data-tooltip={t('keywordStrategy.tooltips.position')}>{t('keywordStrategy.position')}</span>
                <SortIcon column="position" />
              </button>
              <button className={`${styles.sortableHeader} ${sortBy === 'serp' ? styles.active : ''}`} onClick={() => handleSort('serp')}>
                <span className={styles.hasTooltip} data-tooltip={t('keywordStrategy.serp.columnTooltip')}>{t('keywordStrategy.serp.column')}</span>
                <SortIcon column="serp" />
              </button>
              <span className={styles.hasTooltip} data-tooltip={t('keywordStrategy.tooltips.volume')}>{t('keywordStrategy.volume')}</span>
              <button className={`${styles.sortableHeader} ${sortBy === 'clicks' ? styles.active : ''}`} onClick={() => handleSort('clicks')}>
                <span className={styles.hasTooltip} data-tooltip={t('keywordStrategy.tooltips.clicks')}>{t('keywordStrategy.clicks')}</span>
                <SortIcon column="clicks" />
              </button>
              <button className={`${styles.sortableHeader} ${sortBy === 'impressions' ? styles.active : ''}`} onClick={() => handleSort('impressions')}>
                <span className={styles.hasTooltip} data-tooltip={t('keywordStrategy.tooltips.impressions')}>{t('keywordStrategy.impressions')}</span>
                <SortIcon column="impressions" />
              </button>
              <button className={`${styles.sortableHeader} ${sortBy === 'ctr' ? styles.active : ''}`} onClick={() => handleSort('ctr')}>
                <span className={styles.hasTooltip} data-tooltip={t('keywordStrategy.tooltips.ctr')}>{t('keywordStrategy.ctr')}</span>
                <SortIcon column="ctr" />
              </button>
              <span className={styles.hasTooltip} data-tooltip={t('keywordStrategy.tooltips.intent')}>{t('keywordStrategy.intent.label')}</span>
              <span className={styles.hasTooltip} data-tooltip={t('keywordStrategy.tooltips.relatedPost')}>{t('keywordStrategy.columns.relatedPost')}</span>
              <button className={`${styles.sortableHeader} ${sortBy === 'status' ? styles.active : ''}`} onClick={() => handleSort('status')}>
                <span className={styles.hasTooltip} data-tooltip={t('keywordStrategy.tooltips.status')}>{t('keywordStrategy.status')}</span>
                <SortIcon column="status" />
              </button>
              <span></span>
            </div>
            <div className={styles.tableBody}>
              {sortedKeywords.map((kw) => {
                const diffLevel = getDifficultyLevel(kw.difficulty);
                const isUpdating = updatingKeywords.has(kw.id);
                const gsc = getGSCMetrics(kw.keyword);
                const position = gsc?.position ?? kw.position;
                const volume = kw.searchVolume;
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
                        <span className={styles.gscBadge}>{t('keywordStrategy.fromGoogle')}</span>
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
                      ) : (
                        <>
                          {position ? (
                            <>
                              <span className={`${styles.positionBadge} ${styles[getPositionClass(position)]}`}>
                                #{Math.round(position)}
                              </span>
                              {gsc && <RankChangeBadge
                                value={gsc.positionChange}
                                prevPos={gsc.prevPosition}
                                currentPos={gsc.position}
                                tooltip={positionTip(gsc.positionChange, gsc.position, gsc.prevPosition)}
                              />}
                            </>
                          ) : (
                            <span className={styles.noData}>-</span>
                          )}
                          <button
                            type="button"
                            className={styles.cellRefreshBtn}
                            onClick={() => refreshRowGsc(kw)}
                            disabled={rowBusy.has(`${kw.id}:gsc`)}
                            title={t('keywordStrategy.refreshRow.gsc')}
                          >
                            {rowBusy.has(`${kw.id}:gsc`) ? <Loader2 size={11} className={styles.spinner} /> : <RefreshCw size={11} />}
                          </button>
                        </>
                      )}
                    </div>
                    {/* Live Google rank for this site's domain */}
                    <div className={`${styles.cell} ${styles.positionCell}`}>
                      {checkingRanks ? (
                        <Skeleton width="2.5rem" height="1.5rem" borderRadius="full" />
                      ) : (
                        <>
                          {kw.serpCheckedAt ? (
                            kw.serpPosition ? (
                              <span
                                className={`${styles.positionBadge} ${styles[getPositionClass(kw.serpPosition)]} ${styles.hasTooltip}`}
                                data-tooltip={serpTip(kw)}
                              >
                                #{kw.serpPosition}
                              </span>
                            ) : (
                              <span
                                className={`${styles.positionBadge} ${styles.below20} ${styles.hasTooltip}`}
                                data-tooltip={serpTip(kw)}
                              >
                                {t('keywordStrategy.serp.notFound')}
                              </span>
                            )
                          ) : (
                            <span className={styles.noData}>-</span>
                          )}
                          <button
                            type="button"
                            className={styles.cellRefreshBtn}
                            onClick={() => refreshRowRank(kw)}
                            disabled={rowBusy.has(`${kw.id}:rank`) || serpCooldownMsLeft(kw) > 0}
                            title={serpRankTip(kw)}
                          >
                            {rowBusy.has(`${kw.id}:rank`) ? <Loader2 size={11} className={styles.spinner} /> : <RefreshCw size={11} />}
                          </button>
                        </>
                      )}
                    </div>
                    <div className={`${styles.cell} ${styles.volumeCell}`}>
                      {gscLoading ? <Skeleton width="3rem" height="0.875rem" borderRadius="sm" /> : (
                        <>
                          {volume ? fmtNum(volume) : '-'}
                          <button
                            type="button"
                            className={styles.cellRefreshBtn}
                            onClick={() => refreshRowVolume(kw)}
                            disabled={rowBusy.has(`${kw.id}:vol`)}
                            title={t('keywordStrategy.refreshRow.volume')}
                          >
                            {rowBusy.has(`${kw.id}:vol`) ? <Loader2 size={11} className={styles.spinner} /> : <RefreshCw size={11} />}
                          </button>
                        </>
                      )}
                    </div>
                    <div className={`${styles.cell} ${styles.gscMetricCell}`}>
                      {gscLoading ? (
                        <Skeleton width="2.5rem" height="0.875rem" borderRadius="sm" />
                      ) : (
                        <>
                          {gsc ? fmtNum(gsc.clicks) : '-'}
                          {gsc && <ChangeBadge value={gsc.clicksChange} tooltip={changeTip(gsc.clicksChange, fmtNum(gsc.clicks), t('keywordStrategy.clicks'))} />}
                        </>
                      )}
                    </div>
                    <div className={`${styles.cell} ${styles.gscMetricCell}`}>
                      {gscLoading ? (
                        <Skeleton width="3rem" height="0.875rem" borderRadius="sm" />
                      ) : (
                        <>
                          {gsc ? fmtNum(gsc.impressions) : '-'}
                          {gsc && <ChangeBadge value={gsc.impressionsChange} tooltip={changeTip(gsc.impressionsChange, fmtNum(gsc.impressions), t('keywordStrategy.impressions'))} />}
                        </>
                      )}
                    </div>
                    <div className={`${styles.cell} ${styles.gscMetricCell}`}>
                      {gscLoading ? (
                        <Skeleton width="2rem" height="0.875rem" borderRadius="sm" />
                      ) : (
                        <>
                          {gsc ? `${gsc.ctr}%` : '-'}
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
                          <span className={styles.noPermission}>-</span>
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
                    {/* Related Post / Entity Column.
                        A keyword is considered to have a pillar page as soon as
                        `kw.url` is set - whether or not we managed to resolve
                        that URL back to a populated site entity. When a pillar
                        exists, don't offer "Generate with AI" (redundant) -
                        only the navigation + unlink actions. */}
                    {(() => {
                      const hasPillar = !!kw.url;
                      const matched = kw.relatedPost;
                      return (
                        <div className={`${styles.cell} ${styles.relatedPostCell}`}>
                          {hasPillar ? (
                            <div className={styles.relatedPostLinks}>
                              {matched && (
                                <Link
                                  href={`/dashboard/entities/${matched.entityTypeSlug || 'posts'}/${matched.id}`}
                                  className={styles.relatedPostLink}
                                  title={matched.title}
                                >
                                  <FileText size={12} />
                                </Link>
                              )}
                              {(matched?.url || kw.url) && (
                                <a
                                  href={matched?.url || kw.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={styles.externalLink}
                                  title={decodeDisplayUrl(matched?.url || kw.url)}
                                >
                                  <ExternalLink size={12} />
                                </a>
                              )}
                              {canEditKeywords && (
                                <button
                                  type="button"
                                  className={styles.addPostBtn}
                                  onClick={() => handleUnlinkEntity(kw.id)}
                                  disabled={unlinkingKeywordId === kw.id}
                                  title={t('keywordStrategy.unlinkExisting')}
                                >
                                  {unlinkingKeywordId === kw.id
                                    ? <Loader2 size={12} className={styles.spinner} />
                                    : <Link2Off size={12} />}
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className={styles.relatedPostLinks}>
                              {canEditKeywords && (
                                <button
                                  type="button"
                                  className={styles.addPostBtn}
                                  onClick={() => setLinkEntityKeyword(kw)}
                                  title={t('keywordStrategy.linkExisting')}
                                >
                                  <Link2 size={12} />
                                </button>
                              )}
                              <button
                                className={styles.addPostBtn}
                                onClick={() => setGeneratePostKeyword(kw)}
                                title={t('keywordStrategy.generatePost')}
                              >
                                <Wand2 size={12} />
                                <Plus size={10} />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })()}
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

      {/* Link to an existing SiteEntity (page, post, category, custom types) */}
      <LinkEntityModal
        isOpen={!!linkEntityKeyword}
        onClose={() => setLinkEntityKeyword(null)}
        siteId={selectedSite?.id}
        keyword={linkEntityKeyword}
        onLinked={handleEntityLinked}
      />
    </>
  );
}
