'use client';

import { useState, useEffect, useRef, useId } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  Monitor,
  Smartphone,
  Maximize2,
  Sparkles,
  Loader2,
  Clock,
  FileSearch,
  ExternalLink,
  Camera,
  TrendingUp,
  TrendingDown,
  Minus,
  PartyPopper,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { toImgSrc } from '../lib/img-src';
import styles from './AuditOverviewTab.module.css';

/* ───────────────────────────────────────────────────────────
   Color gradient by score - smooth interpolation
   0 red → 30 orange → 60 yellow → 85 green
   ─────────────────────────────────────────────────────────── */

const GRADIENT_STOPS = [
  { at: 0,   r: 239, g: 68,  b: 68  }, // red
  { at: 30,  r: 249, g: 115, b: 22  }, // orange
  { at: 60,  r: 234, g: 179, b: 8   }, // yellow
  { at: 85,  r: 34,  g: 197, b: 94  }, // green
  { at: 100, r: 34,  g: 197, b: 94  }, // green (hold)
];

function lerpColor(score) {
  const s = Math.max(0, Math.min(100, score));
  // Find the two stops we're between
  let lo = GRADIENT_STOPS[0];
  let hi = GRADIENT_STOPS[GRADIENT_STOPS.length - 1];
  for (let i = 0; i < GRADIENT_STOPS.length - 1; i++) {
    if (s >= GRADIENT_STOPS[i].at && s <= GRADIENT_STOPS[i + 1].at) {
      lo = GRADIENT_STOPS[i];
      hi = GRADIENT_STOPS[i + 1];
      break;
    }
  }
  const range = hi.at - lo.at || 1;
  const t = (s - lo.at) / range;
  const r = Math.round(lo.r + (hi.r - lo.r) * t);
  const g = Math.round(lo.g + (hi.g - lo.g) * t);
  const b = Math.round(lo.b + (hi.b - lo.b) * t);
  return { r, g, b };
}

function getPalette(score) {
  const { r, g, b } = lerpColor(score);
  return {
    ring: `rgb(${r},${g},${b})`,
    fill: `rgba(${r},${g},${b},0.12)`,
    w1:   `rgba(${r},${g},${b},0.5)`,
    w2:   `rgba(${r},${g},${b},0.3)`,
  };
}

/* ───────────────────────────────────────────────────────────
   useAnimatedScore - counts from 0 → target over ~1.2s
   ─────────────────────────────────────────────────────────── */

function useAnimatedScore(target, duration = 4000) {
  const [current, setCurrent] = useState(0);
  const rafRef = useRef(null);
  const startRef = useRef(null);

  useEffect(() => {
    const to = Math.max(0, Math.min(100, target ?? 0));
    if (to === 0) { setCurrent(0); return; }

    setCurrent(0);
    startRef.current = null;

    function tick(ts) {
      if (!startRef.current) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(eased * to));
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  return current;
}

/* ───────────────────────────────────────────────────────────
   WaveSVG - reusable SVG wave-fill circle (no wrapper div)
   ─────────────────────────────────────────────────────────── */

function WaveSVG({ animatedScore, size, noData }) {
  const clipId = useId();
  const fillPct = Math.max(0, Math.min(100, animatedScore));
  const r = size / 2;
  const cx = r;
  const cy = r;
  const circleR = r - 3;
  const baseY = size - (fillPct / 100) * size;
  const palette = getPalette(animatedScore);
  // wave amplitude scales with size
  const amp = size * 0.07;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <clipPath id={clipId}>
          <circle cx={cx} cy={cy} r={circleR} />
        </clipPath>
      </defs>

      {/* Background circle */}
      <circle cx={cx} cy={cy} r={circleR} className={styles.waveBg} />

      {/* Wave fill - clipped to circle */}
      {fillPct > 0 && (
        <g clipPath={`url(#${clipId})`}>
          <rect x="0" y={baseY} width={size} height={size} fill={palette.fill} />
          <path
            className={styles.wavePath1}
            fill={palette.w1}
            d={
              `M0 ${baseY} ` +
              `Q${size * 0.25} ${baseY - amp} ${size * 0.5} ${baseY} ` +
              `Q${size * 0.75} ${baseY + amp} ${size} ${baseY} ` +
              `V${size} H0 Z`
            }
          />
          <path
            className={styles.wavePath2}
            fill={palette.w2}
            d={
              `M0 ${baseY + 2} ` +
              `Q${size * 0.25} ${baseY + amp + 2} ${size * 0.5} ${baseY + 2} ` +
              `Q${size * 0.75} ${baseY - amp + 2} ${size} ${baseY + 2} ` +
              `V${size} H0 Z`
            }
          />
        </g>
      )}

      {/* Border ring */}
      <circle
        cx={cx} cy={cy} r={circleR}
        fill="none"
        stroke={palette.ring}
        strokeWidth="2.5"
      />

      {/* Score number */}
      <text
        x={cx} y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        className={styles.waveScoreText}
        style={{ fontSize: size * (noData ? 0.22 : 0.28) }}
      >
        {noData ? 'N/A' : animatedScore}
      </text>
    </svg>
  );
}

/* ───────────────────────────────────────────────────────────
   WaveCircle - small category circle with label
   ─────────────────────────────────────────────────────────── */

function WaveCircle({ score, label, size = 90, delta }) {
  const animatedScore = useAnimatedScore(score ?? 0);
  const hasData = score != null;

  return (
    <div className={styles.waveCircle}>
      {hasData ? (
        <WaveSVG animatedScore={animatedScore} size={size} />
      ) : (
        <WaveSVG animatedScore={0} size={size} noData />
      )}
      <span className={styles.waveLabel}>{label}</span>
      {delta != null && <DeltaBadge delta={delta} size="sm" />}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────
   DeltaBadge - pill showing +X / -X / No change
   ─────────────────────────────────────────────────────────── */

function DeltaBadge({ delta, size = 'md' }) {
  if (delta == null) return null;

  const isUp = delta > 0;
  const isDown = delta < 0;
  const cls = isUp ? styles.deltaUp : isDown ? styles.deltaDown : styles.deltaNeutral;
  const iconSize = size === 'sm' ? 11 : 13;

  return (
    <span className={`${styles.deltaBadge} ${cls} ${size === 'sm' ? styles.deltaSm : ''}`}>
      {isUp && <TrendingUp size={iconSize} />}
      {isDown && <TrendingDown size={iconSize} />}
      {!isUp && !isDown && <Minus size={iconSize} />}
      <span>{isUp ? `+${delta}` : isDown ? `${delta}` : '0'}</span>
    </span>
  );
}

/* ───────────────────────────────────────────────────────────
   TrendChart - SVG area chart for score history (dashboard style)
   ─────────────────────────────────────────────────────────── */

function TrendChart({ timeline, locale }) {
  const chartRef = useRef(null);
  const wrapRef = useRef(null);
  const gradientId = useId().replace(/:/g, '_') + '_trendGrad';
  const [tooltip, setTooltip] = useState(null);

  if (!timeline || timeline.length < 2) return null;

  const W = 600;
  const H = 180;
  const padL = 40;
  const padR = 12;
  const padT = 20;
  const padB = 32;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const scores = timeline.map(p => p.score);
  const minScore = Math.max(0, Math.min(...scores) - 10);
  const maxScore = Math.min(100, Math.max(...scores) + 10);
  const ceil = Math.ceil(maxScore / 10) * 10 || 10;
  const floor = Math.floor(minScore / 10) * 10;
  const range = ceil - floor || 10;

  const xOf = (i) => padL + (i / (timeline.length - 1)) * innerW;
  const yOf = (v) => padT + innerH - ((v - floor) / range) * innerH;

  const points = timeline.map((p, i) => ({
    x: xOf(i),
    y: yOf(p.score),
    score: p.score,
    date: new Date(p.date).toLocaleDateString(locale, { month: 'short', day: 'numeric' }),
  }));

  // Smooth bezier path (monotone cubic like dashboard)
  const buildSmoothPath = () => {
    if (points.length < 2) return '';
    let d = `M${points[0].x},${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const cpx = (points[i + 1].x - points[i].x) / 3;
      const c1x = points[i].x + cpx;
      const c2x = points[i + 1].x - cpx;
      d += ` C${c1x},${points[i].y} ${c2x},${points[i + 1].y} ${points[i + 1].x},${points[i + 1].y}`;
    }
    return d;
  };

  const linePath = buildSmoothPath();
  const areaPath = linePath + ` L${points[points.length - 1].x},${padT + innerH} L${points[0].x},${padT + innerH} Z`;

  // Y-axis gridlines (5 steps)
  const gridLines = [];
  for (let i = 0; i <= 4; i++) {
    const val = Math.round(floor + (range / 4) * i);
    const y = yOf(val);
    gridLines.push({ y, val });
  }

  // X-axis labels (show ~6 dates)
  const step = Math.max(1, Math.floor(timeline.length / 6));
  const xLabels = timeline
    .map((d, i) => ({ i, label: new Date(d.date).toLocaleDateString(locale, { month: 'short', day: 'numeric' }) }))
    .filter((_, i) => i % step === 0 || i === timeline.length - 1);

  // Vertical gridlines at x-label positions
  const verticalGridLines = xLabels.map(({ i }) => xOf(i));

  // Mouse handling
  const handleMouseMove = (e) => {
    if (!chartRef.current || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const svgW = rect.width;
    const ratio = W / svgW;
    const mouseX = (e.clientX - rect.left) * ratio;

    // Find closest data point
    let closest = 0;
    let minDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - mouseX);
      if (dist < minDist) {
        minDist = dist;
        closest = i;
      }
    });

    if (minDist < innerW / (points.length - 1)) {
      setTooltip({ ...points[closest], idx: closest });
    } else {
      setTooltip(null);
    }
  };

  const handleMouseLeave = () => setTooltip(null);

  return (
    <div className={styles.trendChartWrap} ref={wrapRef}>
      <svg
        ref={chartRef}
        viewBox={`0 0 ${W} ${H}`}
        className={styles.trendChartSvg}
        preserveAspectRatio="xMidYMid meet"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.02" />
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

        {/* Area fill */}
        <path className={styles.chartPath} d={areaPath} fill={`url(#${gradientId})`} />

        {/* Line */}
        <path className={styles.chartPath} d={linePath} fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" />

        {/* X labels */}
        {xLabels.map(({ i, label }) => (
          <text key={i} x={xOf(i)} y={H - 6} textAnchor="middle" fill="var(--muted-foreground)" fontSize="9" fontFamily="inherit">
            {label}
          </text>
        ))}

        {/* Hover crosshair + dot */}
        {tooltip && (
          <g>
            <line x1={tooltip.x} y1={padT} x2={tooltip.x} y2={padT + innerH} stroke="var(--muted-foreground)" strokeWidth="0.5" strokeDasharray="3,3" />
            <circle cx={tooltip.x} cy={tooltip.y} r="5" fill="#8b5cf6" stroke="white" strokeWidth="2" />
          </g>
        )}
      </svg>

      {/* Tooltip popover */}
      {tooltip && (
        <div
          className={styles.chartTooltip}
          style={{
            left: `${(tooltip.x / W) * 100}%`,
            transform: `translateX(${
              (tooltip.x / W) < 0.15 ? '0%' :
              (tooltip.x / W) > 0.85 ? '-100%' : '-50%'
            })`,
          }}
        >
          <div className={styles.chartTooltipDate}>{tooltip.date}</div>
          <div className={styles.chartTooltipRow}>
            <span className={styles.chartTooltipDot} style={{ background: '#8b5cf6' }} />
            Score: <strong>{tooltip.score}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────
   Shorten a URL for display
   ─────────────────────────────────────────────────────────── */

function shortenUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname === '/' ? '' : u.pathname);
    return u.hostname + (path.length > 30 ? path.slice(0, 27) + '...' : path);
  } catch {
    return url.length > 40 ? url.slice(0, 37) + '...' : url;
  }
}

function isHomepage(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.pathname === '/' || u.pathname === '';
  } catch { return false; }
}

/* ───────────────────────────────────────────────────────────
   AuditOverviewTab Component
   ─────────────────────────────────────────────────────────── */

/**
 * AuditOverviewTab - Redesigned "Overview" tab for the Site Audit page.
 *
 * Two-column layout:
 * - Start column: meta row, health score, stats grid, category wave circles
 * - End column: AI summary, page screenshots gallery
 *
 * Props:
 * - audit: the full SiteAudit object
 * - allCounts: { passed, warnings, errors, info }
 * - categoryScores: { technical, performance, visual, accessibility }
 * - onLightbox: (imgSrc) => void
 * - pageResults: AuditPageResult[]
 * - activeDevice: "desktop" | "mobile"
 */
export default function AuditOverviewTab({
  audit,
  overallScore = 0,
  allCounts,
  categoryScores,
  onLightbox,
  pageResults = [],
  activeDevice = 'desktop',
}) {
  const { t, locale } = useLocale();
  const [summaryText, setSummaryText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [comparisonData, setComparisonData] = useState(null);

  // Animated health score
  const animatedHealthScore = useAnimatedScore(overallScore);

  // ─── Fetch audit history comparison ───────────────────────

  useEffect(() => {
    if (!audit?.siteId) return;
    let cancelled = false;

    fetch(`/api/audit/history-comparison?siteId=${audit.siteId}&deviceType=${activeDevice}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!cancelled && data) setComparisonData(data);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [audit?.siteId, audit?.id, activeDevice]);

  // ─── AI Summary: resolve correct language ─────────────────

  useEffect(() => {
    if (!audit?.id) return;

    const translations = audit.summaryTranslations || {};
    const originalSummary = audit.summary || '';

    if (translations[locale]) {
      setSummaryText(translations[locale]);
      return;
    }

    if (locale === 'en' && originalSummary) {
      setSummaryText(originalSummary);
      return;
    }

    if (!originalSummary) {
      setSummaryText('');
      return;
    }

    let cancelled = false;
    setIsTranslating(true);

    fetch('/api/audit/translate-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auditId: audit.id, targetLang: locale }),
    })
      .then(res => res.json())
      .then(data => {
        if (!cancelled && data.translation) {
          setSummaryText(data.translation);
        }
      })
      .catch(err => {
        console.error('[OverviewTab] Translation failed:', err);
        if (!cancelled) setSummaryText(originalSummary);
      })
      .finally(() => {
        if (!cancelled) setIsTranslating(false);
      });

    return () => { cancelled = true; };
  }, [audit?.id, audit?.summary, audit?.summaryTranslations, locale]);

  // ─── Helpers ──────────────────────────────────────────────

  function formatDate(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function linkifyText(text) {
    if (!text) return '';
    const urlRegex = /(https?:\/\/[^\s<>"')\]]+)/g;
    return text.replace(urlRegex, (url) => {
      const display = url.length > 60 ? url.slice(0, 57) + '...' : url;
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="${styles.summaryLink}">${display}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-inline-start:3px"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>`;
    });
  }

  function formatSummaryLine(line) {
    const bolded = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    return linkifyText(bolded);
  }

  // ─── Screenshots: collect pages that have a screenshot ────

  const isDesktop = activeDevice === 'desktop';
  const screenshotField = isDesktop ? 'screenshotDesktop' : 'screenshotMobile';

  // Build sorted list: homepage first, then others
  const pagesWithScreenshots = (pageResults || [])
    .filter(pr => pr[screenshotField])
    .sort((a, b) => {
      const aHome = isHomepage(a.url) ? 0 : 1;
      const bHome = isHomepage(b.url) ? 0 : 1;
      return aHome - bHome;
    });

  // Also include the audit-level homepage screenshot if no page-level one exists
  const homepageSrc = isDesktop ? audit?.screenshots?.desktop : audit?.screenshots?.mobile;
  const hasHomepageInResults = pagesWithScreenshots.some(pr => isHomepage(pr.url));

  if (!audit) return null;

  return (
    <div className={styles.overview}>
      {/* ────── Start Column ────── */}
      <div className={styles.colStart}>
        {/* Meta Row */}
        <div className={styles.metaRow}>
          {audit.completedAt && (
            <span className={styles.metaItem}>
              <Clock size={14} />
              {formatDate(audit.completedAt)}
            </span>
          )}
          {audit.pagesScanned > 0 && (
            <span className={styles.metaItem}>
              <FileSearch size={14} />
              {audit.pagesScanned} {t('siteAudit.pagesScanned')}
            </span>
          )}
          {audit.discoveryMethod && (
            <span className={styles.discoveryBadge}>
              {t(`siteAudit.discovery.${audit.discoveryMethod}`)}
            </span>
          )}
        </div>

        {/* Health Score - animated wave circle */}
        <div className={styles.scoreSection}>
          <div className={styles.scoreCircleWrap}>
            <WaveSVG animatedScore={animatedHealthScore} size={130} />
            <span className={styles.scoreLabel}>{t('siteAudit.healthScore')}</span>
            {comparisonData?.deltas && <DeltaBadge delta={comparisonData.deltas.score} />}
          </div>
        </div>

        {/* Trend Chart */}
        {comparisonData?.timeline?.length >= 2 && (
          <div className={styles.trendSection}>
            <h3 className={styles.sectionTitle}>
              <TrendingUp size={18} />
              {t('siteAudit.scoreProgression')}
            </h3>
            <TrendChart timeline={comparisonData.timeline} locale={locale} />
          </div>
        )}

        {/* Resolved Issues Celebration */}
        {comparisonData?.deltas?.fixedIssues > 0 && (
          <div className={styles.celebrationBox}>
            <PartyPopper size={22} />
            <div className={styles.celebrationText}>
              <strong>{t('siteAudit.greatJob')}</strong>
              <span>
                {t('siteAudit.resolvedIssues').replace('{count}', comparisonData.deltas.fixedIssues)}
              </span>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className={styles.statsGrid}>
          <div className={`${styles.statCard} ${styles.statError}`}>
            <XCircle size={20} />
            <span className={styles.statValue}>{allCounts.errors}</span>
            <span className={styles.statLabel}>{t('siteAudit.errors')}</span>
          </div>
          <div className={`${styles.statCard} ${styles.statWarning}`}>
            <AlertTriangle size={20} />
            <span className={styles.statValue}>{allCounts.warnings}</span>
            <span className={styles.statLabel}>{t('siteAudit.warnings')}</span>
          </div>
          <div className={`${styles.statCard} ${styles.statPassed}`}>
            <CheckCircle2 size={20} />
            <span className={styles.statValue}>{allCounts.passed}</span>
            <span className={styles.statLabel}>{t('siteAudit.passed')}</span>
          </div>
          <div className={`${styles.statCard} ${styles.statInfo}`}>
            <Info size={20} />
            <span className={styles.statValue}>{allCounts.info || 0}</span>
            <span className={styles.statLabel}>{t('siteAudit.notices')}</span>
          </div>
        </div>

        {/* Category Scores - Wave Circles */}
        <div className={styles.categoryCircles}>
          {['technical', 'performance', 'visual', 'accessibility'].map(cat => (
            <WaveCircle
              key={cat}
              score={categoryScores[cat]}
              label={t(`siteAudit.${cat}`)}
              delta={comparisonData?.deltas?.[cat]}
            />
          ))}
        </div>

        {/* Page Screenshots Gallery */}
        {(pagesWithScreenshots.length > 0 || homepageSrc) && (
          <div className={styles.screenshotsSection}>
            <h3 className={styles.sectionTitle}>
              <Camera size={18} />
              {t('siteAudit.screenshots')}
            </h3>
            <div className={styles.screenshotsGallery}>
              {/* Homepage screenshot from audit-level (fallback) */}
              {!hasHomepageInResults && homepageSrc && (
                <div className={styles.galleryItem}>
                  <div
                    className={styles.galleryThumb}
                    onClick={() => onLightbox?.(toImgSrc(homepageSrc))}
                  >
                    <img
                      src={toImgSrc(homepageSrc)}
                      alt={t('siteAudit.screenshotAlt')}
                      className={styles.galleryImage}
                    />
                    <div className={styles.galleryOverlay}>
                      <Maximize2 size={18} />
                    </div>
                  </div>
                  <span className={styles.galleryLabel}>
                    {isDesktop ? <Monitor size={12} /> : <Smartphone size={12} />}
                    Homepage
                  </span>
                </div>
              )}

              {/* Per-page screenshots */}
              {pagesWithScreenshots.map((pr, idx) => (
                <div key={idx} className={styles.galleryItem}>
                  <div
                    className={styles.galleryThumb}
                    onClick={() => onLightbox?.(toImgSrc(pr[screenshotField]))}
                  >
                    <img
                      src={toImgSrc(pr[screenshotField])}
                      alt={pr.title || t('siteAudit.screenshotAlt')}
                      className={styles.galleryImage}
                    />
                    <div className={styles.galleryOverlay}>
                      <Maximize2 size={18} />
                    </div>
                  </div>
                  <span className={styles.galleryLabel}>
                    {isDesktop ? <Monitor size={12} /> : <Smartphone size={12} />}
                    <bdi dir="ltr">{isHomepage(pr.url) ? 'Homepage' : shortenUrl(pr.url)}</bdi>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ────── End Column ────── */}
      <div className={styles.colEnd}>
        {/* AI Summary */}
        {(audit.summary || isTranslating) && (
          <div className={styles.summarySection}>
            <h3 className={styles.sectionTitle}>
              <Sparkles size={18} />
              {t('siteAudit.aiSummary')}
            </h3>
            {isTranslating ? (
              <div className={styles.summaryLoading}>
                <Loader2 size={18} className={styles.spinning} />
                <span>{t('siteAudit.translatingSummary')}</span>
              </div>
            ) : (
              <div className={styles.summaryContent}>
                {summaryText.split('\n').map((line, i) => {
                  if (!line.trim()) return <br key={i} />;
                  const formatted = formatSummaryLine(line);
                  if (line.trim().startsWith('- ') || line.trim().startsWith('• ')) {
                    return (
                      <li key={i} dangerouslySetInnerHTML={{ __html: formatted.replace(/^[-•]\s*/, '') }} />
                    );
                  }
                  return <p key={i} dangerouslySetInnerHTML={{ __html: formatted }} />;
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
