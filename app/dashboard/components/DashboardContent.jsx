'use client';

import { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import Link from 'next/link';
import { 
  Activity, BarChart2, Search, Settings,
} from 'lucide-react';
import { useSite } from '@/app/context/site-context';
import { StatsCard, DashboardCard, ActivityItem, QuickActions, ProgressBar, KpiSlider } from '../components';
import { ArrowIcon } from '@/app/components/ui/arrow-icon';
import styles from '../page.module.css';

export default function DashboardContent({ translations }) {
  const t = translations;
  const { selectedSite } = useSite();

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

  // GA KPIs date range
  const [gaPreset, setGaPreset] = useState('30d');
  const gaDefault = getDateRange('30d');
  const [gaStartDate, setGaStartDate] = useState(gaDefault.start);
  const [gaEndDate, setGaEndDate] = useState(gaDefault.end);
  const [gaLoading, setGaLoading] = useState(false);
  const [gaData, setGaData] = useState(null);

  // GSC KPIs date range
  const [gscPreset, setGscPreset] = useState('30d');
  const gscDefault = getDateRange('30d');
  const [gscStartDate, setGscStartDate] = useState(gscDefault.start);
  const [gscEndDate, setGscEndDate] = useState(gscDefault.end);
  const [gscLoading, setGscLoading] = useState(false);
  const [gscData, setGscData] = useState(null);

  // Top Keywords date range
  const [keywordsPreset, setKeywordsPreset] = useState('30d');
  const keywordsDefault = getDateRange('30d');
  const [keywordsStartDate, setKeywordsStartDate] = useState(keywordsDefault.start);
  const [keywordsEndDate, setKeywordsEndDate] = useState(keywordsDefault.end);
  const [keywordsLoading, setKeywordsLoading] = useState(false);
  const [keywordsData, setKeywordsData] = useState(null);

  // Top Pages date range
  const [pagesPreset, setPagesPreset] = useState('30d');
  const pagesDefault = getDateRange('30d');
  const [pagesStartDate, setPagesStartDate] = useState(pagesDefault.start);
  const [pagesEndDate, setPagesEndDate] = useState(pagesDefault.end);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [pagesData, setPagesData] = useState(null);

  // AI Traffic date range
  const [aiPreset, setAiPreset] = useState('30d');
  const aiDefault = getDateRange('30d');
  const [aiStartDate, setAiStartDate] = useState(aiDefault.start);
  const [aiEndDate, setAiEndDate] = useState(aiDefault.end);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiData, setAiData] = useState(null);
  // const [aiKeywords, setAiKeywords] = useState([]);
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

    fetchData();
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

  // ─── Generic preset handler factory ───
  const makePresetHandler = (setPreset, setStart, setEnd) => (e) => {
    const value = e.target.value;
    setPreset(value);
    if (value !== 'custom') {
      const range = getDateRange(value);
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
      // setAiKeywords(json.aiKeywords || []);

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
          <input
            type="date"
            className={styles.chartDateInput}
            value={startDate}
            onChange={(e) => onStartChange(e.target.value)}
            max={endDate}
          />
          <span className={styles.chartDateSeparator}>—</span>
          <input
            type="date"
            className={styles.chartDateInput}
            value={endDate}
            onChange={(e) => onEndChange(e.target.value)}
            min={startDate}
            max={fmtDate(new Date())}
          />
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
    const fmt = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
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
    const fmt = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    return `${t.vsPrefix || 'vs'} ${fmt(s)} – ${fmt(e)}`;
  };

  // Format number with locale separator
  const fmtNum = (n) => {
    if (n == null) return '—';
    return Number(n).toLocaleString();
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
        {isZero ? '0% —' : <>{isUp ? '↑' : '↓'}{Math.abs(value)}%</>}
      </span>
    );
  };

  // Active comparison data (from chart refetch or initial load)
  const activeComparison = chartComparison ?? data?.trafficComparison;
  const chartPeriod = getPeriodName(chartStartDate, chartEndDate, chartPreset);

  // GA KPI cards — use section-specific data if available
  const activeGa = gaData ?? data?.ga;
  const gaCompareLabel = getComparisonLabel(gaStartDate, gaEndDate, gaPreset);
  const gaPeriod = getPeriodName(gaStartDate, gaEndDate, gaPreset);
  const cardTip = (label, change, period) => {
    if (change == null) return undefined;
    if (change === 0) return tpl(t.tipCardNoChange || '{label} — no change compared to {period}', { label, period });
    const tmpl = change > 0
      ? (t.tipCardUp || '{label} is up {percent}% compared to {period}')
      : (t.tipCardDown || '{label} is down {percent}% compared to {period}');
    return tpl(tmpl, { label, percent: Math.abs(change), period });
  };

  // Inline change tooltip helper (for ChangeBadge in tables/chart)
  const changeTip = (change, { value, metric, period } = {}) => {
    if (change == null) return undefined;
    if (change === 0) return tpl(t.tipNoChange || '{value} {metric} — no change from {period}', { value, metric, period });
    const tmpl = change > 0
      ? (t.tipMoreFromPrev || '{value} {metric} — {percent}% more than {period}')
      : (t.tipLessFromPrev || '{value} {metric} — {percent}% less than {period}');
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
      color: 'blue',
    },
    {
      iconName: 'Clock',
      value: activeGa.avgSessionDuration || '—',
      label: t.avgSessionDuration,
      ...trendOf(activeGa.avgSessionDurationChange),
      trendLabel: gaCompareLabel,
      trendTooltip: cardTip(t.avgSessionDuration, activeGa.avgSessionDurationChange, gaPeriod),
      badge: <GAIcon />,
      badgeTooltip: t.dataFromGA,
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
      color: 'green',
    },
  ] : null;

  // GSC KPI cards — use section-specific data if available
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
      color: 'green',
    },
  ] : null;

  // ─── Fancy SVG Area Chart ───
  const chartRef = useRef(null);
  const tooltipRef = useRef(null);
  const wrapRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);

  // Use custom-fetched chart data if available, otherwise fall back to initial data
  const activeChartData = chartData ?? data?.trafficChart ?? [];

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

    const maxVisitors = Math.max(...chartItems.map(d => d.visitors), 1);
    const maxPV = Math.max(...chartItems.map(d => d.pageViews), 1);
    const maxY = Math.max(maxVisitors, maxPV);
    // Nice round ceiling
    const ceil = Math.ceil(maxY / 10) * 10 || 10;

    const xOf = (i) => padL + (i / (chartItems.length - 1)) * innerW;
    const yOf = (v) => padT + innerH - (v / ceil) * innerH;

    // Build smooth path via monotone cubic interpolation
    const buildPath = (field) => {
      const pts = chartItems.map((d, i) => ({ x: xOf(i), y: yOf(d[field]) }));
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

    const visitorsPath = buildPath('visitors');
    const pageViewsPath = buildPath('pageViews');
    const visitorsArea = buildArea('visitors');
    const pageViewsArea = buildArea('pageViews');

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
      });
    };

    const handleMouseLeave = () => setTooltip(null);

    return (
      <div className={styles.fancyChartWrap} ref={wrapRef}>
        {/* Legend */}
        <div className={styles.chartLegend}>
          <span className={`${styles.chartLegendItem} ${styles.hasTooltip}`} data-tooltip={t.tipVisitorsLegend || 'Unique users who visited your site via organic search. One person visiting 5 pages counts as 1 visitor.'}>
            <span className={styles.chartLegendDot} style={{ background: '#8b5cf6' }} />
            {t.visitors || 'Visitors'}
          </span>
          <span className={`${styles.chartLegendItem} ${styles.hasTooltip}`} data-tooltip={t.tipPageViewsLegend || 'Every single page load across your site. One person visiting 5 pages counts as 5 page views.'}>
            <span className={styles.chartLegendDot} style={{ background: '#06b6d4' }} />
            {t.pageViews || 'Page Views'}
          </span>
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
          </defs>

          {/* Grid lines */}
          {gridLines.map(({ y, val }, i) => (
            <g key={i}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="3,3" />
              <text x={padL - 6} y={y + 3} textAnchor="end" fill="var(--muted-foreground)" fontSize="9" fontFamily="inherit">
                {val}
              </text>
            </g>
          ))}

          {/* Areas */}
          <path d={pageViewsArea} fill="url(#pvGrad)" />
          <path d={visitorsArea} fill="url(#visitorsGrad)" />

          {/* Lines */}
          <path d={pageViewsPath} fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" />
          <path d={visitorsPath} fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" />

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
              <circle cx={tooltip.x} cy={yOf(tooltip.visitors)} r="4" fill="#8b5cf6" stroke="white" strokeWidth="2" />
              <circle cx={tooltip.x} cy={yOf(tooltip.pageViews)} r="4" fill="#06b6d4" stroke="white" strokeWidth="2" />
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
            <div className={styles.chartTooltipRow}>
              <span className={styles.chartTooltipDot} style={{ background: '#8b5cf6' }} />
              {t.visitors || 'Visitors'}: <strong>{fmtNum(tooltip.visitors)}</strong>
            </div>
            <div className={styles.chartTooltipRow}>
              <span className={styles.chartTooltipDot} style={{ background: '#06b6d4' }} />
              {t.pageViews || 'Page Views'}: <strong>{fmtNum(tooltip.pageViews)}</strong>
            </div>
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

  // Top pages table
  const renderTopPages = () => {
    const activePages = pagesData ?? data?.topPages;
    if (!activePages?.length) return null;
    const pagesPeriod = getPeriodName(pagesStartDate, pagesEndDate, pagesPreset);
    return (
      <div className={styles.topPagesTable}>
        <div className={styles.topPagesHeader}>
          <span className={styles.topPagesColPage}>{t.page}</span>
          <span className={styles.topPagesColNum}>{t.clicks}</span>
          <span className={styles.topPagesColNum}>{t.impressions}</span>
          <span className={styles.topPagesColNum}>{t.ctr}</span>
          <span className={styles.topPagesColNum}>{t.position}</span>
        </div>
        {activePages.slice(0, 5).map((row, i) => {
          let display = row.page;
          try {
            const u = new URL(row.page);
            display = u.hostname + (u.pathname === '/' ? '' : decodeURIComponent(u.pathname));
          } catch { /* keep raw */ }
          return (
            <div key={i} className={styles.topPagesRow}>
              <span className={styles.topPagesColPage} title={row.page}>
                {display}
              </span>
              <span className={styles.topPagesColNum}>{fmtNum(row.clicks)} <ChangeBadge value={row.clicksChange} tooltip={changeTip(row.clicksChange, { value: fmtNum(row.clicks), metric: t.clicks, period: pagesPeriod })} /></span>
              <span className={styles.topPagesColNum}>{fmtNum(row.impressions)} <ChangeBadge value={row.impressionsChange} tooltip={changeTip(row.impressionsChange, { value: fmtNum(row.impressions), metric: t.impressions, period: pagesPeriod })} /></span>
              <span className={styles.topPagesColNum}>{row.ctr}%</span>
              <span className={styles.topPagesColNum}>{row.position}</span>
            </div>
          );
        })}
      </div>
    );
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
                    let displayPath = row.page;
                    try {
                      displayPath = decodeURIComponent(row.page);
                      if (displayPath === '/') displayPath = '/ (Homepage)';
                    } catch { /* keep raw */ }
                    return (
                      <div key={j} className={styles.aiEnginePageRow}>
                        <div className={styles.aiEnginePageInfo}>
                          {row.keyword && (
                            <span className={styles.aiEngineKeyword} title={row.keyword}>
                              {row.keyword}
                            </span>
                          )}
                          <span className={styles.aiEnginePagePath} title={row.page}>{displayPath}</span>
                        </div>
                        <span className={styles.aiEnginePageSessions}>{fmtNum(row.sessions)}</span>
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

  // ── AI Keywords – disabled for now ──
  // const renderAiKeywords = (queries) => {
  //   if (!queries?.length) return <p className={styles.noDataMsg}>{t.aiNoKeywordsData || 'No AI-related keywords found for this period.'}</p>;
  //   return (
  //     <div className={styles.aiOverviewTable}>
  //       <div className={styles.aiOverviewHeader}>
  //         <span className={styles.aiOverviewColQuery}>{t.aiQuery || 'Query'}</span>
  //         <span className={styles.aiOverviewColClicks}>{t.clicks || 'Clicks'}</span>
  //         <span className={styles.aiOverviewColImpr}>{t.impressions || 'Impr.'}</span>
  //         <span className={styles.aiOverviewColCtr}>{t.ctr || 'CTR'}</span>
  //       </div>
  //       {queries.map((row, i) => {
  //         let displayPage = row.page;
  //         try {
  //           displayPage = decodeURIComponent(new URL(row.page).pathname);
  //           if (displayPage === '/') displayPage = '/ (Homepage)';
  //         } catch {
  //           try { displayPage = decodeURIComponent(row.page); } catch { /* keep */ }
  //         }
  //         return (
  //           <div key={i} className={styles.aiOverviewRow}>
  //             <div className={styles.aiOverviewColQuery}>
  //               <span className={styles.aiOverviewQueryText} title={row.query}>{row.query}</span>
  //               <span className={styles.aiOverviewPagePath} title={row.page}>{displayPage}</span>
  //             </div>
  //             <span className={styles.aiOverviewColClicks}>{fmtNum(row.clicks)}</span>
  //             <span className={styles.aiOverviewColImpr}>{fmtNum(row.impressions)}</span>
  //             <span className={styles.aiOverviewColCtr}>{row.ctr}%</span>
  //           </div>
  //         );
  //       })}
  //     </div>
  //   );
  // };
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

  const renderTopKeywords = () => {
    const keywords = getSortedKeywords();
    if (!keywords.length) return null;
    const kwPeriod = getPeriodName(keywordsStartDate, keywordsEndDate, keywordsPreset);

    return (
      <div className={styles.topKeywordsSection}>
        {/* Header with sort selector */}
        <div className={styles.topKeywordsHeader}>
          <div className={styles.topKeywordsSortWrap}>
            <label className={styles.topKeywordsSortLabel}>{t.sortBy || 'Sort by'}:</label>
            <select
              className={styles.topKeywordsSelect}
              value={keywordSort}
              onChange={(e) => setKeywordSort(e.target.value)}
            >
              <option value="clicks">{t.clicks}</option>
              <option value="impressions">{t.impressions}</option>
              <option value="ctr">{t.ctr}</option>
              <option value="position">{t.position}</option>
            </select>
          </div>
        </div>

        {/* Keywords table */}
        <div className={styles.topKeywordsTable}>
          <div className={styles.topKeywordsTableHeader}>
            <span className={styles.topKeywordsColRank}>#</span>
            <span className={styles.topKeywordsColQuery}>{t.keyword || 'Keyword'}</span>
            <span className={styles.topKeywordsColNum}>{t.clicks}</span>
            <span className={styles.topKeywordsColNum}>{t.impressions}</span>
            <span className={styles.topKeywordsColNum}>{t.ctr}</span>
            <span className={styles.topKeywordsColNum}>{t.position}</span>
          </div>
          {keywords.map((row, i) => (
            <div key={i} className={styles.topKeywordsRow}>
              <span className={styles.topKeywordsColRank}>
                <span className={styles.topKeywordsRankBadge}>{i + 1}</span>
              </span>
              <span className={styles.topKeywordsColQuery} title={row.query}>
                {row.query}
              </span>
              <span className={`${styles.topKeywordsColNum} ${keywordSort === 'clicks' ? styles.topKeywordsHighlight : ''}`}>
                {fmtNum(row.clicks)}
                <ChangeBadge value={row.clicksChange} tooltip={changeTip(row.clicksChange, { value: fmtNum(row.clicks), metric: t.clicks, period: kwPeriod })} />
              </span>
              <span className={`${styles.topKeywordsColNum} ${keywordSort === 'impressions' ? styles.topKeywordsHighlight : ''}`}>
                {fmtNum(row.impressions)}
                <ChangeBadge value={row.impressionsChange} tooltip={changeTip(row.impressionsChange, { value: fmtNum(row.impressions), metric: t.impressions, period: kwPeriod })} />
              </span>
              <span className={`${styles.topKeywordsColNum} ${keywordSort === 'ctr' ? styles.topKeywordsHighlight : ''}`}>
                {row.ctr}%
              </span>
              <span className={`${styles.topKeywordsColNum} ${keywordSort === 'position' ? styles.topKeywordsHighlight : ''}`}>
                {row.position}
                <ChangeBadge value={row.positionChange} tooltip={positionTip(row.positionChange, kwPeriod)} />
              </span>
            </div>
          ))}
        </div>
      </div>
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

  // Loading skeleton
  const SectionSkeleton = ({ height = 200, count = 1 }) => (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={styles.cardSkeleton} style={{ height }}>
          <div className={styles.skeletonShimmer} />
        </div>
      ))}
    </>
  );

  const KpiSkeleton = ({ count = 3 }) => (
    <div className={styles.kpiSkeletonRow}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={styles.kpiSkeleton}>
          <div className={styles.skeletonShimmer} />
        </div>
      ))}
    </div>
  );

  return (
    <>
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
          {/* GA4 + GSC KPIs — unified slider */}
          {loading ? (
            <KpiSkeleton count={3} />
          ) : (data?.gaConnected || data?.gscConnected) && (gaCards || gscCards) ? (
            <>
              <div className={styles.dashboardSectionHeader}>
                {data?.gaConnected && (
                  <div className={styles.kpiDateGroup}>
                    <GAIcon />
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
                    <GSCIcon />
                    <DateRangeSelect
                      preset={gscPreset}
                      onPresetChange={makePresetHandler(setGscPreset, setGscStartDate, setGscEndDate)}
                      startDate={gscStartDate}
                      endDate={gscEndDate}
                      onStartChange={setGscStartDate}
                      onEndChange={setGscEndDate}
                      loading={gscLoading}
                    />
                  </div>
                )}
              </div>
              <KpiSlider>
                {[...(gaCards || []), ...(gscCards || [])].map((kpi, index) => (
                  <StatsCard key={index} {...kpi} />
                ))}
              </KpiSlider>
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
            <SectionSkeleton height={300} />
          ) : data?.gaConnected ? (
            <DashboardCard
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
                ) : chartLoading ? (
                  <div className={styles.chartPlaceholder}>
                    <Activity size={48} className={`${styles.chartPlaceholderIcon} ${styles.spinning}`} />
                    <p>{t.loadingChart || 'Loading chart data...'}</p>
                  </div>
                ) : activeChartData?.length > 0 ? (
                  renderFancyChart()
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
            <SectionSkeleton height={250} />
          ) : data?.gscConnected && (data?.topQueries?.length > 0 || keywordsData !== null) ? (
            <DashboardCard
              title={t.topKeywords || 'Top Keywords'}
              headerRight={
                <DateRangeSelect
                  preset={keywordsPreset}
                  onPresetChange={makePresetHandler(setKeywordsPreset, setKeywordsStartDate, setKeywordsEndDate)}
                  startDate={keywordsStartDate}
                  endDate={keywordsEndDate}
                  onStartChange={setKeywordsStartDate}
                  onEndChange={setKeywordsEndDate}
                  loading={keywordsLoading}
                />
              }
            >
              {keywordsLoading ? (
                <div className={styles.chartPlaceholder}>
                  <Activity size={48} className={`${styles.chartPlaceholderIcon} ${styles.spinning}`} />
                </div>
              ) : (keywordsData ?? data?.topQueries)?.length > 0 ? (
                renderTopKeywords()
              ) : (
                <div className={styles.chartPlaceholder}>
                  <p>{t.noDataForRange || 'No data available for this date range.'}</p>
                </div>
              )}
            </DashboardCard>
          ) : null}

          {/* Top Pages from GSC */}
          {loading ? (
            <SectionSkeleton height={250} />
          ) : data?.gscConnected && (data?.topPages?.length > 0 || pagesData !== null) ? (
            <DashboardCard
              title={t.topPages}
              headerRight={
                <DateRangeSelect
                  preset={pagesPreset}
                  onPresetChange={makePresetHandler(setPagesPreset, setPagesStartDate, setPagesEndDate)}
                  startDate={pagesStartDate}
                  endDate={pagesEndDate}
                  onStartChange={setPagesStartDate}
                  onEndChange={setPagesEndDate}
                  loading={pagesLoading}
                />
              }
            >
              {pagesLoading ? (
                <div className={styles.chartPlaceholder}>
                  <Activity size={48} className={`${styles.chartPlaceholderIcon} ${styles.spinning}`} />
                </div>
              ) : (pagesData ?? data?.topPages)?.length > 0 ? (
                renderTopPages()
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
          {/* AI Traffic Overview */}
          {loading ? (
            <>
              <SectionSkeleton height={80} />
              <SectionSkeleton height={200} />
            </>
          ) : data?.gaConnected ? (
            <>
              <div className={styles.dashboardSectionHeader}>
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
                    <div key={i} className={styles.kpiSkeleton}><div className={styles.skeletonShimmer} /></div>
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
                          {aiData.aiShareChange === 0 ? '0% —' : <>{aiData.aiShareChange >= 0 ? '↑' : '↓'}{Math.abs(aiData.aiShareChange)}pp</>}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Row 2: Engine breakdown with per-engine pages */}
                  <DashboardCard title={t.aiEngineBreakdown || 'Traffic by AI Engine'}>
                    {renderEngineBreakdown(aiData.engines, aiData.enginePages)}
                  </DashboardCard>

                  {/* Row 3: AI Keywords — disabled for now
                  {(aiKeywords.length > 0 || data?.gscConnected) && (
                    <DashboardCard title={t.aiKeywordsTitle || 'AI Traffic — Keywords'}>
                      {renderAiKeywords(aiKeywords)}
                    </DashboardCard>
                  )}
                  */}

                  {/* Row 3: Inferred AI Queries
                  <DashboardCard title={t.inferredQueriesTitle || 'Inferred AI Queries'}>
                    {renderInferredQueries()}
                  </DashboardCard>
                  */}
                </>
              ) : (
                <div className={styles.chartPlaceholder}>
                  <p>{t.aiNoTraffic || 'No AI-referred traffic detected for this period.'}</p>
                </div>
              )}
            </>
          ) : null}

          {/* AI Agent Activity */}
          <DashboardCard title={t.aiAgentActivity}>
            <div className={styles.activityList}>
              {(t.activityData || []).map((item, index) => (
                <ActivityItem
                  key={index}
                  dotColor={item.dotColor}
                  text={item.action}
                  time={item.time}
                />
              ))}
            </div>
            <Link href="/dashboard/automations" className={styles.viewAllLink}>
              {t.viewAllActivity}
              <ArrowIcon size={16} />
            </Link>
          </DashboardCard>

          {/* Quick Actions */}
          <DashboardCard title={t.quickActions}>
            <QuickActions actions={quickActionsData} />
          </DashboardCard>
        </div>
      </div>
    </>
  );
}
