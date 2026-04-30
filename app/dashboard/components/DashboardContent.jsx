'use client';

import { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { 
  Activity, BarChart2, Search, Settings, ExternalLink, Plus, Check, Loader2,
  X, ChevronLeft, ChevronRight, Wand2, FileText, Globe,
} from 'lucide-react';
import GeneratePostModal from '../strategy/keywords/components/GeneratePostModal';
import { useSite } from '@/app/context/site-context';
import { useLocale } from '@/app/context/locale-context';
import { useTheme } from '@/app/context/theme-context';
import { StatsCard, DashboardCard, QuickActions, ProgressBar, KpiSlider, Skeleton } from '../components';
import AgentActivity from './AgentActivity';
import { ArrowIcon } from '@/app/components/ui/arrow-icon';
import { useModalResize, ModalResizeButton } from '@/app/components/ui/ModalResizeButton';
import { decodeDisplayUrl } from '@/lib/urlDisplay';
import styles from '../page.module.css';

export default function DashboardContent({ translations }) {
  const t = translations;
  const { selectedSite } = useSite();
  const { locale } = useLocale();
  const { theme } = useTheme();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  // Traffic chart date range
  const fmtDate = (d) => d.toISOString().split('T')[0];

  const getDateRange = (preset) => {
    const end = new Date();
    const start = new Date();
    switch (preset) {
      case 'today':
        return { start: fmtDate(end), end: fmtDate(end) };
      case 'yesterday':
        start.setDate(start.getDate() - 1);
        return { start: fmtDate(start), end: fmtDate(start) };
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

  // GSC data has a 2–3 day reporting delay - offset end date so we only
  // query finalised data. Start date is relative to the offset end so the
  // window is the full requested duration of complete data.
  const GSC_DELAY_DAYS = 3;
  const getGscDateRange = (preset) => {
    const end = new Date();
    end.setDate(end.getDate() - GSC_DELAY_DAYS);
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

  /**
   * Compute the previous comparison period for a given date range.
   * - Presets: same duration immediately before (e.g. 7d → previous 7 days)
   * - Custom: same dates one year ago
   */
  const getPreviousPeriod = (startStr, endStr, preset) => {
    const s = new Date(startStr + 'T00:00:00');
    const e = new Date(endStr + 'T00:00:00');
    if (preset === 'custom') {
      // Same dates one year ago
      const ps = new Date(s);
      ps.setFullYear(ps.getFullYear() - 1);
      const pe = new Date(e);
      pe.setFullYear(pe.getFullYear() - 1);
      return { start: fmtDate(ps), end: fmtDate(pe) };
    }
    // Same duration right before the current period
    const diffMs = e.getTime() - s.getTime();
    const pe = new Date(s);
    pe.setDate(pe.getDate() - 1);
    const ps = new Date(pe.getTime() - diffMs);
    return { start: fmtDate(ps), end: fmtDate(pe) };
  };

  const [chartPreset, setChartPreset] = useState('7d');
  const defaultRange = getDateRange('7d');
  const [chartStartDate, setChartStartDate] = useState(defaultRange.start);
  const [chartEndDate, setChartEndDate] = useState(defaultRange.end);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartData, setChartData] = useState(null); // null = use data.trafficChart
  const [chartComparison, setChartComparison] = useState(null); // { visitors, visitorsChange, ... }
  const [chartAnimatedData, setChartAnimatedData] = useState(null); // Animated dummy data for loading state
  const [chartVisibleMetrics, setChartVisibleMetrics] = useState({
    visitors: true,
    pageViews: true,
    sessions: false, // hidden by default
    newUsers: false, // hidden by default
    engagedSessions: false, // hidden by default
  });

  // GA KPIs date range
  const [gaPreset, setGaPreset] = useState('30d');
  const gaDefault = getDateRange('30d');
  const [gaStartDate, setGaStartDate] = useState(gaDefault.start);
  const [gaEndDate, setGaEndDate] = useState(gaDefault.end);
  const [gaLoading, setGaLoading] = useState(false);
  const [gaData, setGaData] = useState(null);

  // GSC KPIs date range
  const [gscPreset, setGscPreset] = useState('30d');
  const gscDefault = getGscDateRange('30d');
  const [gscStartDate, setGscStartDate] = useState(gscDefault.start);
  const [gscEndDate, setGscEndDate] = useState(gscDefault.end);
  const [gscLoading, setGscLoading] = useState(false);
  const [gscData, setGscData] = useState(null);

  // Top Keywords date range
  const [keywordsPreset, setKeywordsPreset] = useState('30d');
  const keywordsDefault = getGscDateRange('30d');
  const [keywordsStartDate, setKeywordsStartDate] = useState(keywordsDefault.start);
  const [keywordsEndDate, setKeywordsEndDate] = useState(keywordsDefault.end);
  const [keywordsLoading, setKeywordsLoading] = useState(false);
  const [keywordsData, setKeywordsData] = useState(null);

  // Top Pages date range
  const [pagesPreset, setPagesPreset] = useState('30d');
  const pagesDefault = getGscDateRange('30d');
  const [pagesStartDate, setPagesStartDate] = useState(pagesDefault.start);
  const [pagesEndDate, setPagesEndDate] = useState(pagesDefault.end);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [pagesData, setPagesData] = useState(null);

  // Agent insights state (for section ordering)
  const [hasAgentInsights, setHasAgentInsights] = useState(false);

  // AI Traffic date range
  const [aiPreset, setAiPreset] = useState('30d');
  const aiDefault = getDateRange('30d');
  const [aiStartDate, setAiStartDate] = useState(aiDefault.start);
  const [aiEndDate, setAiEndDate] = useState(aiDefault.end);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiData, setAiData] = useState(null);

  // Tracked keywords map (lowercase key → keyword object) for "add to keywords" + post column
  const [trackedKeywords, setTrackedKeywords] = useState(new Map());
  const [addingKeyword, setAddingKeyword] = useState(new Set()); // queries being added
  const [showAllKeywords, setShowAllKeywords] = useState(false);
  const [generatePostKeyword, setGeneratePostKeyword] = useState(null);
  const [aiPostLoading, setAiPostLoading] = useState(null); // query being processed for AI post
  const [aiKeywords, setAiKeywords] = useState([]);
  // const [inferredQueries, setInferredQueries] = useState([]);
  // const [inferredLoading, setInferredLoading] = useState(false);

  useEffect(() => {
    if (!selectedSite?.id) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      setChartData(null);
      try {
        const res = await fetch(`/api/dashboard/stats?siteId=${selectedSite.id}&startDate=${chartStartDate}&endDate=${chartEndDate}`);
        if (!res.ok) throw new Error('Failed to fetch');
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error('Dashboard fetch error:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    // Fetch tracked keywords to know which are already added
    const fetchTrackedKeywords = async () => {
      try {
        const res = await fetch(`/api/keywords?siteId=${selectedSite.id}`);
        if (res.ok) {
          const json = await res.json();
          const map = new Map();
          for (const kw of (json.keywords || [])) {
            map.set(kw.keyword.toLowerCase().trim(), kw);
          }
          setTrackedKeywords(map);
        }
      } catch { /* silent */ }
    };

    fetchData();
    fetchTrackedKeywords();
  }, [selectedSite?.id]);

  // Refetch only the traffic chart when dates change
  const fetchTrafficChart = async () => {
    if (!selectedSite?.id || !data?.gaConnected) return;
    setChartLoading(true);
    try {
      const prev = getPreviousPeriod(chartStartDate, chartEndDate, chartPreset);
      const res = await fetch(
        `/api/dashboard/stats/traffic-chart?siteId=${selectedSite.id}&startDate=${chartStartDate}&endDate=${chartEndDate}&compareStartDate=${prev.start}&compareEndDate=${prev.end}`
      );
      if (!res.ok) throw new Error('Failed to fetch chart');
      const json = await res.json();
      setChartData(json.trafficChart || []);
      setChartComparison(json.comparison || null);
    } catch (err) {
      console.error('Traffic chart fetch error:', err);
    } finally {
      setChartLoading(false);
    }
  };

  const handlePresetChange = (e) => {
    const value = e.target.value;
    setChartPreset(value);
    if (value !== 'custom') {
      const range = getDateRange(value);
      if (range) {
        setChartStartDate(range.start);
        setChartEndDate(range.end);
      }
    }
  };

  useEffect(() => {
    if (data?.gaConnected && selectedSite?.id) {
      fetchTrafficChart();
    }
  }, [chartStartDate, chartEndDate, data?.gaConnected, selectedSite?.id]);

  // ─── Animated chart data while loading (equalizer effect) ───
  const [isTransitioning, setIsTransitioning] = useState(false);
  const prevAnimatedDataRef = useRef(null);
  
  useEffect(() => {
    if (!chartLoading) {
      // When loading ends, start transition phase
      if (chartAnimatedData) {
        prevAnimatedDataRef.current = chartAnimatedData;
        setIsTransitioning(true);
      }
      // Delay clearing animated data to allow CSS transition
      const timeout = setTimeout(() => {
        setChartAnimatedData(null);
        setIsTransitioning(false);
        prevAnimatedDataRef.current = null;
      }, 1100);
      return () => clearTimeout(timeout);
    }
    
    // Calculate number of days in the selected range
    const start = new Date(chartStartDate);
    const end = new Date(chartEndDate);
    const dayCount = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1);
    
    // Generate smooth wave animation - gentle rolling curves like a breathing pulse
    let tick = 0;
    const generateAnimatedData = () => {
      const points = [];
      for (let i = 0; i < dayCount; i++) {
        const date = new Date(start);
        date.setDate(date.getDate() + i);
        // Smooth wave: position along x-axis + time shift
        const t = (i / Math.max(dayCount - 1, 1)) * Math.PI * 2;
        const wave = (offset) => 5 + 2 * Math.sin(t + tick * 0.8 + offset);
        points.push({
          date: date.toISOString().split('T')[0],
          visitors:        parseFloat(wave(0).toFixed(1)),
          pageViews:       parseFloat(wave(Math.PI).toFixed(1)),
          sessions:        parseFloat(wave(0).toFixed(1)),
          newUsers:        parseFloat(wave(Math.PI).toFixed(1)),
          engagedSessions: parseFloat(wave(0).toFixed(1)),
        });
      }
      tick++;
      return points;
    };
    
    // Initial data
    setChartAnimatedData(generateAnimatedData());
    setIsTransitioning(false);
    
    // Update every 200ms for fast smooth animation
    const interval = setInterval(() => {
      setChartAnimatedData(generateAnimatedData());
    }, 200);
    
    return () => clearInterval(interval);
  }, [chartLoading, chartStartDate, chartEndDate]);

  // ─── Generic preset handler factory ───
  const makePresetHandler = (setPreset, setStart, setEnd, rangeFn = getDateRange) => (e) => {
    const value = e.target.value;
    setPreset(value);
    if (value !== 'custom') {
      const range = rangeFn(value);
      if (range) {
        setStart(range.start);
        setEnd(range.end);
      }
    }
  };

  // ─── GA KPIs refetch ───
  const fetchGaKpis = async () => {
    if (!selectedSite?.id || !data?.gaConnected) return;
    setGaLoading(true);
    try {
      const prev = getPreviousPeriod(gaStartDate, gaEndDate, gaPreset);
      const res = await fetch(
        `/api/dashboard/stats/ga-kpis?siteId=${selectedSite.id}&startDate=${gaStartDate}&endDate=${gaEndDate}&compareStartDate=${prev.start}&compareEndDate=${prev.end}`
      );
      if (!res.ok) throw new Error('Failed to fetch GA KPIs');
      const json = await res.json();
      setGaData(json.ga);
    } catch (err) {
      console.error('GA KPIs fetch error:', err);
    } finally {
      setGaLoading(false);
    }
  };

  useEffect(() => {
    if (data?.gaConnected && selectedSite?.id) {
      fetchGaKpis();
    }
  }, [gaStartDate, gaEndDate, data?.gaConnected, selectedSite?.id]);

  // ─── GSC KPIs refetch ───
  const fetchGscKpis = async () => {
    if (!selectedSite?.id || !data?.gscConnected) return;
    setGscLoading(true);
    try {
      const prev = getPreviousPeriod(gscStartDate, gscEndDate, gscPreset);
      const res = await fetch(
        `/api/dashboard/stats/gsc?siteId=${selectedSite.id}&section=kpis&startDate=${gscStartDate}&endDate=${gscEndDate}&compareStartDate=${prev.start}&compareEndDate=${prev.end}`
      );
      if (!res.ok) throw new Error('Failed to fetch GSC KPIs');
      const json = await res.json();
      if (json.tokenError) setData(prev => prev ? { ...prev, tokenError: true } : prev);
      setGscData(json.gsc);
    } catch (err) {
      console.error('GSC KPIs fetch error:', err);
    } finally {
      setGscLoading(false);
    }
  };

  useEffect(() => {
    if (data?.gscConnected && selectedSite?.id) {
      fetchGscKpis();
    }
  }, [gscStartDate, gscEndDate, data?.gscConnected, selectedSite?.id]);

  // ─── Top Keywords refetch ───
  const fetchKeywords = async () => {
    if (!selectedSite?.id || !data?.gscConnected) return;
    setKeywordsLoading(true);
    try {
      const prev = getPreviousPeriod(keywordsStartDate, keywordsEndDate, keywordsPreset);
      const res = await fetch(
        `/api/dashboard/stats/gsc?siteId=${selectedSite.id}&section=topKeywords&startDate=${keywordsStartDate}&endDate=${keywordsEndDate}&compareStartDate=${prev.start}&compareEndDate=${prev.end}`
      );
      if (!res.ok) throw new Error('Failed to fetch keywords');
      const json = await res.json();
      if (json.tokenError) setData(prev => prev ? { ...prev, tokenError: true } : prev);
      setKeywordsData(json.topQueries || []);
    } catch (err) {
      console.error('Keywords fetch error:', err);
    } finally {
      setKeywordsLoading(false);
    }
  };

  useEffect(() => {
    if (data?.gscConnected && selectedSite?.id) {
      fetchKeywords();
    }
  }, [keywordsStartDate, keywordsEndDate, data?.gscConnected, selectedSite?.id]);

  // ─── Top Pages refetch ───
  const fetchTopPages = async () => {
    if (!selectedSite?.id || !data?.gscConnected) return;
    setPagesLoading(true);
    try {
      const prev = getPreviousPeriod(pagesStartDate, pagesEndDate, pagesPreset);
      const res = await fetch(
        `/api/dashboard/stats/gsc?siteId=${selectedSite.id}&section=topPages&startDate=${pagesStartDate}&endDate=${pagesEndDate}&compareStartDate=${prev.start}&compareEndDate=${prev.end}`
      );
      if (!res.ok) throw new Error('Failed to fetch top pages');
      const json = await res.json();
      if (json.tokenError) setData(prev => prev ? { ...prev, tokenError: true } : prev);
      setPagesData(json.topPages || []);
    } catch (err) {
      console.error('Top pages fetch error:', err);
    } finally {
      setPagesLoading(false);
    }
  };

  useEffect(() => {
    if (data?.gscConnected && selectedSite?.id) {
      fetchTopPages();
    }
  }, [pagesStartDate, pagesEndDate, data?.gscConnected, selectedSite?.id]);

  // ─── AI Traffic fetch ───
  const fetchAiTraffic = async () => {
    if (!selectedSite?.id || !data?.gaConnected) return;
    setAiLoading(true);
    try {
      const prev = getPreviousPeriod(aiStartDate, aiEndDate, aiPreset);
      const res = await fetch(
        `/api/dashboard/stats/ai-traffic?siteId=${selectedSite.id}&startDate=${aiStartDate}&endDate=${aiEndDate}&compareStartDate=${prev.start}&compareEndDate=${prev.end}`
      );
      const json = await res.json();
      setAiData(json.aiTraffic || null);
      setAiKeywords(Array.isArray(json.aiKeywords) ? json.aiKeywords : []);

      // // Trigger inferred queries if we have landing pages
      // if (json.aiTraffic?.topLandingPages?.length) {
      //   fetchInferredQueries(json.aiTraffic.topLandingPages);
      // } else {
      //   setInferredQueries([]);
      // }
    } catch (err) {
      console.error('AI traffic fetch error:', err);
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    if (data?.gaConnected && selectedSite?.id) {
      fetchAiTraffic();
    }
  }, [aiStartDate, aiEndDate, data?.gaConnected, selectedSite?.id]);

  // // ─── Inferred AI Queries fetch ───
  // const fetchInferredQueries = async (topLandingPages) => {
  //   if (!selectedSite?.id || !topLandingPages?.length) return;
  //   setInferredLoading(true);
  //   try {
  //     const res = await fetch('/api/dashboard/stats/ai-inferred-queries', {
  //       method: 'POST',
  //       headers: { 'Content-Type': 'application/json' },
  //       body: JSON.stringify({ siteId: selectedSite.id, topLandingPages }),
  //     });
  //     const json = await res.json();
  //     setInferredQueries(json.inferredQueries || []);
  //   } catch (err) {
  //     console.error('Inferred queries fetch error:', err);
  //     setInferredQueries([]);
  //   } finally {
  //     setInferredLoading(false);
  //   }
  // };

  // ─── Reusable DateRangeSelect component ───
  const DateRangeSelect = ({ preset, onPresetChange, startDate, endDate, onStartChange, onEndChange, loading }) => (
    <div className={styles.chartDateInputs}>
      <select
        className={styles.chartDateSelect}
        value={preset}
        onChange={onPresetChange}
        disabled={loading}
      >
        <option value="today">{t.dateToday || 'Today'}</option>
        <option value="yesterday">{t.dateYesterday || 'Yesterday'}</option>
        <option value="7d">{t.dateLast7 || 'Last 7 days'}</option>
        <option value="30d">{t.dateLast30 || 'Last month'}</option>
        <option value="90d">{t.dateLast90 || 'Last 3 months'}</option>
        <option value="180d">{t.dateLast180 || 'Last 6 months'}</option>
        <option value="365d">{t.dateLast365 || 'Last year'}</option>
        <option value="custom">{t.dateCustom || 'Custom'}</option>
      </select>
      {preset === 'custom' && (
        <>
          <label className={styles.chartDateLabel}>
            <span className={styles.chartDateLabelText}>{t.dateFrom || 'From'}</span>
            <input
              type="date"
              className={styles.chartDateInput}
              value={startDate}
              onChange={(e) => onStartChange(e.target.value)}
              max={endDate}
            />
          </label>
          <span className={styles.chartDateSeparator}>-</span>
          <label className={styles.chartDateLabel}>
            <span className={styles.chartDateLabelText}>{t.dateTo || 'To'}</span>
            <input
              type="date"
              className={styles.chartDateInput}
              value={endDate}
              onChange={(e) => onEndChange(e.target.value)}
              min={startDate}
              max={fmtDate(new Date())}
            />
          </label>
        </>
      )}
    </div>
  );

  // Build a user-facing label describing the comparison period
  // Template interpolation: tpl('hello {name}', { name: 'world' }) → 'hello world'
  const tpl = (template, vars) => {
    if (!template) return '';
    return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
  };

  // Get just the period name (without 'vs' prefix) for tooltip sentences
  const getPeriodName = (startStr, endStr, preset) => {
    const names = {
      today: t.vsPrevDay?.replace(/^(vs |מול )/, '') || 'the previous day',
      yesterday: t.vsPrevDay?.replace(/^(vs |מול )/, '') || 'the previous day',
      '7d': t.vsPrev7?.replace(/^(vs |מול )/, '') || 'the previous 7 days',
      '30d': t.vsPrev30?.replace(/^(vs |מול )/, '') || 'the previous 30 days',
      '90d': t.vsPrev90?.replace(/^(vs |מול )/, '') || 'the previous 90 days',
      '180d': t.vsPrev180?.replace(/^(vs |מול )/, '') || 'the previous 180 days',
      '365d': t.vsPrev365?.replace(/^(vs |מול )/, '') || 'the previous year',
    };
    if (preset !== 'custom') return names[preset] || '';
    const s = new Date(startStr + 'T00:00:00');
    const e = new Date(endStr + 'T00:00:00');
    s.setFullYear(s.getFullYear() - 1);
    e.setFullYear(e.getFullYear() - 1);
    const fmt = (d) => d.toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${fmt(s)} – ${fmt(e)}`;
  };

  const getComparisonLabel = (startStr, endStr, preset) => {
    const presetLabels = {
      today: t.vsPrevDay || 'vs previous day',
      yesterday: t.vsPrevDay || 'vs previous day',
      '7d': t.vsPrev7 || 'vs previous 7 days',
      '30d': t.vsPrev30 || 'vs previous 30 days',
      '90d': t.vsPrev90 || 'vs previous 90 days',
      '180d': t.vsPrev180 || 'vs previous 180 days',
      '365d': t.vsPrev365 || 'vs previous year',
    };
    if (preset !== 'custom') return presetLabels[preset] || '';
    // Custom → "vs <start> – <end> (prev year)"
    const s = new Date(startStr + 'T00:00:00');
    const e = new Date(endStr + 'T00:00:00');
    s.setFullYear(s.getFullYear() - 1);
    e.setFullYear(e.getFullYear() - 1);
    const fmt = (d) => d.toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${t.vsPrefix || 'vs'} ${fmt(s)} – ${fmt(e)}`;
  };

  // Format number with locale separator
  const fmtNum = (n) => {
    if (n == null) return '-';
    return Number(n).toLocaleString();
  };

  // Format a duration in seconds as a compact "Xm Ys" / "Ys" label.
  // GA4 averageSessionDuration is returned in seconds (float).
  const fmtDuration = (seconds) => {
    const s = Math.round(Number(seconds) || 0);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r ? `${m}m ${r}s` : `${m}m`;
  };

  const trendOf = (change) => {
    if (change == null) return { trend: null, trendValue: null };
    if (change === 0) return { trend: 'neutral', trendValue: '0%' };
    const sign = change > 0 ? '+' : '';
    return {
      trend: change > 0 ? 'up' : 'down',
      trendValue: `${sign}${change}%`,
    };
  };

  // Inline change badge for tables
  const ChangeBadge = ({ value, tooltip }) => {
    if (value == null) return null;
    const isZero = value === 0;
    const isUp = value > 0;
    const badgeClass = isZero ? styles.changeBadgeNeutral : isUp ? styles.changeBadgeUp : styles.changeBadgeDown;
    return (
      <span
        className={`${styles.changeBadge} ${badgeClass} ${tooltip ? styles.hasTooltip : ''}`}
        data-tooltip={tooltip || undefined}
      >
        {isZero ? '0% -' : <>{isUp ? '↑' : '↓'}{Math.abs(value)}%</>}
      </span>
    );
  };

  // Active comparison data (from chart refetch or initial load)
  const activeComparison = chartComparison ?? data?.trafficComparison;
  const chartPeriod = getPeriodName(chartStartDate, chartEndDate, chartPreset);

  // GA KPI cards - use section-specific data if available
  const activeGa = gaData ?? data?.ga;
  const gaCompareLabel = getComparisonLabel(gaStartDate, gaEndDate, gaPreset);
  const gaPeriod = getPeriodName(gaStartDate, gaEndDate, gaPreset);
  const cardTip = (label, change, period) => {
    if (change == null) return undefined;
    if (change === 0) return tpl(t.tipCardNoChange || '{label} - no change compared to {period}', { label, period });
    const tmpl = change > 0
      ? (t.tipCardUp || '{label} is up {percent}% compared to {period}')
      : (t.tipCardDown || '{label} is down {percent}% compared to {period}');
    return tpl(tmpl, { label, percent: Math.abs(change), period });
  };

  // Inline change tooltip helper (for ChangeBadge in tables/chart)
  const changeTip = (change, { value, metric, period } = {}) => {
    if (change == null) return undefined;
    if (change === 0) return tpl(t.tipNoChange || '{value} {metric} - no change from {period}', { value, metric, period });
    const tmpl = change > 0
      ? (t.tipMoreFromPrev || '{value} {metric} - {percent}% more than {period}')
      : (t.tipLessFromPrev || '{value} {metric} - {percent}% less than {period}');
    return tpl(tmpl, { value, metric, percent: Math.abs(change), period });
  };

  const positionTip = (change, period) => {
    if (change == null) return undefined;
    if (change === 0) return tpl(t.tipPositionNoChange || 'Position unchanged from {period}', { period });
    const tmpl = change > 0
      ? (t.tipPositionUp || 'Position improved by {percent}% {period}')
      : (t.tipPositionDown || 'Position dropped by {percent}% {period}');
    return tpl(tmpl, { percent: Math.abs(change), period });
  };

  // Google Analytics SVG Icon (official)
  const GAIcon = () => (
    <svg width="24" height="24" viewBox="0 0 192 192" fill="none">
      <path fill="#F9AB00" d="M130,29v132c0,14.77,10.19,23,21,23c10,0,21-7,21-23V30c0-13.54-10-22-21-22S130,17.33,130,29z"/>
      <path fill="#E37400" d="M75,96v65c0,14.77,10.19,23,21,23c10,0,21-7,21-23V97c0-13.54-10-22-21-22S75,84.33,75,96z"/>
      <circle fill="#E37400" cx="41" cy="163" r="21"/>
    </svg>
  );

  // Google Search Console SVG Icon (official)
  const GSCIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="15" y="1.5" width="7" height="19" rx="3.5" fill="#4285F4"/>
      <rect x="8.5" y="5" width="7" height="15" rx="3.5" fill="#34A853"/>
      <circle cx="9" cy="17" r="2.5" fill="#EA4335"/>
      <circle cx="5.5" cy="15.5" r="4.5" fill="#FBBC04"/>
      <line x1="2.5" y1="19" x2="0.5" y2="22.5" stroke="#FBBC04" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );

  // AI Traffic SVG Icon (sparkle/robot)
  const AIIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z" fill="#8b5cf6" fillOpacity="0.85"/>
      <path d="M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z" stroke="#8b5cf6" strokeWidth="0.5"/>
    </svg>
  );

  const gaCards = activeGa ? [
    {
      iconName: 'Users',
      value: fmtNum(activeGa.visitors),
      label: t.organicVisitors,
      ...trendOf(activeGa.visitorsChange),
      trendLabel: gaCompareLabel,
      trendTooltip: cardTip(t.organicVisitors, activeGa.visitorsChange, gaPeriod),
      badge: <GAIcon />,
      badgeTooltip: t.dataFromGA,
      description: t.kpiDescriptions?.organicVisitors,
      fullDescription: t.kpiFullDescriptions?.organicVisitors,
      gotItLabel: t.kpiFullDescriptions?.gotIt,
      color: 'purple',
    },
    {
      iconName: 'FileText',
      value: fmtNum(activeGa.pageViews),
      label: t.totalPageViews,
      ...trendOf(activeGa.pageViewsChange),
      trendLabel: gaCompareLabel,
      trendTooltip: cardTip(t.totalPageViews, activeGa.pageViewsChange, gaPeriod),
      badge: <GAIcon />,
      badgeTooltip: t.dataFromGA,
      description: t.kpiDescriptions?.totalPageViews,
      fullDescription: t.kpiFullDescriptions?.totalPageViews,
      gotItLabel: t.kpiFullDescriptions?.gotIt,
      color: 'blue',
    },
    {
      iconName: 'Clock',
      value: activeGa.avgSessionDuration || '-',
      label: t.avgSessionDuration,
      ...trendOf(activeGa.avgSessionDurationChange),
      trendLabel: gaCompareLabel,
      trendTooltip: cardTip(t.avgSessionDuration, activeGa.avgSessionDurationChange, gaPeriod),
      badge: <GAIcon />,
      badgeTooltip: t.dataFromGA,
      description: t.kpiDescriptions?.avgSessionDuration,
      fullDescription: t.kpiFullDescriptions?.avgSessionDuration,
      gotItLabel: t.kpiFullDescriptions?.gotIt,
      color: 'orange',
    },
    {
      iconName: 'BarChart2',
      value: fmtNum(activeGa.sessions),
      label: t.sessions,
      ...trendOf(activeGa.sessionsChange),
      trendLabel: gaCompareLabel,
      trendTooltip: cardTip(t.sessions, activeGa.sessionsChange, gaPeriod),
      badge: <GAIcon />,
      badgeTooltip: t.dataFromGA,
      description: t.kpiDescriptions?.sessions,
      fullDescription: t.kpiFullDescriptions?.sessions,
      gotItLabel: t.kpiFullDescriptions?.gotIt,
      color: 'green',
    },
  ] : null;

  // GSC KPI cards - use section-specific data if available
  const activeGsc = gscData ?? data?.gsc;
  const gscCompareLabel = getComparisonLabel(gscStartDate, gscEndDate, gscPreset);
  const gscPeriod = getPeriodName(gscStartDate, gscEndDate, gscPreset);
  const gscCards = activeGsc ? [
    {
      iconName: 'MousePointer',
      value: fmtNum(activeGsc.clicks),
      label: t.totalClicks,
      ...trendOf(activeGsc.clicksChange),
      trendLabel: gscCompareLabel,
      trendTooltip: cardTip(t.totalClicks, activeGsc.clicksChange, gscPeriod),
      badge: <GSCIcon />,
      badgeTooltip: t.dataFromGSC,
      description: t.kpiDescriptions?.totalClicks,
      fullDescription: t.kpiFullDescriptions?.totalClicks,
      gotItLabel: t.kpiFullDescriptions?.gotIt,
      color: 'purple',
    },
    {
      iconName: 'Eye',
      value: fmtNum(activeGsc.impressions),
      label: t.totalImpressions,
      ...trendOf(activeGsc.impressionsChange),
      trendLabel: gscCompareLabel,
      trendTooltip: cardTip(t.totalImpressions, activeGsc.impressionsChange, gscPeriod),
      badge: <GSCIcon />,
      badgeTooltip: t.dataFromGSC,
      description: t.kpiDescriptions?.totalImpressions,
      fullDescription: t.kpiFullDescriptions?.totalImpressions,
      gotItLabel: t.kpiFullDescriptions?.gotIt,
      color: 'blue',
    },
    {
      iconName: 'Target',
      value: `${activeGsc.ctr}%`,
      label: t.avgCtr,
      ...trendOf(activeGsc.ctrChange),
      trendLabel: gscCompareLabel,
      trendTooltip: cardTip(t.avgCtr, activeGsc.ctrChange, gscPeriod),
      badge: <GSCIcon />,
      badgeTooltip: t.dataFromGSC,
      description: t.kpiDescriptions?.avgCtr,
      fullDescription: t.kpiFullDescriptions?.avgCtr,
      gotItLabel: t.kpiFullDescriptions?.gotIt,
      color: 'orange',
    },
    {
      iconName: 'TrendingUp',
      value: activeGsc.position,
      label: t.avgPosition,
      ...trendOf(activeGsc.positionChange),
      trendLabel: gscCompareLabel,
      trendTooltip: cardTip(t.avgPosition, activeGsc.positionChange, gscPeriod),
      badge: <GSCIcon />,
      badgeTooltip: t.dataFromGSC,
      description: t.kpiDescriptions?.avgPosition,
      fullDescription: t.kpiFullDescriptions?.avgPosition,
      gotItLabel: t.kpiFullDescriptions?.gotIt,
      color: 'green',
    },
  ] : null;

  // ─── Fancy SVG Area Chart ───
  const chartRef = useRef(null);
  const tooltipRef = useRef(null);
  const wrapRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);

  // Get real chart data
  const realChartData = chartData ?? data?.trafficChart ?? [];
  
  // Use animated data while loading, otherwise real data
  // Ensure animated data matches real data length for smooth CSS transition
  const activeChartData = (() => {
    if (chartLoading && chartAnimatedData) {
      return chartAnimatedData;
    }
    if (!chartLoading && chartAnimatedData && realChartData.length > 0) {
      // Transitioning from animated to real - ensure same length for smooth CSS transition
      if (chartAnimatedData.length === realChartData.length) {
        return realChartData;
      }
      // If lengths differ, still use real data but transition won't be as smooth
      return realChartData;
    }
    return realChartData;
  })();

  // Clamp tooltip within chart bounds after render
  useLayoutEffect(() => {
    const tip = tooltipRef.current;
    const wrap = wrapRef.current;
    if (!tip || !wrap || !tooltip) return;
    const wrapRect = wrap.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    // Clamp left edge
    if (tipRect.left < wrapRect.left) {
      tip.style.left = '0px';
      tip.style.transform = 'none';
    }
    // Clamp right edge
    else if (tipRect.right > wrapRect.right) {
      tip.style.left = 'auto';
      tip.style.right = '0px';
      tip.style.transform = 'none';
    }
  }, [tooltip]);

  const renderFancyChart = () => {
    if (!activeChartData?.length) return null;
    const chartItems = activeChartData;

    const W = 700, H = 240;
    const padL = 42, padR = 12, padT = 16, padB = 32;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;

    // Calculate max Y based on visible metrics only
    const visibleMaxValues = [];
    if (chartVisibleMetrics.visitors) visibleMaxValues.push(Math.max(...chartItems.map(d => d.visitors), 1));
    if (chartVisibleMetrics.pageViews) visibleMaxValues.push(Math.max(...chartItems.map(d => d.pageViews), 1));
    if (chartVisibleMetrics.sessions) visibleMaxValues.push(Math.max(...chartItems.map(d => d.sessions || 0), 1));
    if (chartVisibleMetrics.newUsers) visibleMaxValues.push(Math.max(...chartItems.map(d => d.newUsers || 0), 1));
    if (chartVisibleMetrics.engagedSessions) visibleMaxValues.push(Math.max(...chartItems.map(d => d.engagedSessions || 0), 1));
    const maxY = visibleMaxValues.length > 0 ? Math.max(...visibleMaxValues) : 1;
    // Nice round ceiling
    const ceil = Math.ceil(maxY / 10) * 10 || 10;

    const xOf = (i) => padL + (i / (chartItems.length - 1)) * innerW;
    const yOf = (v) => padT + innerH - (v / ceil) * innerH;

    // Build smooth path via monotone cubic interpolation
    const buildPath = (field) => {
      const pts = chartItems.map((d, i) => ({ x: xOf(i), y: yOf(d[field] || 0) }));
      if (pts.length < 2) return '';
      let d = `M${pts[0].x},${pts[0].y}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const cpx = (pts[i + 1].x - pts[i].x) / 3;
        const c1x = pts[i].x + cpx;
        const c2x = pts[i + 1].x - cpx;
        d += ` C${c1x},${pts[i].y} ${c2x},${pts[i + 1].y} ${pts[i + 1].x},${pts[i + 1].y}`;
      }
      return d;
    };

    const buildArea = (field) => {
      const path = buildPath(field);
      if (!path) return '';
      const lastPt = chartItems.length - 1;
      return path + ` L${xOf(lastPt)},${padT + innerH} L${xOf(0)},${padT + innerH} Z`;
    };

    const visitorsPath = chartVisibleMetrics.visitors ? buildPath('visitors') : '';
    const pageViewsPath = chartVisibleMetrics.pageViews ? buildPath('pageViews') : '';
    const sessionsPath = chartVisibleMetrics.sessions ? buildPath('sessions') : '';
    const newUsersPath = chartVisibleMetrics.newUsers ? buildPath('newUsers') : '';
    const engagedSessionsPath = chartVisibleMetrics.engagedSessions ? buildPath('engagedSessions') : '';
    const visitorsArea = chartVisibleMetrics.visitors ? buildArea('visitors') : '';
    const pageViewsArea = chartVisibleMetrics.pageViews ? buildArea('pageViews') : '';
    const sessionsArea = chartVisibleMetrics.sessions ? buildArea('sessions') : '';
    const newUsersArea = chartVisibleMetrics.newUsers ? buildArea('newUsers') : '';
    const engagedSessionsArea = chartVisibleMetrics.engagedSessions ? buildArea('engagedSessions') : '';

    // Y-axis gridlines – 5 steps
    const gridLines = [];
    for (let i = 0; i <= 4; i++) {
      const val = Math.round((ceil / 4) * i);
      const y = yOf(val);
      gridLines.push({ y, val });
    }

    // X-axis labels – show ~6 dates
    const step = Math.max(1, Math.floor(chartItems.length / 6));
    const xLabels = chartItems
      .filter((_, i) => i % step === 0 || i === chartItems.length - 1)
      .map((d, _, arr) => ({ i: chartItems.indexOf(d), label: formatChartDate(d.date) }));

    // Vertical gridlines at x-axis label positions
    const verticalGridLines = xLabels.map(({ i }) => xOf(i));

    // Toggle metric visibility
    const toggleMetric = (metric) => {
      setChartVisibleMetrics(prev => ({ ...prev, [metric]: !prev[metric] }));
    };

    const handleMouseMove = (e) => {
      const svg = chartRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * W;
      // Find closest data point
      let closest = 0, minDist = Infinity;
      chartItems.forEach((_, i) => {
        const dist = Math.abs(xOf(i) - mouseX);
        if (dist < minDist) { minDist = dist; closest = i; }
      });
      const d = chartItems[closest];
      setTooltip({
        i: closest,
        x: xOf(closest),
        date: formatChartDate(d.date),
        visitors: d.visitors,
        pageViews: d.pageViews,
        sessions: d.sessions || 0,
        newUsers: d.newUsers || 0,
        engagedSessions: d.engagedSessions || 0,
      });
    };

    const handleMouseLeave = () => setTooltip(null);

    return (
      <div className={styles.fancyChartWrap} ref={wrapRef}>
        {/* Legend - clickable to toggle visibility */}
        <div className={styles.chartLegend}>
          <button
            type="button"
            className={`${styles.chartLegendItem} ${styles.hasTooltip} ${!chartVisibleMetrics.visitors ? styles.chartLegendItemHidden : ''}`}
            data-tooltip={t.tipVisitorsLegend || 'Unique users who visited your site via organic search. One person visiting 5 pages counts as 1 visitor.'}
            onClick={() => toggleMetric('visitors')}
          >
            <span className={styles.chartLegendDot} style={{ background: chartVisibleMetrics.visitors ? '#8b5cf6' : 'var(--muted-foreground)' }} />
            {t.visitors || 'Visitors'}
          </button>
          <button
            type="button"
            className={`${styles.chartLegendItem} ${styles.hasTooltip} ${!chartVisibleMetrics.pageViews ? styles.chartLegendItemHidden : ''}`}
            data-tooltip={t.tipPageViewsLegend || 'Every single page load across your site. One person visiting 5 pages counts as 5 page views.'}
            onClick={() => toggleMetric('pageViews')}
          >
            <span className={styles.chartLegendDot} style={{ background: chartVisibleMetrics.pageViews ? '#06b6d4' : 'var(--muted-foreground)' }} />
            {t.pageViews || 'Page Views'}
          </button>
          <button
            type="button"
            className={`${styles.chartLegendItem} ${styles.hasTooltip} ${!chartVisibleMetrics.sessions ? styles.chartLegendItemHidden : ''}`}
            data-tooltip={t.tipSessionsLegend || 'A session is a period of user activity. A user visiting multiple pages in one visit counts as one session.'}
            onClick={() => toggleMetric('sessions')}
          >
            <span className={styles.chartLegendDot} style={{ background: chartVisibleMetrics.sessions ? '#10b981' : 'var(--muted-foreground)' }} />
            {t.sessions || 'Sessions'}
          </button>
          <button
            type="button"
            className={`${styles.chartLegendItem} ${styles.hasTooltip} ${!chartVisibleMetrics.newUsers ? styles.chartLegendItemHidden : ''}`}
            data-tooltip={t.tipNewUsersLegend || 'First-time visitors who have never been to your site before.'}
            onClick={() => toggleMetric('newUsers')}
          >
            <span className={styles.chartLegendDot} style={{ background: chartVisibleMetrics.newUsers ? '#f59e0b' : 'var(--muted-foreground)' }} />
            {t.newUsers || 'New Users'}
          </button>
          <button
            type="button"
            className={`${styles.chartLegendItem} ${styles.hasTooltip} ${!chartVisibleMetrics.engagedSessions ? styles.chartLegendItemHidden : ''}`}
            data-tooltip={t.tipEngagedSessionsLegend || 'Sessions with meaningful engagement: over 10 seconds, 2+ page views, or a conversion.'}
            onClick={() => toggleMetric('engagedSessions')}
          >
            <span className={styles.chartLegendDot} style={{ background: chartVisibleMetrics.engagedSessions ? '#ec4899' : 'var(--muted-foreground)' }} />
            {t.engagedSessions || 'Engaged'}
          </button>
        </div>

        <svg
          ref={chartRef}
          viewBox={`0 0 ${W} ${H}`}
          className={styles.fancyChartSvg}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            <linearGradient id="visitorsGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="pvGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="sessionsGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="newUsersGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="engagedGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ec4899" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#ec4899" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Horizontal grid lines */}
          {gridLines.map(({ y, val }, i) => (
            <g key={`h-${i}`}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="3,3" />
              <text x={padL - 6} y={y + 3} textAnchor="end" fill="var(--muted-foreground)" fontSize="9" fontFamily="inherit">
                {val}
              </text>
            </g>
          ))}

          {/* Vertical grid lines */}
          {verticalGridLines.map((x, i) => (
            <line key={`v-${i}`} x1={x} y1={padT} x2={x} y2={padT + innerH} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="3,3" />
          ))}

          {/* Areas */}
          {chartVisibleMetrics.engagedSessions && <path className={styles.chartPath} d={engagedSessionsArea} fill="url(#engagedGrad)" />}
          {chartVisibleMetrics.newUsers && <path className={styles.chartPath} d={newUsersArea} fill="url(#newUsersGrad)" />}
          {chartVisibleMetrics.sessions && <path className={styles.chartPath} d={sessionsArea} fill="url(#sessionsGrad)" />}
          {chartVisibleMetrics.pageViews && <path className={styles.chartPath} d={pageViewsArea} fill="url(#pvGrad)" />}
          {chartVisibleMetrics.visitors && <path className={styles.chartPath} d={visitorsArea} fill="url(#visitorsGrad)" />}

          {/* Lines */}
          {chartVisibleMetrics.engagedSessions && <path className={styles.chartPath} d={engagedSessionsPath} fill="none" stroke="#ec4899" strokeWidth="2" strokeLinecap="round" />}
          {chartVisibleMetrics.newUsers && <path className={styles.chartPath} d={newUsersPath} fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />}
          {chartVisibleMetrics.sessions && <path className={styles.chartPath} d={sessionsPath} fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />}
          {chartVisibleMetrics.pageViews && <path className={styles.chartPath} d={pageViewsPath} fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" />}
          {chartVisibleMetrics.visitors && <path className={styles.chartPath} d={visitorsPath} fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" />}

          {/* X labels */}
          {xLabels.map(({ i, label }) => (
            <text key={i} x={xOf(i)} y={H - 6} textAnchor="middle" fill="var(--muted-foreground)" fontSize="9" fontFamily="inherit">
              {label}
            </text>
          ))}

          {/* Hover crosshair + dots */}
          {tooltip && (
            <g>
              <line x1={tooltip.x} y1={padT} x2={tooltip.x} y2={padT + innerH} stroke="var(--muted-foreground)" strokeWidth="0.5" strokeDasharray="3,3" />
              {chartVisibleMetrics.visitors && <circle cx={tooltip.x} cy={yOf(tooltip.visitors)} r="4" fill="#8b5cf6" stroke="white" strokeWidth="2" />}
              {chartVisibleMetrics.pageViews && <circle cx={tooltip.x} cy={yOf(tooltip.pageViews)} r="4" fill="#06b6d4" stroke="white" strokeWidth="2" />}
              {chartVisibleMetrics.sessions && <circle cx={tooltip.x} cy={yOf(tooltip.sessions)} r="4" fill="#10b981" stroke="white" strokeWidth="2" />}
              {chartVisibleMetrics.newUsers && <circle cx={tooltip.x} cy={yOf(tooltip.newUsers)} r="4" fill="#f59e0b" stroke="white" strokeWidth="2" />}
              {chartVisibleMetrics.engagedSessions && <circle cx={tooltip.x} cy={yOf(tooltip.engagedSessions)} r="4" fill="#ec4899" stroke="white" strokeWidth="2" />}
            </g>
          )}
        </svg>

        {/* Tooltip popover */}
        {tooltip && (
          <div
            ref={tooltipRef}
            className={styles.chartTooltip}
            style={{
              left: `${(tooltip.x / W) * 100}%`,
              right: 'auto',
              transform: `translateX(${
                (tooltip.x / W) < 0.15 ? '0%' :
                (tooltip.x / W) > 0.85 ? '-100%' : '-50%'
              })`,
            }}
          >
            <div className={styles.chartTooltipDate}>{tooltip.date}</div>
            {chartVisibleMetrics.visitors && (
              <div className={styles.chartTooltipRow}>
                <span className={styles.chartTooltipDot} style={{ background: '#8b5cf6' }} />
                {t.visitors || 'Visitors'}: <strong>{fmtNum(tooltip.visitors)}</strong>
              </div>
            )}
            {chartVisibleMetrics.pageViews && (
              <div className={styles.chartTooltipRow}>
                <span className={styles.chartTooltipDot} style={{ background: '#06b6d4' }} />
                {t.pageViews || 'Page Views'}: <strong>{fmtNum(tooltip.pageViews)}</strong>
              </div>
            )}
            {chartVisibleMetrics.sessions && (
              <div className={styles.chartTooltipRow}>
                <span className={styles.chartTooltipDot} style={{ background: '#10b981' }} />
                {t.sessions || 'Sessions'}: <strong>{fmtNum(tooltip.sessions)}</strong>
              </div>
            )}
            {chartVisibleMetrics.newUsers && (
              <div className={styles.chartTooltipRow}>
                <span className={styles.chartTooltipDot} style={{ background: '#f59e0b' }} />
                {t.newUsers || 'New Users'}: <strong>{fmtNum(tooltip.newUsers)}</strong>
              </div>
            )}
            {chartVisibleMetrics.engagedSessions && (
              <div className={styles.chartTooltipRow}>
                <span className={styles.chartTooltipDot} style={{ background: '#ec4899' }} />
                {t.engagedSessions || 'Engaged'}: <strong>{fmtNum(tooltip.engagedSessions)}</strong>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  function formatChartDate(dateStr) {
    if (!dateStr) return '';
    // YYYYMMDD → formatted
    const y = dateStr.slice(0, 4);
    const m = dateStr.slice(4, 6);
    const d = dateStr.slice(6, 8);
    return `${d}/${m}`;
  }

  // Build an absolute external URL (never relative to the platform)
  const toExternalUrl = (raw) => {
    if (!raw) return '#';
    // Already absolute
    if (/^https?:\/\//i.test(raw)) return raw;
    // Build base from site URL, ensure it has a protocol
    let base = (selectedSite?.url || '').replace(/\/+$/, '');
    if (base && !/^https?:\/\//i.test(base)) base = `https://${base}`;
    // Path-only: prepend the site domain
    if (raw.startsWith('/')) return base ? `${base}${raw}` : raw;
    // Domain without protocol
    return `https://${raw}`;
  };

  // ─── AI Traffic: Engine Breakdown ───
  const AI_COLORS = ['#8b5cf6', '#06b6d4', '#f59e0b', '#ef4444', '#10b981', '#6366f1'];

  const renderDonutChart = (engines) => {
    if (!engines?.length) return null;
    const total = engines.reduce((s, e) => s + e.sessions, 0);
    if (!total) return null;

    const R = 60, cx = 80, cy = 80, stroke = 18;
    const circumference = 2 * Math.PI * R;
    let offset = 0;

    return (
      <svg viewBox="0 0 160 160" className={styles.aiDonutSvg}>
        {engines.map((eng, i) => {
          const frac = eng.sessions / total;
          const dash = frac * circumference;
          const gap = circumference - dash;
          const curOffset = offset;
          offset += dash;
          return (
            <circle
              key={eng.name}
              cx={cx} cy={cy} r={R}
              fill="none"
              stroke={AI_COLORS[i % AI_COLORS.length]}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={-curOffset}
              className={styles.aiDonutSegment}
            />
          );
        })}
      </svg>
    );
  };

  // ── AI Traffic: Daily timeseries chart (stacked area by engine) ──
  // Designed to match the same data the engine donut shows: the per-day
  // sessions sum across engines equals the total in the KPI row, and per-day
  // engine slices are pulled from the same GA4 query as the donut.
  const renderAiTimeseriesChart = (timeseries, engines) => {
    if (!timeseries?.length) return null;
    // Skip rendering when every day is zero - keeps the section clean.
    const hasAny = timeseries.some(d => d.sessions > 0);
    if (!hasAny) return null;

    // Larger viewBox so axis labels (in viewBox units) end up readable when
    // the SVG is scaled down to typical card width. preserveAspectRatio is
    // left as the default (xMidYMid meet) - this keeps text proportional
    // instead of being squashed when the container narrows.
    const W = 800, H = 280;
    const padL = 56, padR = 16, padT = 16, padB = 36;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const N = timeseries.length;

    // Engine order = order from the donut (highest sessions first)
    const engineNames = (engines || []).map(e => e.name);
    const colorOf = (name) => {
      const idx = engineNames.indexOf(name);
      return AI_COLORS[idx >= 0 ? idx % AI_COLORS.length : (AI_COLORS.length - 1)];
    };

    const maxSessions = Math.max(1, ...timeseries.map(d => d.sessions));
    const xOf = (i) => padL + (N === 1 ? innerW / 2 : (i * innerW) / (N - 1));
    const yOf = (v) => padT + innerH - (v / maxSessions) * innerH;

    // Build stacked paths (engine layers, bottom-up by donut order so the
    // largest engine sits at the bottom of the stack like the legend implies)
    const stackOrder = [...engineNames].reverse(); // smallest at top
    const layerPoints = stackOrder.map((engName) => {
      // Cumulative sum BELOW this engine for each day = sessions of all
      // engines that come after engName in stackOrder (i.e. larger ones).
      const belowEngines = stackOrder.slice(stackOrder.indexOf(engName) + 1);
      return timeseries.map((d, i) => {
        const below = belowEngines.reduce((s, e) => s + (d.byEngine?.[e] || 0), 0);
        const top = below + (d.byEngine?.[engName] || 0);
        return { i, x: xOf(i), yTop: yOf(top), yBottom: yOf(below) };
      });
    });

    const buildLayerPath = (pts) => {
      if (!pts.length) return '';
      const top = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.yTop}`).join(' ');
      const bottom = pts.slice().reverse().map(p => `L ${p.x} ${p.yBottom}`).join(' ');
      return `${top} ${bottom} Z`;
    };

    // Total line (sum of all engines per day) on top
    const totalPath = timeseries.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i)} ${yOf(d.sessions)}`).join(' ');

    // X-axis: show ~6 evenly spaced labels so it stays readable
    const labelStep = Math.max(1, Math.ceil(N / 6));

    return (
      <div className={styles.aiTimeseriesWrap}>
        <svg viewBox={`0 0 ${W} ${H}`} className={styles.aiTimeseriesSvg}>
          {/* Y-axis gridlines (4 lines) */}
          {[0, 0.25, 0.5, 0.75, 1].map((f, i) => {
            const y = padT + innerH - f * innerH;
            const v = Math.round(maxSessions * f);
            return (
              <g key={i}>
                <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="var(--border)" strokeWidth="0.75" strokeDasharray={i === 0 ? '' : '3 4'} />
                <text x={padL - 8} y={y + 5} textAnchor="end" fontSize="14" fill="var(--muted-foreground)">{fmtNum(v)}</text>
              </g>
            );
          })}
          {/* Stacked engine layers */}
          {layerPoints.map((pts, idx) => {
            const engName = stackOrder[idx];
            return (
              <path
                key={engName}
                d={buildLayerPath(pts)}
                fill={colorOf(engName)}
                fillOpacity="0.55"
                stroke={colorOf(engName)}
                strokeOpacity="0.8"
                strokeWidth="1.25"
              />
            );
          })}
          {/* Total line on top */}
          <path d={totalPath} fill="none" stroke="var(--foreground)" strokeWidth="2" strokeOpacity="0.85" strokeLinecap="round" />
          {/* X-axis labels */}
          {timeseries.map((d, i) => {
            if (i % labelStep !== 0 && i !== N - 1) return null;
            return (
              <text key={d.date} x={xOf(i)} y={H - 10} textAnchor="middle" fontSize="14" fill="var(--muted-foreground)">
                {formatChartDate(d.date)}
              </text>
            );
          })}
        </svg>
        {/* Inline legend reusing the engine colors */}
        <div className={styles.aiTimeseriesLegend}>
          {engineNames.map((name) => (
            <div key={name} className={styles.aiDonutLegendItem}>
              <span className={styles.aiDonutLegendDot} style={{ background: colorOf(name) }} />
              <span className={styles.aiDonutLegendLabel}>{name}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Build the prefilled chat message for "Optimize with Ghost" on a given page
  const buildOptimizePrompt = (engineName, fullUrl, keyword) => {
    const isHe = locale === 'he';
    if (isHe) {
      return `אני רוצה לשפר את העמוד הזה עבור ${engineName}: ${fullUrl}${keyword ? `\nהמילה / נושא הרלוונטי: "${keyword}"` : ''}\n\nבדוק את העמוד, נתח איך הוא עובד מול ${engineName}, והצע שיפורים קונקרטיים שאפשר לאשר.`;
    }
    return `I want to optimize this page for ${engineName}: ${fullUrl}${keyword ? `\nRelevant keyword/topic: "${keyword}"` : ''}\n\nReview the page, analyze how well it performs for ${engineName}, and propose concrete improvements I can approve.`;
  };

  const handleOptimizeWithGhost = (engineName, fullUrl, keyword) => {
    const prefill = buildOptimizePrompt(engineName, fullUrl, keyword);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gp:open-chat', { detail: { prefill } }));
    }
  };

  const renderEngineBreakdown = (engines, enginePages) => {
    if (!engines?.length) return <p className={styles.noDataMsg}>{t.aiNoTraffic || 'No AI-referred traffic detected.'}</p>;

    return (
      <div className={styles.aiEngineBreakdown}>
        <div className={styles.aiDonutWrap}>
          {renderDonutChart(engines)}
          <div className={styles.aiDonutLegend}>
            {engines.map((eng, i) => (
              <div key={eng.name} className={styles.aiDonutLegendItem}>
                <span className={styles.aiDonutLegendDot} style={{ background: AI_COLORS[i % AI_COLORS.length] }} />
                <span className={styles.aiDonutLegendLabel}>{eng.name}</span>
                <span className={styles.aiDonutLegendValue}>{fmtNum(eng.sessions)}</span>
                <span className={styles.aiDonutLegendPct}>{eng.share}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Per-engine top pages with extracted keywords */}
        <div className={styles.aiEnginePagesList}>
          {engines.map((eng, i) => {
            const pages = enginePages?.[eng.name] || [];
            if (!pages.length) return null;
            return (
              <div key={eng.name} className={styles.aiEngineGroup}>
                <div className={styles.aiEngineGroupHeader}>
                  <span className={styles.aiDonutLegendDot} style={{ background: AI_COLORS[i % AI_COLORS.length] }} />
                  <span className={styles.aiEngineGroupName}>{eng.name}</span>
                  <span className={styles.aiEngineGroupCount}>{fmtNum(eng.sessions)} {t.aiSessions || 'Sessions'}</span>
                </div>
                <div className={styles.aiEngineGroupPages}>
                  {pages.map((row, j) => {
                    // Build full URL display with protocol
                    let displayPath = row.page;
                    let fullUrl = row.page;
                    const siteUrl = selectedSite?.url?.replace(/\/$/, '') || '';
                    const siteBase = siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`;
                    try {
                      // row.page may be just a path or a full URL
                      if (row.page.startsWith('/')) {
                        // It's a path - prepend site URL for full display
                        const path = decodeURIComponent(row.page);
                        displayPath = siteBase + (path === '/' ? ` (${t.aiHomePage || 'Homepage'})` : path);
                        fullUrl = siteBase + row.page;
                      } else {
                        // It's a full URL
                        const u = new URL(row.page);
                        displayPath = u.protocol + '//' + u.hostname + (u.pathname === '/' ? ` (${t.aiHomePage || 'Homepage'})` : decodeURIComponent(u.pathname));
                        fullUrl = row.page;
                      }
                    } catch { /* keep raw */ }
                    return (
                      <div key={j} className={styles.aiEnginePageRow}>
                        <div className={styles.aiEnginePageInfo}>
                          {row.keyword && (
                            <span className={styles.aiEngineKeyword} title={row.keyword}>
                              {row.keyword}
                            </span>
                          )}
                          <a href={toExternalUrl(fullUrl)} target="_blank" rel="noopener noreferrer" className={styles.aiEnginePageLink}>
                            <bdi dir="ltr"><span className={styles.aiEnginePagePath} title={row.page}>{displayPath}</span></bdi>
                            <ExternalLink size={10} className={styles.pageLinkIcon} />
                          </a>
                        </div>
                        <div className={styles.aiEnginePageRight}>
                          <span className={styles.aiEnginePageSessions}>{fmtNum(row.sessions)}</span>
                          <button
                            type="button"
                            className={`${styles.aiOptimizeBtn} ${styles.hasTooltip}`}
                            data-tooltip={t.aiOptimizeWithGhostHint || 'Open Ghost on this page to improve it for AI engines'}
                            onClick={() => handleOptimizeWithGhost(eng.name, toExternalUrl(fullUrl), row.keyword)}
                          >
                            <span className={styles.aiOptimizeBtnIcon}>👻</span>
                            <span className={styles.aiOptimizeBtnLabel}>{t.aiOptimizeWithGhost || 'Optimize with Ghost'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ── AI Keywords (GSC search queries that landed on AI top pages) ──
  const renderAiKeywords = (queries) => {
    if (!queries?.length) return <p className={styles.noDataMsg}>{t.aiNoKeywordsData || 'No AI-related keywords found for this period.'}</p>;
    return (
      <div className={styles.aiOverviewTable}>
        <div className={styles.aiOverviewHeader}>
          <span className={styles.aiOverviewColQuery}>{t.aiQuery || 'Query'}</span>
          <span className={styles.aiOverviewColClicks}>{t.aiClicks || 'Clicks'}</span>
          <span className={styles.aiOverviewColImpr}>{t.aiImpressions || 'Impr.'}</span>
          <span className={styles.aiOverviewColCtr}>{t.aiCtr || 'CTR'}</span>
        </div>
        {queries.map((row, i) => {
          let displayPage = row.page;
          try {
            displayPage = decodeURIComponent(new URL(row.page).pathname);
            if (displayPage === '/') displayPage = `/ (${t.aiHomePage || 'Homepage'})`;
          } catch {
            try { displayPage = decodeURIComponent(row.page); } catch { /* keep */ }
          }
          return (
            <div key={i} className={styles.aiOverviewRow}>
              <div className={styles.aiOverviewColQuery}>
                <span className={styles.aiOverviewQueryText} title={row.query}>{row.query}</span>
                <span className={styles.aiOverviewPagePath} title={row.page}>{displayPage}</span>
              </div>
              <span className={styles.aiOverviewColClicks}>{fmtNum(row.clicks)}</span>
              <span className={styles.aiOverviewColImpr}>{fmtNum(row.impressions)}</span>
              <span className={styles.aiOverviewColCtr}>{row.ctr}%</span>
            </div>
          );
        })}
      </div>
    );
  };
  // ── end AI Keywords ──

  // // ─── Inferred AI Queries renderer ───
  // const PROMPT_LABELS = {
  //   direct:     { label: t.inferredDirect || 'Direct Question', icon: '?' },
  //   comparison: { label: t.inferredComparison || 'Comparison', icon: '⇄' },
  //   discovery:  { label: t.inferredDiscovery || 'Broad Discovery', icon: '◎' },
  // };
  //
  // const renderInferredQueries = () => {
  //   if (inferredLoading) {
  //     return (
  //       <div className={styles.chartPlaceholder}>
  //         <Activity size={32} className={`${styles.chartPlaceholderIcon} ${styles.spinning}`} />
  //         <p>{t.inferredLoading || 'Analyzing AI traffic patterns...'}</p>
  //       </div>
  //     );
  //   }
  //   if (!inferredQueries?.length) {
  //     return <p className={styles.noDataMsg}>{t.inferredNoData || 'No inferred queries available.'}</p>;
  //   }
  //
  //   return (
  //     <div className={styles.inferredQueriesList}>
  //       {inferredQueries.map((item, i) => {
  //         let displayPath = item.page;
  //         try { displayPath = decodeURIComponent(item.page); } catch { /* keep */ }
  //         if (displayPath === '/') displayPath = '/ (Homepage)';
  //         return (
  //           <div key={i} className={styles.inferredPageBlock}>
  //             <div className={styles.inferredPageHeader}>
  //               <span className={styles.inferredPagePath} title={item.page}>
  //                 {item.title || displayPath}
  //               </span>
  //               <span className={styles.inferredPageSessions}>
  //                 {fmtNum(item.sessions)} {t.aiSessions || 'sessions'}
  //               </span>
  //             </div>
  //             {item.prompts ? (
  //               <div className={styles.inferredPrompts}>
  //                 {Object.entries(PROMPT_LABELS).map(([key, { label, icon }]) => (
  //                   <div key={key} className={styles.inferredPromptRow}>
  //                     <span className={styles.inferredPromptIcon}>{icon}</span>
  //                     <div className={styles.inferredPromptContent}>
  //                       <span className={styles.inferredPromptType}>{label}</span>
  //                       <span className={styles.inferredPromptText}>
  //                         {item.prompts[key]}
  //                       </span>
  //                     </div>
  //                   </div>
  //                 ))}
  //               </div>
  //             ) : (
  //               <p className={styles.inferredNoPrompts}>{t.inferredPending || 'Generating…'}</p>
  //             )}
  //           </div>
  //         );
  //       })}
  //       <div className={styles.inferredDisclaimer}>
  //         <span className={styles.inferredDisclaimerIcon}>ⓘ</span>
  //         {t.inferredDisclaimer || 'These queries are AI-inferred estimates, not actual user prompts.'}
  //       </div>
  //     </div>
  //   );
  // };

  // ─── Top Keywords Section ───
  // ─── Unified GSC Table (keywords + pages) ───
  const [keywordSort, setKeywordSort] = useState('clicks');

  const getSortedKeywords = () => {
    const activeKeywords = keywordsData ?? data?.topQueries;
    if (!activeKeywords?.length) return [];
    const sorted = [...activeKeywords].sort((a, b) => {
      if (keywordSort === 'ctr') return parseFloat(b.ctr) - parseFloat(a.ctr);
      if (keywordSort === 'position') return parseFloat(a.position) - parseFloat(b.position); // lower is better
      return b[keywordSort] - a[keywordSort];
    });
    return sorted.slice(0, 10);
  };

  const handleAddKeywordFromGSC = async (query) => {
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
      console.error('Error adding keyword:', err);
    } finally {
      setAddingKeyword(prev => { const next = new Set(prev); next.delete(query); return next; });
    }
  };

  const handleAIPostFromGSC = async (query) => {
    if (!selectedSite?.id || aiPostLoading) return;
    setAiPostLoading(query);
    try {
      const res = await fetch('/api/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: selectedSite.id, keywords: query }),
      });
      const data = await res.json();
      let kw = null;

      if (res.ok && data.keywords?.length) {
        kw = data.keywords[0];
        setTrackedKeywords(prev => new Map([...prev, [query.toLowerCase().trim(), kw]]));
      } else if (res.status === 409) {
        // Already exists - use from map or fetch
        kw = trackedKeywords.get(query.toLowerCase().trim());
        if (!kw) {
          const fetchRes = await fetch(`/api/keywords?siteId=${selectedSite.id}`);
          if (fetchRes.ok) {
            const fetchData = await fetchRes.json();
            kw = fetchData.keywords?.find(k => k.keyword?.toLowerCase().trim() === query.toLowerCase().trim());
          }
        }
      }

      if (kw) {
        setGeneratePostKeyword(kw);
      }
    } catch (err) {
      console.error('Error adding keyword for AI post:', err);
    } finally {
      setAiPostLoading(null);
    }
  };

  const GSCTable = ({ rows, variant, period, sortField, onSortChange }) => {
    if (!rows?.length) return null;
    const isPages = variant === 'pages';
    const isKeywords = variant === 'keywords';

    const formatLabel = (row) => {
      if (isPages) {
        let display = row.page;
        try {
          const u = new URL(row.page);
          display = u.protocol + '//' + u.hostname + (u.pathname === '/' ? '' : decodeURIComponent(u.pathname));
        } catch { /* keep raw */ }
        return (
          <span className={styles.gscColLabel} title={row.page}>
            <a href={toExternalUrl(row.page)} target="_blank" rel="noopener noreferrer" className={styles.pageLink}>
              {display}
              <ExternalLink size={12} className={styles.pageLinkIcon} />
            </a>
          </span>
        );
      }

      const key = row.query?.toLowerCase().trim();
      const isTracked = trackedKeywords.has(key);
      const isAdding = addingKeyword.has(row.query);

      return (
        <span className={styles.gscColLabel} title={row.query}>
          {isTracked ? (
            <span className={styles.kwTrackedIcon} title={t.alreadyTracked || 'Already tracked'}>
              <Check size={12} />
            </span>
          ) : (
            <button
              className={styles.kwAddBtn}
              onClick={() => handleAddKeywordFromGSC(row.query)}
              disabled={isAdding}
              title={t.addToKeywords || 'Add to keywords'}
            >
              {isAdding ? <Loader2 size={11} className={styles.spinning} /> : <Plus size={11} />}
              <span>{t.track || 'Track'}</span>
            </button>
          )}
          {row.query}
        </span>
      );
    };

    const renderPostCell = (row) => {
      const key = row.query?.toLowerCase().trim();
      const kwData = trackedKeywords.get(key);
      const relatedPost = kwData?.relatedPost;

      if (relatedPost) {
        return (
          <span className={styles.gscColPost}>
            <span className={styles.gscPostLinks}>
              <Link href={`/dashboard/entities/posts/${relatedPost.id}`} className={styles.gscPostLink} title={relatedPost.title}>
                <FileText size={12} />
              </Link>
              {relatedPost.url && (
                <a href={relatedPost.url} target="_blank" rel="noopener noreferrer" className={styles.gscPostExternal} title={relatedPost.url}>
                  <ExternalLink size={12} />
                </a>
              )}
            </span>
          </span>
        );
      }

      return (
        <span className={styles.gscColPost}>
          <button
            className={styles.gscAddPostBtn}
            onClick={(e) => { e.stopPropagation(); handleAIPostFromGSC(row.query); }}
            disabled={aiPostLoading === row.query}
            title={t.generateAIPost || 'Generate AI Post'}
          >
            {aiPostLoading === row.query ? <Loader2 size={11} className={styles.spinning} /> : <><Wand2 size={12} /><Plus size={10} /></>}
          </button>
        </span>
      );
    };

    return (
      <div className={styles.gscTableSection}>
        {/* Sort selector for keywords */}
        {isKeywords && onSortChange && (
          <div className={styles.gscSortHeader}>
            <div className={styles.gscSortWrap}>
              <label className={styles.gscSortLabel}>{t.sortBy || 'Sort by'}:</label>
              <select
                className={styles.gscSortSelect}
                value={sortField}
                onChange={(e) => onSortChange(e.target.value)}
              >
                <option value="clicks">{t.clicks}</option>
                <option value="impressions">{t.impressions}</option>
                <option value="ctr">{t.ctr}</option>
                <option value="position">{t.position}</option>
              </select>
            </div>
          </div>
        )}

        <div className={`${styles.gscTable} ${isKeywords ? styles.gscTableWithRank : ''}`}>
          <div className={styles.gscTableHeader}>
            {isKeywords && <span className={styles.gscColRank}>#</span>}
            <span className={styles.gscColLabel}>{isPages ? t.page : (t.keyword || 'Keyword')}</span>
            {isKeywords && <span className={styles.gscColPost}>{t.relatedPost || 'Related Post'}</span>}
            <span className={styles.gscColNum}>{t.clicks}</span>
            <span className={styles.gscColNum}>{t.impressions}</span>
            <span className={styles.gscColNum}>{t.ctr}</span>
            <span className={styles.gscColNum}>{t.position}</span>
          </div>
          {rows.map((row, i) => (
            <div key={i} className={styles.gscTableRow}>
              {isKeywords && (
                <span className={styles.gscColRank}>
                  <span className={styles.gscRankBadge}>{i + 1}</span>
                </span>
              )}
              {formatLabel(row)}
              {isKeywords && renderPostCell(row)}
              <span className={`${styles.gscColNum} ${sortField === 'clicks' ? styles.gscHighlight : ''}`}>
                {fmtNum(row.clicks)}
                <ChangeBadge value={row.clicksChange} tooltip={changeTip(row.clicksChange, { value: fmtNum(row.clicks), metric: t.clicks, period })} />
              </span>
              <span className={`${styles.gscColNum} ${sortField === 'impressions' ? styles.gscHighlight : ''}`}>
                {fmtNum(row.impressions)}
                <ChangeBadge value={row.impressionsChange} tooltip={changeTip(row.impressionsChange, { value: fmtNum(row.impressions), metric: t.impressions, period })} />
              </span>
              <span className={`${styles.gscColNum} ${sortField === 'ctr' ? styles.gscHighlight : ''}`}>
                {row.ctr}%
                <ChangeBadge value={row.ctrChange} tooltip={changeTip(row.ctrChange, { value: `${row.ctr}%`, metric: t.ctr, period })} />
              </span>
              <span className={`${styles.gscColNum} ${sortField === 'position' ? styles.gscHighlight : ''}`}>
                {row.position}
                <ChangeBadge value={row.positionChange} tooltip={positionTip(row.positionChange, period)} />
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ─── All GSC Keywords Modal ───
  const AllGSCKeywordsModal = () => {
    const { isMaximized, toggleMaximize } = useModalResize();
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [modalLoading, setModalLoading] = useState(true);
    const [searchVal, setSearchVal] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [pageSize, setPageSize] = useState(20);
    const [page, setPage] = useState(1);
    const [sortBy, setSortBy] = useState('clicks');
    const searchTimerRef = useRef(null);
    const [localAdding, setLocalAdding] = useState(new Set());
    const [localTracked, setLocalTracked] = useState(() => new Map(trackedKeywords));
    const [localAiPostLoading, setLocalAiPostLoading] = useState(null);

    // Local date filter (initialized from parent keywords date)
    const [modalPreset, setModalPreset] = useState(keywordsPreset);
    const [modalStartDate, setModalStartDate] = useState(keywordsStartDate);
    const [modalEndDate, setModalEndDate] = useState(keywordsEndDate);
    const handleModalPresetChange = (e) => {
      const value = e.target.value;
      setModalPreset(value);
      if (value !== 'custom') {
        const range = getDateRange(value);
        if (range) {
          setModalStartDate(range.start);
          setModalEndDate(range.end);
        }
      }
      setPage(1);
    };

    // Debounce search
    useEffect(() => {
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => {
        setDebouncedSearch(searchVal);
        setPage(1);
      }, 400);
      return () => clearTimeout(searchTimerRef.current);
    }, [searchVal]);

    // Fetch data
    useEffect(() => {
      if (!selectedSite?.id) return;
      const offset = (page - 1) * pageSize;
      setModalLoading(true);
      const params = new URLSearchParams({
        siteId: selectedSite.id,
        startDate: modalStartDate,
        endDate: modalEndDate,
        limit: String(pageSize),
        offset: String(offset),
        sort: sortBy,
      });
      if (debouncedSearch) params.set('search', debouncedSearch);

      fetch(`/api/dashboard/stats/gsc/keywords?${params}`)
        .then(r => r.json())
        .then(json => {
          setRows(json.rows || []);
          setTotal(json.total || 0);
        })
        .catch(err => console.error('All keywords fetch error:', err))
        .finally(() => setModalLoading(false));
    }, [selectedSite?.id, modalStartDate, modalEndDate, pageSize, page, sortBy, debouncedSearch]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const kwPeriod = getPeriodName(modalStartDate, modalEndDate, modalPreset);

    const handleModalAddKeyword = async (query) => {
      if (!selectedSite?.id || localAdding.has(query)) return;
      setLocalAdding(prev => new Set([...prev, query]));
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
            const key = query.toLowerCase().trim();
            setLocalTracked(prev => new Map([...prev, [key, kw]]));
          }
        }
      } catch (err) {
        console.error('Error adding keyword:', err);
      } finally {
        setLocalAdding(prev => { const next = new Set(prev); next.delete(query); return next; });
      }
    };

    const handleModalAIPost = async (query) => {
      if (!selectedSite?.id || localAiPostLoading) return;
      setLocalAiPostLoading(query);
      try {
        const res = await fetch('/api/keywords', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteId: selectedSite.id, keywords: query }),
        });
        const data = await res.json();
        let kw = null;

        if (res.ok && data.keywords?.length) {
          kw = data.keywords[0];
          const key = query.toLowerCase().trim();
          setLocalTracked(prev => new Map([...prev, [key, kw]]));
        } else if (res.status === 409) {
          kw = localTracked.get(query.toLowerCase().trim());
          if (!kw) {
            const fetchRes = await fetch(`/api/keywords?siteId=${selectedSite.id}`);
            if (fetchRes.ok) {
              const fetchData = await fetchRes.json();
              kw = fetchData.keywords?.find(k => k.keyword?.toLowerCase().trim() === query.toLowerCase().trim());
            }
          }
        }

        if (kw) {
          // Sync tracked keywords back to parent (include newly added kw) and close GSC modal
          const updatedTracked = new Map(localTracked);
          updatedTracked.set(query.toLowerCase().trim(), kw);
          setTrackedKeywords(updatedTracked);
          setShowAllKeywords(false);
          setGeneratePostKeyword(kw);
        }
      } catch (err) {
        console.error('Error adding keyword for AI post:', err);
      } finally {
        setLocalAiPostLoading(null);
      }
    };

    const handleCloseModal = () => {
      // Sync locally tracked keywords back to parent
      setTrackedKeywords(new Map(localTracked));
      setShowAllKeywords(false);
    };

    return createPortal(
      <div className={styles.gscKwModalOverlay} onClick={handleCloseModal}>
        <div className={`${styles.gscKwModal} ${isMaximized ? 'modal-maximized' : ''}`} onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className={styles.gscKwModalHeader}>
            <div>
              <h2 className={styles.gscKwModalTitle}>{t.allGscKeywords || 'All Keywords from Google Search Console'}</h2>
              <p className={styles.gscKwModalSubtitle}>
                {total.toLocaleString()} {t.keywordsFound || 'keywords found'}
                {debouncedSearch && ` · "${debouncedSearch}"`}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <ModalResizeButton isMaximized={isMaximized} onToggle={toggleMaximize} className={styles.gscKwModalClose} />
              <button className={styles.gscKwModalClose} onClick={handleCloseModal}>
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Date Filter */}
          <div className={styles.gscKwDateRow}>
            <DateRangeSelect
              preset={modalPreset}
              onPresetChange={handleModalPresetChange}
              startDate={modalStartDate}
              endDate={modalEndDate}
              onStartChange={(v) => { setModalStartDate(v); setPage(1); }}
              onEndChange={(v) => { setModalEndDate(v); setPage(1); }}
              loading={modalLoading}
            />
          </div>

          {/* Controls */}
          <div className={styles.gscKwControls}>
            <div className={styles.gscKwSearchWrap}>
              <Search size={14} className={styles.gscKwSearchIcon} />
              <input
                type="text"
                value={searchVal}
                onChange={e => setSearchVal(e.target.value)}
                placeholder={t.searchKeywords || 'Search keywords...'}
                className={styles.gscKwSearchInput}
              />
              {searchVal && (
                <button className={styles.gscKwSearchClear} onClick={() => setSearchVal('')}>
                  <X size={12} />
                </button>
              )}
            </div>
            <div className={styles.gscKwControlsEnd}>
              <div className={styles.gscKwSortWrap}>
                <label>{t.sortBy || 'Sort by'}:</label>
                <select value={sortBy} onChange={e => { setSortBy(e.target.value); setPage(1); }}>
                  <option value="clicks">{t.clicks}</option>
                  <option value="impressions">{t.impressions}</option>
                  <option value="ctr">{t.ctr}</option>
                  <option value="position">{t.position}</option>
                </select>
              </div>
              <div className={styles.gscKwSortWrap}>
                <label>{t.perPage || 'Per page'}:</label>
                <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
                  {[20, 50, 100, 150, 200, 400, 500].map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className={styles.gscKwTableWrap}>
            {modalLoading ? (
              <div className={styles.gscKwLoading}>
                <Loader2 size={24} className={styles.spinning} />
              </div>
            ) : rows.length === 0 ? (
              <div className={styles.gscKwEmpty}>
                <Search size={24} />
                <p>{t.noKeywordsFound || 'No keywords found'}</p>
              </div>
            ) : (
              <div className={styles.gscTable + ' ' + styles.gscTableWithRank}>
                <div className={styles.gscTableHeader}>
                  <span className={styles.gscColRank}>#</span>
                  <span className={styles.gscColLabel}>{t.keyword || 'Keyword'}</span>
                  <span className={styles.gscColPost}>{t.relatedPost || 'Related Post'}</span>
                  <span className={styles.gscColNum}>{t.clicks}</span>
                  <span className={styles.gscColNum}>{t.impressions}</span>
                  <span className={styles.gscColNum}>{t.ctr}</span>
                  <span className={styles.gscColNum}>{t.position}</span>
                </div>
                {rows.map((row, i) => {
                  const globalIndex = (page - 1) * pageSize + i + 1;
                  const key = row.query?.toLowerCase().trim();
                  const isTracked = localTracked.has(key);
                  const isAdding = localAdding.has(row.query);
                  const kwData = localTracked.get(key);
                  const relatedPost = kwData?.relatedPost;
                  return (
                    <div key={row.query + i} className={styles.gscTableRow}>
                      <span className={styles.gscColRank}>
                        <span className={styles.gscRankBadge}>{globalIndex}</span>
                      </span>
                      <span className={styles.gscColLabel} title={row.query}>
                        {isTracked ? (
                          <span className={styles.kwTrackedIcon} title={t.alreadyTracked || 'Already tracked'}>
                            <Check size={12} />
                          </span>
                        ) : (
                          <button
                            className={styles.kwAddBtn}
                            onClick={() => handleModalAddKeyword(row.query)}
                            disabled={isAdding}
                            title={t.addToKeywords || 'Add to keywords'}
                          >
                            {isAdding ? <Loader2 size={11} className={styles.spinning} /> : <Plus size={11} />}
                            <span>{t.track || 'Track'}</span>
                          </button>
                        )}
                        {row.query}
                      </span>
                      <span className={styles.gscColPost}>
                        {relatedPost ? (
                          <span className={styles.gscPostLinks}>
                            <Link href={`/dashboard/entities/posts/${relatedPost.id}`} className={styles.gscPostLink} title={relatedPost.title}>
                              <FileText size={12} />
                            </Link>
                            {relatedPost.url && (
                              <a href={relatedPost.url} target="_blank" rel="noopener noreferrer" className={styles.gscPostExternal} title={relatedPost.url}>
                                <ExternalLink size={12} />
                              </a>
                            )}
                          </span>
                        ) : (
                          <button
                            className={styles.gscAddPostBtn}
                            onClick={(e) => { e.stopPropagation(); handleModalAIPost(row.query); }}
                            disabled={localAiPostLoading === row.query}
                            title={t.generateAIPost || 'Generate AI Post'}
                          >
                            {localAiPostLoading === row.query ? <Loader2 size={11} className={styles.spinning} /> : <><Wand2 size={12} /><Plus size={10} /></>}
                          </button>
                        )}
                      </span>
                      <span className={`${styles.gscColNum} ${sortBy === 'clicks' ? styles.gscHighlight : ''}`}>
                        {fmtNum(row.clicks)}
                        <ChangeBadge value={row.clicksChange} tooltip={changeTip(row.clicksChange, { value: fmtNum(row.clicks), metric: t.clicks, period: kwPeriod })} />
                      </span>
                      <span className={`${styles.gscColNum} ${sortBy === 'impressions' ? styles.gscHighlight : ''}`}>
                        {fmtNum(row.impressions)}
                        <ChangeBadge value={row.impressionsChange} tooltip={changeTip(row.impressionsChange, { value: fmtNum(row.impressions), metric: t.impressions, period: kwPeriod })} />
                      </span>
                      <span className={`${styles.gscColNum} ${sortBy === 'ctr' ? styles.gscHighlight : ''}`}>
                        {row.ctr}%
                        <ChangeBadge value={row.ctrChange} tooltip={changeTip(row.ctrChange, { value: `${row.ctr}%`, metric: t.ctr, period: kwPeriod })} />
                      </span>
                      <span className={`${styles.gscColNum} ${sortBy === 'position' ? styles.gscHighlight : ''}`}>
                        {row.position}
                        <ChangeBadge value={row.positionChange} tooltip={positionTip(row.positionChange, kwPeriod)} />
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pagination */}
          {!modalLoading && total > 0 && (
            <div className={styles.gscKwPagination}>
              <span className={styles.gscKwPageInfo}>
                {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, total)} {t.of || 'of'} {total.toLocaleString()}
              </span>
              <div className={styles.gscKwPageBtns}>
                <button disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft size={16} />
                </button>
                {totalPages <= 7 ? (
                  Array.from({ length: totalPages }, (_, i) => (
                    <button
                      key={i + 1}
                      className={page === i + 1 ? styles.gscKwPageActive : ''}
                      onClick={() => setPage(i + 1)}
                    >
                      {i + 1}
                    </button>
                  ))
                ) : (
                  <>
                    {[1, 2].map(n => (
                      <button key={n} className={page === n ? styles.gscKwPageActive : ''} onClick={() => setPage(n)}>{n}</button>
                    ))}
                    {page > 3 && <span className={styles.gscKwEllipsis}>…</span>}
                    {page > 2 && page < totalPages - 1 && (
                      <button className={styles.gscKwPageActive}>{page}</button>
                    )}
                    {page < totalPages - 2 && <span className={styles.gscKwEllipsis}>…</span>}
                    {[totalPages - 1, totalPages].map(n => (
                      <button key={n} className={page === n ? styles.gscKwPageActive : ''} onClick={() => setPage(n)}>{n}</button>
                    ))}
                  </>
                )}
                <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>,
      document.body
    );
  };

  // Integration CTA card
  const IntegrationCTA = ({ type, icon: Icon, title, description, svgIcon }) => (
    <div className={styles.integrationCta}>
      <div className={styles.integrationCtaIcon}>
        {svgIcon || <Icon size={24} />}
      </div>
      <div className={styles.integrationCtaText}>
        <h4>{title}</h4>
        <p>{description}</p>
      </div>
      <Link
        href="/dashboard/settings?tab=integrations"
        className={styles.integrationCtaBtn}
      >
        <Settings size={14} />
        {t.connectIntegration}
      </Link>
    </div>
  );

  // Quick actions
  const quickActionsData = [
    { label: t.contentPlanner, href: '/dashboard/strategy/content-planner', iconName: 'FileText' },
    { label: t.keywords, href: '/dashboard/strategy/keywords', iconName: 'Target' },
    { label: t.siteAudit, href: '/dashboard/technical-seo/site-audit', iconName: 'Activity' },
  ];

  return (
    <>
      {/* Welcome Section */}
      {selectedSite && (
        <div className={styles.welcomeSection} data-onboarding="dashboard-welcome">
          <div
            className={styles.welcomeLogo}
            style={{
              backgroundColor: selectedSite.logo
                ? (theme === 'dark' ? selectedSite.logoBgDark : selectedSite.logoBgLight) || 'transparent'
                : 'transparent',
            }}
          >
            {selectedSite.logo ? (
              <img src={selectedSite.logo} alt={selectedSite.name} className={styles.welcomeLogoImg} />
            ) : selectedSite.favicon ? (
              <img src={selectedSite.favicon} alt={selectedSite.name} className={styles.welcomeLogoImg} />
            ) : (
              <Globe size={40} className={styles.welcomeLogoFallback} />
            )}
          </div>
          <div className={styles.welcomeText}>
            <h1 className={styles.welcomeTitle}>
              {(t.welcomeTo || 'Welcome to {siteName} Dashboard').replace('{siteName}', selectedSite.name)}
            </h1>
            <a
              href={selectedSite.url.startsWith('http') ? selectedSite.url : `https://${selectedSite.url}`}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.welcomeUrl}
            >
              <bdi dir="ltr">{decodeDisplayUrl(selectedSite.url.startsWith('http') ? selectedSite.url.replace(/\/$/, '') : `https://${selectedSite.url}`.replace(/\/$/, ''))}</bdi>
              <ExternalLink size={12} />
            </a>
          </div>
        </div>
      )}

      {/* Header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>{t.commandCenter}</h1>
          <p className={styles.pageSubtitle}>{t.subtitle}</p>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className={styles.mainGrid}>
        {/* Start Column */}
        <div className={styles.startColumn}>
          {/* GA4 + GSC KPIs - unified slider */}
          {loading ? (
            <div data-onboarding="dashboard-kpis">
              <KpiSlider>
                {[
                  { iconName: 'Users', label: t.organicVisitors, color: 'purple', description: t.kpiDescriptions?.organicVisitors },
                  { iconName: 'FileText', label: t.totalPageViews, color: 'blue', description: t.kpiDescriptions?.totalPageViews },
                  { iconName: 'Clock', label: t.avgSessionDuration, color: 'orange', description: t.kpiDescriptions?.avgSessionDuration },
                  { iconName: 'BarChart2', label: t.sessions, color: 'green', description: t.kpiDescriptions?.sessions },
                ].map((kpi, index) => (
                  <StatsCard key={index} {...kpi} loading={true} />
                ))}
              </KpiSlider>
            </div>
          ) : (data?.gaConnected || data?.gscConnected) && (gaCards || gscCards) ? (
            <>
              <div className={styles.dashboardSectionHeader}>
                {data?.gaConnected && (
                  <div className={styles.kpiDateGroup}>
                    <span className={styles.iconTooltip} data-tooltip={t.dataFromGA}><GAIcon /></span>
                    <DateRangeSelect
                      preset={gaPreset}
                      onPresetChange={makePresetHandler(setGaPreset, setGaStartDate, setGaEndDate)}
                      startDate={gaStartDate}
                      endDate={gaEndDate}
                      onStartChange={setGaStartDate}
                      onEndChange={setGaEndDate}
                      loading={gaLoading}
                    />
                  </div>
                )}
                {data?.gscConnected && (
                  <div className={styles.kpiDateGroup}>
                    <span className={styles.iconTooltip} data-tooltip={t.dataFromGSC}><GSCIcon /></span>
                    <DateRangeSelect
                      preset={gscPreset}
                      onPresetChange={makePresetHandler(setGscPreset, setGscStartDate, setGscEndDate, getGscDateRange)}
                      startDate={gscStartDate}
                      endDate={gscEndDate}
                      onStartChange={setGscStartDate}
                      onEndChange={setGscEndDate}
                      loading={gscLoading}
                    />
                  </div>
                )}
              </div>
              <div data-onboarding="dashboard-kpis">
                <KpiSlider>
                  {(gaCards || []).map((kpi, index) => (
                    <StatsCard key={`ga-${index}`} {...kpi} loading={gaLoading} />
                  ))}
                  {(gscCards || []).map((kpi, index) => (
                    <StatsCard key={`gsc-${index}`} {...kpi} loading={gscLoading} />
                  ))}
                </KpiSlider>
              </div>
            </>
          ) : !data?.gaConnected ? (
            <IntegrationCTA
              type="ga"
              icon={BarChart2}
              svgIcon={<GAIcon />}
              title={t.gaTitle}
              description={t.gaCtaDesc}
            />
          ) : null}

          {/* Traffic Overview Chart */}
          {loading ? (
            <DashboardCard title={t.trafficOverview}>
              <Skeleton width="100%" height="300px" borderRadius="lg" />
            </DashboardCard>
          ) : data?.gaConnected ? (
            <DashboardCard
              dataOnboarding="dashboard-chart"
              title={t.trafficOverview}
              headerRight={
                <DateRangeSelect
                  preset={chartPreset}
                  onPresetChange={handlePresetChange}
                  startDate={chartStartDate}
                  endDate={chartEndDate}
                  onStartChange={setChartStartDate}
                  onEndChange={setChartEndDate}
                  loading={chartLoading}
                />
              }
            >
              <div className={styles.chartContainer}>
                {/* Comparison summary KPIs above chart */}
                {activeComparison && !chartLoading && activeChartData?.length > 0 && (
                  <div className={styles.chartComparisonRow}>
                    <div className={styles.chartComparisonItem}>
                      <span className={styles.chartComparisonLabel}>{t.visitors || 'Visitors'}</span>
                      <span className={styles.chartComparisonValue}>{fmtNum(activeComparison.visitors)}</span>
                      <ChangeBadge value={activeComparison.visitorsChange} tooltip={changeTip(activeComparison.visitorsChange, { value: fmtNum(activeComparison.visitors), metric: t.visitors || 'Visitors', period: chartPeriod })} />
                    </div>
                    <div className={styles.chartComparisonItem}>
                      <span className={styles.chartComparisonLabel}>{t.pageViews || 'Page Views'}</span>
                      <span className={styles.chartComparisonValue}>{fmtNum(activeComparison.pageViews)}</span>
                      <ChangeBadge value={activeComparison.pageViewsChange} tooltip={changeTip(activeComparison.pageViewsChange, { value: fmtNum(activeComparison.pageViews), metric: t.pageViews || 'Page Views', period: chartPeriod })} />
                    </div>
                    <div className={styles.chartComparisonItem}>
                      <span className={styles.chartComparisonLabel}>{t.sessions || 'Sessions'}</span>
                      <span className={styles.chartComparisonValue}>{fmtNum(activeComparison.sessions)}</span>
                      <ChangeBadge value={activeComparison.sessionsChange} tooltip={changeTip(activeComparison.sessionsChange, { value: fmtNum(activeComparison.sessions), metric: t.sessions || 'Sessions', period: chartPeriod })} />
                    </div>
                  </div>
                )}
                {data?.tokenError ? (
                  <div className={styles.chartPlaceholder}>
                    <Activity size={48} className={styles.chartPlaceholderIcon} />
                    <p>{t.tokenError}</p>
                    <a href="/dashboard/settings?tab=integrations&reconnect=google" className={styles.reconnectLink}>
                      {t.reconnectGoogle}
                    </a>
                  </div>
                ) : activeChartData?.length > 0 ? (
                  <div className={chartLoading ? styles.chartLoadingWrap : undefined}>
                    {renderFancyChart()}
                    {chartLoading && (
                      <div className={styles.chartLoadingOverlay}>
                        <span>{t.loadingChart || 'Loading...'}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={styles.chartPlaceholder}>
                    <Activity size={48} className={styles.chartPlaceholderIcon} />
                    <p>{t.noTrafficData || 'No traffic data available for this date range.'}</p>
                  </div>
                )}
              </div>
            </DashboardCard>
          ) : null}

          {/* Top Keywords from GSC */}
          {loading ? (
            <DashboardCard title={t.topKeywords || 'Top Keywords'}>
              <Skeleton width="100%" height="250px" borderRadius="lg" />
            </DashboardCard>
          ) : data?.gscConnected && (data?.topQueries?.length > 0 || keywordsData !== null || data?.tokenError) ? (
            <DashboardCard
              dataOnboarding="dashboard-top-keywords"
              title={t.topKeywords || 'Top Keywords'}
              headerRight={!data?.tokenError ?
                <DateRangeSelect
                  preset={keywordsPreset}
                  onPresetChange={makePresetHandler(setKeywordsPreset, setKeywordsStartDate, setKeywordsEndDate, getGscDateRange)}
                  startDate={keywordsStartDate}
                  endDate={keywordsEndDate}
                  onStartChange={setKeywordsStartDate}
                  onEndChange={setKeywordsEndDate}
                  loading={keywordsLoading}
                />
              : null}
            >
              {data?.tokenError ? (
                <div className={styles.chartPlaceholder}>
                  <Activity size={48} className={styles.chartPlaceholderIcon} />
                  <p>{t.tokenError}</p>
                  <a href="/dashboard/settings?tab=integrations&reconnect=google" className={styles.reconnectLink}>
                    {t.reconnectGoogle}
                  </a>
                </div>
              ) : keywordsLoading ? (
                <div className={styles.chartPlaceholder}>
                  <Activity size={48} className={`${styles.chartPlaceholderIcon} ${styles.spinning}`} />
                </div>
              ) : (keywordsData ?? data?.topQueries)?.length > 0 ? (
                <GSCTable
                  rows={getSortedKeywords()}
                  variant="keywords"
                  period={getPeriodName(keywordsStartDate, keywordsEndDate, keywordsPreset)}
                  sortField={keywordSort}
                  onSortChange={setKeywordSort}
                />
              ) : (
                <div className={styles.chartPlaceholder}>
                  <p>{t.noDataForRange || 'No data available for this date range.'}</p>
                </div>
              )}
              {!keywordsLoading && (keywordsData ?? data?.topQueries)?.length > 0 && (
                <button
                  className={styles.viewAllKeywordsBtn}
                  onClick={() => setShowAllKeywords(true)}
                >
                  {t.viewAllKeywords || 'View all keywords'}
                  <ExternalLink size={13} />
                </button>
              )}
            </DashboardCard>
          ) : null}

          {/* Top Pages from GSC */}
          {loading ? (
            <DashboardCard title={t.topPages}>
              <Skeleton width="100%" height="250px" borderRadius="lg" />
            </DashboardCard>
          ) : data?.gscConnected && (data?.topPages?.length > 0 || pagesData !== null || data?.tokenError) ? (
            <DashboardCard
              dataOnboarding="dashboard-top-pages"
              title={t.topPages}
              headerRight={!data?.tokenError ?
                <DateRangeSelect
                  preset={pagesPreset}
                  onPresetChange={makePresetHandler(setPagesPreset, setPagesStartDate, setPagesEndDate, getGscDateRange)}
                  startDate={pagesStartDate}
                  endDate={pagesEndDate}
                  onStartChange={setPagesStartDate}
                  onEndChange={setPagesEndDate}
                  loading={pagesLoading}
                />
              : null}
            >
              {data?.tokenError ? (
                <div className={styles.chartPlaceholder}>
                  <Activity size={48} className={styles.chartPlaceholderIcon} />
                  <p>{t.tokenError}</p>
                  <a href="/dashboard/settings?tab=integrations&reconnect=google" className={styles.reconnectLink}>
                    {t.reconnectGoogle}
                  </a>
                </div>
              ) : pagesLoading ? (
                <div className={styles.chartPlaceholder}>
                  <Activity size={48} className={`${styles.chartPlaceholderIcon} ${styles.spinning}`} />
                </div>
              ) : (pagesData ?? data?.topPages)?.length > 0 ? (
                <GSCTable
                  rows={(pagesData ?? data?.topPages)?.slice(0, 5)}
                  variant="pages"
                  period={getPeriodName(pagesStartDate, pagesEndDate, pagesPreset)}
                />
              ) : (
                <div className={styles.chartPlaceholder}>
                  <p>{t.noDataForRange || 'No data available for this date range.'}</p>
                </div>
              )}
            </DashboardCard>
          ) : null}
        </div>

        {/* End Column */}
        <div className={styles.endColumn}>
          {/* AI Agent Activity - mounted once; flex `order` swaps its position
              based on hasAgentInsights so it doesn't remount + lose state when
              a freshly-finished analysis fills it with new insights. */}
          <div style={{ order: hasAgentInsights ? -1 : 1 }}>
            <AgentActivity translations={t} onInsightsLoaded={setHasAgentInsights} />
          </div>

          {/* AI Traffic Overview */}
          {loading ? (
            <>
              <div className={styles.dashboardSectionHeader} data-onboarding="dashboard-ai-traffic">
                <AIIcon />
                <h2 className={styles.dashboardSectionTitle}>{t.aiTrafficTitle || 'AI Traffic Overview'}</h2>
              </div>
              <div className={styles.aiKpiRow}>
                <Skeleton width="100%" height="80px" borderRadius="lg" />
                <Skeleton width="100%" height="80px" borderRadius="lg" />
              </div>
              <Skeleton width="100%" height="200px" borderRadius="lg" />
            </>
          ) : data?.gaConnected ? (
            <>
              <div className={styles.dashboardSectionHeader} data-onboarding="dashboard-ai-traffic">
                <AIIcon />
                <h2 className={styles.dashboardSectionTitle}>{t.aiTrafficTitle || 'AI Traffic Overview'}</h2>
                <div className={styles.dashboardSectionRight}>
                  <DateRangeSelect
                    preset={aiPreset}
                    onPresetChange={makePresetHandler(setAiPreset, setAiStartDate, setAiEndDate)}
                    startDate={aiStartDate}
                    endDate={aiEndDate}
                    onStartChange={setAiStartDate}
                    onEndChange={setAiEndDate}
                    loading={aiLoading}
                  />
                </div>
              </div>

              {aiLoading ? (
                <div className={styles.kpiGrid}>
                  {[1, 2].map(i => (
                    <Skeleton key={i} width="100%" height="120px" borderRadius="lg" />
                  ))}
                </div>
              ) : aiData ? (
                <>
                  {/* Row 1: Summary Cards */}
                  <div className={styles.aiKpiRow}>
                    <div className={`${styles.aiKpiCard} ${styles.hasTooltip}`} data-tooltip={t.tipAiSessions || 'Total sessions from AI engines like ChatGPT, Perplexity, Gemini, Claude, or Copilot.'}>
                      <div className={styles.aiKpiValue}>{fmtNum(aiData.totalAiSessions)}</div>
                      <div className={styles.aiKpiLabel}>{t.aiTotalSessions || 'AI Sessions'}</div>
                      {aiData.totalAiSessionsChange != null && (
                        <ChangeBadge value={aiData.totalAiSessionsChange} />
                      )}
                    </div>
                    <div className={`${styles.aiKpiCard} ${styles.hasTooltip}`} data-tooltip={t.tipAiShare || 'Percentage of your total site traffic from AI sources.'}>
                      <div className={styles.aiKpiValue}>{aiData.aiShare}%</div>
                      <div className={styles.aiKpiLabel}>{t.aiTrafficShare || 'AI Traffic Share'}</div>
                      {aiData.aiShareChange != null && (
                        <span className={`${styles.changeBadge} ${aiData.aiShareChange === 0 ? styles.changeBadgeNeutral : aiData.aiShareChange > 0 ? styles.changeBadgeUp : styles.changeBadgeDown}`}>
                          {aiData.aiShareChange === 0 ? '0% -' : <>{aiData.aiShareChange >= 0 ? '↑' : '↓'}{Math.abs(aiData.aiShareChange)}pp</>}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Row 1b: AI Engagement Quality KPIs */}
                  <div className={styles.aiKpiRow}>
                    <div className={`${styles.aiKpiCard} ${styles.hasTooltip}`} data-tooltip={t.tipAiEngagementRate || 'Share of AI sessions that engaged with your site.'}>
                      <div className={styles.aiKpiValue}>{aiData.aiEngagementRate ?? 0}%</div>
                      <div className={styles.aiKpiLabel}>{t.aiEngagementRate || 'AI Engagement Rate'}</div>
                      {aiData.aiEngagementRateChange != null && (
                        <span className={`${styles.changeBadge} ${aiData.aiEngagementRateChange === 0 ? styles.changeBadgeNeutral : aiData.aiEngagementRateChange > 0 ? styles.changeBadgeUp : styles.changeBadgeDown}`}>
                          {aiData.aiEngagementRateChange === 0 ? '0pp -' : <>{aiData.aiEngagementRateChange >= 0 ? '↑' : '↓'}{Math.abs(aiData.aiEngagementRateChange)}pp</>}
                        </span>
                      )}
                    </div>
                    <div className={`${styles.aiKpiCard} ${styles.hasTooltip}`} data-tooltip={t.tipAiAvgDuration || 'Average AI-referred session duration in seconds.'}>
                      <div className={styles.aiKpiValue}>{fmtDuration(aiData.aiAvgDuration || 0)}</div>
                      <div className={styles.aiKpiLabel}>{t.aiAvgDuration || 'Avg. AI Session Duration'}</div>
                      {aiData.aiAvgDurationChange != null && (
                        <ChangeBadge value={aiData.aiAvgDurationChange} />
                      )}
                    </div>
                    <div className={`${styles.aiKpiCard} ${styles.hasTooltip}`} data-tooltip={t.tipAiKeyEvents || 'Key events triggered during AI-referred sessions.'}>
                      <div className={styles.aiKpiValue}>{fmtNum(aiData.aiKeyEvents || 0)}</div>
                      <div className={styles.aiKpiLabel}>{t.aiKeyEvents || 'AI Key Events'}</div>
                      {aiData.aiKeyEventsChange != null && (
                        <ChangeBadge value={aiData.aiKeyEventsChange} />
                      )}
                    </div>
                  </div>

                  {/* Row 2: Engine breakdown with per-engine pages */}
                  <DashboardCard title={t.aiEngineBreakdown || 'Traffic by AI Engine'}>
                    {renderEngineBreakdown(aiData.engines, aiData.enginePages)}
                  </DashboardCard>

                  {/* Row 3: Daily timeseries (stacked by engine) - commented out per user request.
                  {aiData.dailyTimeseries?.length > 0 && (
                    <DashboardCard title={t.aiTimeseriesTitle || 'AI Sessions Over Time'}>
                      {renderAiTimeseriesChart(aiData.dailyTimeseries, aiData.engines)}
                    </DashboardCard>
                  )}
                  */}

                  {/* Row 4: Search terms on AI-linked pages (GSC queries on the same pages AI engines link to) */}
                  {(aiKeywords.length > 0 || data?.gscConnected) && (
                    <DashboardCard title={
                      <span
                        className={styles.hasTooltip}
                        data-tooltip={t.tipAiKeywords || "AI engines don't expose user prompts. This is the next-best signal: Google search queries that landed on the same pages AI engines are linking to."}
                      >
                        {t.aiKeywordsTitle || 'Search terms on AI-linked pages'}
                      </span>
                    }>
                      {renderAiKeywords(aiKeywords)}
                    </DashboardCard>
                  )}
                </>
              ) : (
                <div className={styles.chartPlaceholder}>
                  <p>{t.aiNoTraffic || 'No AI-referred traffic detected for this period.'}</p>
                </div>
              )}
            </>
          ) : null}

          {/* Quick Actions */}
          {/*
          <DashboardCard title={t.quickActions}>
            <QuickActions actions={quickActionsData} />
          </DashboardCard>
          */}
        </div>
      </div>

      {/* All GSC Keywords Modal */}
      {showAllKeywords && <AllGSCKeywordsModal />}

      {/* Generate Post Modal */}
      {generatePostKeyword && (
        <GeneratePostModal
          isOpen={!!generatePostKeyword}
          onClose={() => setGeneratePostKeyword(null)}
          keyword={generatePostKeyword}
          onSuccess={() => setGeneratePostKeyword(null)}
        />
      )}
    </>
  );
}
