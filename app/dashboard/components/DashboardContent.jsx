'use client';

import { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import Link from 'next/link';
import { 
  Activity, BarChart2, Search, Settings,
} from 'lucide-react';
import { useSite } from '@/app/context/site-context';
import { StatsCard, DashboardCard, ActivityItem, QuickActions, ProgressBar } from '../components';
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

  const [chartPreset, setChartPreset] = useState('7d');
  const defaultRange = getDateRange('7d');
  const [chartStartDate, setChartStartDate] = useState(defaultRange.start);
  const [chartEndDate, setChartEndDate] = useState(defaultRange.end);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartData, setChartData] = useState(null); // null = use data.trafficChart

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
      const res = await fetch(
        `/api/dashboard/stats/traffic-chart?siteId=${selectedSite.id}&startDate=${chartStartDate}&endDate=${chartEndDate}`
      );
      if (!res.ok) throw new Error('Failed to fetch chart');
      const json = await res.json();
      setChartData(json.trafficChart || []);
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
      const res = await fetch(
        `/api/dashboard/stats/ga-kpis?siteId=${selectedSite.id}&startDate=${gaStartDate}&endDate=${gaEndDate}`
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
      const res = await fetch(
        `/api/dashboard/stats/gsc?siteId=${selectedSite.id}&section=kpis&startDate=${gscStartDate}&endDate=${gscEndDate}`
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
      const res = await fetch(
        `/api/dashboard/stats/gsc?siteId=${selectedSite.id}&section=topKeywords&startDate=${keywordsStartDate}&endDate=${keywordsEndDate}`
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
      const res = await fetch(
        `/api/dashboard/stats/gsc?siteId=${selectedSite.id}&section=topPages&startDate=${pagesStartDate}&endDate=${pagesEndDate}`
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

  // Format number with locale separator
  const fmtNum = (n) => {
    if (n == null) return '—';
    return Number(n).toLocaleString();
  };

  const trendOf = (change) => {
    if (change == null) return { trend: null, trendValue: null };
    const sign = change >= 0 ? '+' : '';
    return {
      trend: change >= 0 ? 'up' : 'down',
      trendValue: `${sign}${change}%`,
    };
  };

  // GA KPI cards — use section-specific data if available
  const activeGa = gaData ?? data?.ga;
  const gaCards = activeGa ? [
    {
      iconName: 'Users',
      value: fmtNum(activeGa.visitors),
      label: t.organicVisitors,
      ...trendOf(activeGa.visitorsChange),
      color: 'purple',
    },
    {
      iconName: 'FileText',
      value: fmtNum(activeGa.pageViews),
      label: t.totalPageViews,
      ...trendOf(activeGa.pageViewsChange),
      color: 'blue',
    },
    {
      iconName: 'Clock',
      value: activeGa.avgSessionDuration || '—',
      label: t.avgSessionDuration,
      ...trendOf(activeGa.avgSessionDurationChange),
      color: 'orange',
    },
    {
      iconName: 'BarChart2',
      value: fmtNum(activeGa.sessions),
      label: t.sessions,
      ...trendOf(activeGa.sessionsChange),
      color: 'green',
    },
  ] : null;

  // GSC KPI cards — use section-specific data if available
  const activeGsc = gscData ?? data?.gsc;
  const gscCards = activeGsc ? [
    {
      iconName: 'MousePointer',
      value: fmtNum(activeGsc.clicks),
      label: t.totalClicks,
      ...trendOf(activeGsc.clicksChange),
      color: 'purple',
    },
    {
      iconName: 'Eye',
      value: fmtNum(activeGsc.impressions),
      label: t.totalImpressions,
      ...trendOf(activeGsc.impressionsChange),
      color: 'blue',
    },
    {
      iconName: 'Target',
      value: `${activeGsc.ctr}%`,
      label: t.avgCtr,
      ...trendOf(activeGsc.ctrChange),
      color: 'orange',
    },
    {
      iconName: 'TrendingUp',
      value: activeGsc.position,
      label: t.avgPosition,
      ...trendOf(activeGsc.positionChange),
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
          <span className={styles.chartLegendItem}>
            <span className={styles.chartLegendDot} style={{ background: '#8b5cf6' }} />
            {t.visitors || 'Visitors'}
          </span>
          <span className={styles.chartLegendItem}>
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
              <span className={styles.topPagesColNum}>{fmtNum(row.clicks)}</span>
              <span className={styles.topPagesColNum}>{fmtNum(row.impressions)}</span>
              <span className={styles.topPagesColNum}>{row.ctr}%</span>
              <span className={styles.topPagesColNum}>{row.position}</span>
            </div>
          );
        })}
      </div>
    );
  };

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
              </span>
              <span className={`${styles.topKeywordsColNum} ${keywordSort === 'impressions' ? styles.topKeywordsHighlight : ''}`}>
                {fmtNum(row.impressions)}
              </span>
              <span className={`${styles.topKeywordsColNum} ${keywordSort === 'ctr' ? styles.topKeywordsHighlight : ''}`}>
                {row.ctr}%
              </span>
              <span className={`${styles.topKeywordsColNum} ${keywordSort === 'position' ? styles.topKeywordsHighlight : ''}`}>
                {row.position}
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

  // Google Analytics SVG Icon
  const GAIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="14" width="4" height="6" rx="1" fill="#F9AB00"/>
      <rect x="10" y="8" width="4" height="12" rx="1" fill="#E37400"/>
      <rect x="16" y="4" width="4" height="16" rx="1" fill="#E37400"/>
    </svg>
  );

  // Google Search Console SVG Icon
  const GSCIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5z" fill="#4285F4"/>
      <path d="M7 12l2 2 4-5" stroke="#34A853" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );

  // Quick actions
  const quickActionsData = [
    { label: t.contentPlanner, href: '/dashboard/strategy/content-planner', iconName: 'FileText' },
    { label: t.keywords, href: '/dashboard/strategy/keywords', iconName: 'Target' },
    { label: t.siteAudit, href: '/dashboard/technical-seo/site-audit', iconName: 'Activity' },
  ];

  // Loading skeleton
  if (loading) {
    return (
      <>
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>{t.commandCenter}</h1>
            <p className={styles.pageSubtitle}>{t.subtitle}</p>
          </div>
        </div>
        <div className={styles.kpiGrid}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className={styles.kpiSkeleton}>
              <div className={styles.skeletonShimmer} />
            </div>
          ))}
        </div>
        <div className={styles.mainGrid}>
          <div className={styles.leftColumn}>
            <div className={styles.cardSkeleton}><div className={styles.skeletonShimmer} /></div>
          </div>
          <div className={styles.rightColumn}>
            <div className={styles.cardSkeleton}><div className={styles.skeletonShimmer} /></div>
          </div>
        </div>
      </>
    );
  }

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
        {/* Left Column */}
        <div className={styles.leftColumn}>
          {/* Google Analytics KPIs */}
          {data?.gaConnected && gaCards ? (
            <>
              <div className={styles.dashboardSectionHeader}>
                <GAIcon />
                <h2 className={styles.dashboardSectionTitle}>{t.gaTitle}</h2>
                <div className={styles.dashboardSectionRight}>
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
              </div>
              <div className={`${styles.kpiGrid} ${gaLoading ? styles.sectionLoading : ''}`}>
                {gaCards.map((kpi, index) => (
                  <StatsCard key={index} {...kpi} />
                ))}
              </div>
            </>
          ) : (
            <IntegrationCTA
              type="ga"
              icon={BarChart2}
              svgIcon={<GAIcon />}
              title={t.gaTitle}
              description={t.gaCtaDesc}
            />
          )}

          {/* Google Search Console KPIs */}
          {data?.gscConnected && gscCards ? (
            <>
              <div className={styles.dashboardSectionHeader}>
                <GSCIcon />
                <h2 className={styles.dashboardSectionTitle}>{t.gscTitle}</h2>
                <div className={styles.dashboardSectionRight}>
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
              </div>
              <div className={`${styles.kpiGrid} ${gscLoading ? styles.sectionLoading : ''}`}>
                {gscCards.map((kpi, index) => (
                  <StatsCard key={index} {...kpi} />
                ))}
              </div>
            </>
          ) : !data?.gaConnected ? null : (
            <IntegrationCTA
              type="gsc"
              icon={Search}
              svgIcon={<GSCIcon />}
              title={t.gscTitle}
              description={t.gscCtaDesc}
            />
          )}

          {/* Traffic Overview Chart */}
          {data?.gaConnected ? (
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
          {data?.gscConnected && (data?.topQueries?.length > 0 || keywordsData !== null) ? (
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
          {data?.gscConnected && (data?.topPages?.length > 0 || pagesData !== null) ? (
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

        {/* Right Column */}
        <div className={styles.rightColumn}>
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
