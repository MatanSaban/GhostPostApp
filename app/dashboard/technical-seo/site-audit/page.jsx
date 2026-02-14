'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Loader2,
  Globe,
  Zap,
  Eye,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ChevronLeft,
  Info,
  Clock,
  History,
  FileSearch,
  Monitor,
  Smartphone,
  ExternalLink,
  Maximize2,
  X,
  Layers,
  LayoutDashboard,
  Coins,
  Accessibility,
  Wand2,
  Wrench,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useSite } from '@/app/context/site-context';
import { useUser } from '@/app/context/user-context';
import { PageHeaderSkeleton, StatsGridSkeleton } from '@/app/dashboard/components';
import SmartActionButton from '@/app/components/ui/SmartActionButton';
import { handleLimitError } from '@/app/context/limit-guard-context';
import ScannedPageRow from './components/ScannedPageRow';
import AuditOverviewTab from './components/AuditOverviewTab';
import AccessibilityTab from './components/AccessibilityTab';
import ErrorLog from './components/ErrorLog';
import {
  aggregateIssuesByCategory,
  getIssuesByKey,
  getAffectedPages,
  countBySeverity,
} from './lib/aggregation';
import { toImgSrc, filmSrc } from './lib/img-src';
import PluginRequiredModal from './components/PluginRequiredModal';
import FixTitlePreviewModal from './components/FixTitlePreviewModal';
import { MediaModal } from '@/app/dashboard/components/MediaModal/MediaModal';
import styles from './site-audit.module.css';

// ─── Constants ────────────────────────────────────────────────────

const POLL_INTERVAL = 3000;

/** Issue message keys that support AI Fix via the WP plugin (costs credits) */
const AI_FIXABLE_ISSUES = new Set([
  'audit.issues.noMetaDescription',
  'audit.issues.titleTooShort',
  'audit.issues.missingOG',
  'audit.issues.imagesNoAlt',
]);

/** Issue message keys that support free Fix via the WP plugin (no credits) */
const FREE_FIXABLE_ISSUES = new Set([
  'audit.issues.noFavicon',
]);

const TABS = [
  { id: 'overview', icon: LayoutDashboard, labelKey: 'siteAudit.overview' },
  { id: 'technical', icon: Globe, labelKey: 'siteAudit.technical' },
  { id: 'performance', icon: Zap, labelKey: 'siteAudit.performance' },
  { id: 'visual', icon: Eye, labelKey: 'siteAudit.visual' },
  { id: 'accessibility', icon: Accessibility, labelKey: 'siteAudit.accessibility' },
  { id: 'pages', icon: Layers, labelKey: 'siteAudit.pagesScannedTitle' },
];

const SOURCE_KEYS = {
  html: 'siteAudit.sources.html',
  playwright: 'siteAudit.sources.browser',
  psi: 'siteAudit.sources.pagespeed',
  'ai-vision': 'siteAudit.sources.aiVision',
  axe: 'siteAudit.sources.axe',
  system: 'siteAudit.sources.system',
  fetch: 'siteAudit.sources.fetch',
};

const SCAN_STEPS = [
  'siteAudit.progress.discoveringPages',
  'siteAudit.progress.connecting',
  'siteAudit.progress.checkingSSL',
  'siteAudit.progress.analyzingSpeed',
  'siteAudit.progress.checkingMeta',
  'siteAudit.progress.checkingHeadings',
  'siteAudit.progress.analyzingImages',
  'siteAudit.progress.scanningInnerPages',
  'siteAudit.progress.checkingRobotsTxt',
  'siteAudit.progress.checkingSitemap',
  'siteAudit.progress.checkingHeaders',
  'siteAudit.progress.runningPageSpeed',
  'siteAudit.progress.capturingScreenshots',
  'siteAudit.progress.aiAnalyzingDesign',
  'siteAudit.progress.analyzingLinks',
  'siteAudit.progress.checkingStructuredData',
  'siteAudit.progress.calculatingScore',
];

// ─── Helpers ──────────────────────────────────────────────────────

function getScoreColor(score) {
  if (score >= 80) return 'good';
  if (score >= 50) return 'warning';
  return 'bad';
}

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

function shortenUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname === '/' ? '' : u.pathname);
    return u.hostname + (path.length > 40 ? path.slice(0, 37) + '...' : path);
  } catch {
    try {
      const decoded = decodeURIComponent(url);
      return decoded.length > 50 ? decoded.slice(0, 47) + '...' : decoded;
    } catch {
      return url.length > 50 ? url.slice(0, 47) + '...' : url;
    }
  }
}

function calculateCategoryScores(issues = []) {
  const categories = ['technical', 'performance', 'visual', 'accessibility'];
  const scores = {};
  for (const category of categories) {
    const ci = issues.filter(i => i.type === category);
    const passed = ci.filter(i => i.severity === 'passed').length;
    const warnings = ci.filter(i => i.severity === 'warning').length;
    const errors = ci.filter(i => i.severity === 'error').length;
    const info = ci.filter(i => i.severity === 'info').length;
    const total = passed + warnings + errors;
    if (total === 0) { scores[category] = 100; continue; }
    const maxPts = total * 100;
    const earned = (passed * 100) + (warnings * 50) + (info * 75);
    scores[category] = Math.round(Math.min(100, (earned / maxPts) * 100));
  }
  return scores;
}

// ─── Component ──────────────────────────────────────────────────

export default function SiteAuditPage() {
  const { t, locale } = useLocale();
  const { selectedSite, isLoading: isSiteLoading } = useSite();
  const { user } = useUser();

  // Audit quota from plan
  const auditQuota = (() => {
    const limitations = user?.subscription?.plan?.limitations || [];
    const auditLimit = limitations.find(l => l.key === 'siteAudits');
    const max = auditLimit?.value || null;
    const used = user?.usageStats?.siteAuditsCount || 0;
    return { max, used, remaining: max != null ? Math.max(0, max - used) : null };
  })();

  const [latestAudit, setLatestAudit] = useState(null);
  const [auditHistory, setAuditHistory] = useState([]);
  const [isStarting, setIsStarting] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState(null);
  const [isLoadingAudits, setIsLoadingAudits] = useState(true);

  // Device toggle state — "desktop" or "mobile"
  const [activeDevice, setActiveDevice] = useState('desktop');

  // Tab state
  const [activeTab, setActiveTab] = useState('overview');

  // Drill-down state — when user clicks an aggregated issue
  const [drillDown, setDrillDown] = useState(null); // { issueKey, category }

  // Page detail modal — viewing issues for a specific page result
  const [pageDetail, setPageDetail] = useState(null); // AuditPageResult

  const [showHistory, setShowHistory] = useState(false);
  const [scanStepIndex, setScanStepIndex] = useState(0);
  const [lightboxImg, setLightboxImg] = useState(null);
  const [showPluginModal, setShowPluginModal] = useState(false);
  const [showTitleFixModal, setShowTitleFixModal] = useState(false);
  const [showFaviconMediaModal, setShowFaviconMediaModal] = useState(false);
  const [isSettingFavicon, setIsSettingFavicon] = useState(false);

  // AI issue translations cache (for visual/UX tab)
  const [issueTranslations, setIssueTranslations] = useState({});
  const [isTranslatingIssues, setIsTranslatingIssues] = useState(false);

  // Segmented screenshot viewer index
  const [segmentIndex, setSegmentIndex] = useState(0);

  const pollRef = useRef(null);
  const stepIntervalRef = useRef(null);

  // ─── Data Fetching ──────────────────────────────────────────

  const fetchAudits = useCallback(async (siteId, device) => {
    try {
      const res = await fetch(`/api/audit?siteId=${siteId}&deviceType=${device || 'desktop'}`);
      if (!res.ok) throw new Error('Failed to fetch audits');
      const data = await res.json();
      setLatestAudit(data.latest);
      setAuditHistory(data.audits || []);
      return data.latest;
    } catch (err) {
      console.error('[SiteAudit] Fetch error:', err);
      setError(err.message);
      return null;
    }
  }, []);

  useEffect(() => {
    if (!selectedSite?.id) return;
    setIsLoadingAudits(true);
    setError(null);
    setLatestAudit(null);
    setAuditHistory([]);
    setActiveTab('overview');
    setDrillDown(null);
    setPageDetail(null);
    setShowHistory(false);
    setIssueTranslations({});

    fetchAudits(selectedSite.id, activeDevice).then((latest) => {
      setIsLoadingAudits(false);
      if (latest && (latest.status === 'PENDING' || latest.status === 'RUNNING')) {
        startPolling(selectedSite.id, activeDevice);
      }
    });

    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSite?.id, activeDevice]);

  // ─── Device Toggle Handler ─────────────────────────────────

  const handleDeviceChange = (device) => {
    if (device === activeDevice) return;
    setActiveDevice(device);
    setDrillDown(null);
    setPageDetail(null);
    setIssueTranslations({});
  };

  // ─── Polling ──────────────────────────────────────────────────

  const startPolling = useCallback((siteId, device) => {
    setIsPolling(true);
    setScanStepIndex(0);

    stepIntervalRef.current = setInterval(() => {
      setScanStepIndex(prev => (prev + 1) % SCAN_STEPS.length);
    }, 2500);

    pollRef.current = setInterval(async () => {
      const latest = await fetchAudits(siteId, device);
      if (latest && latest.status !== 'PENDING' && latest.status !== 'RUNNING') {
        stopPolling();
      }
    }, POLL_INTERVAL);
  }, [fetchAudits]);

  const stopPolling = useCallback(() => {
    setIsPolling(false);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (stepIntervalRef.current) { clearInterval(stepIntervalRef.current); stepIntervalRef.current = null; }
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  // ─── Actions ──────────────────────────────────────────────────

  const handleStartAudit = async () => {
    if (!selectedSite?.id || isStarting || isPolling) return;
    setIsStarting(true);
    setError(null);

    try {
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: selectedSite.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        if (handleLimitError(data)) return; // shows global modal
        throw new Error(data.error || 'Failed to start audit');
      }
      const data = await res.json();
      // POST now returns { audits: [...] } — pick the one matching active device
      const deviceAudit = data.audits?.find(a => a.deviceType === activeDevice) || data.audits?.[0];
      setLatestAudit(deviceAudit);
      startPolling(selectedSite.id, activeDevice);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsStarting(false);
    }
  };

  const handleRescanComplete = () => {
    if (selectedSite?.id) fetchAudits(selectedSite.id, activeDevice);
  };

  // ─── Derived State ────────────────────────────────────────────

  const isRunning = isPolling || latestAudit?.status === 'PENDING' || latestAudit?.status === 'RUNNING';
  const isCompleted = latestAudit?.status === 'COMPLETED';
  const isFailed = latestAudit?.status === 'FAILED';
  const categoryScores = isCompleted
    ? (latestAudit.categoryScores || calculateCategoryScores(latestAudit.issues))
    : {};
  const allIssues = isCompleted ? (latestAudit.issues || []) : [];
  const allCounts = isCompleted ? countBySeverity(allIssues) : { passed: 0, warnings: 0, errors: 0, info: 0 };
  const pageResults = isCompleted ? (latestAudit.pageResults || []) : [];

  // Aggregated issues for active tab (category tabs)
  const isIssueCategoryTab = ['technical', 'performance', 'visual'].includes(activeTab);
  const isAccessibilityTab = activeTab === 'accessibility';
  const accessibilityIssues = isCompleted ? allIssues.filter(i => i.type === 'accessibility') : [];
  const aggregatedIssues = isIssueCategoryTab
    ? aggregateIssuesByCategory(allIssues, activeTab)
    : [];

  // Tab counts
  const tabCounts = isCompleted
    ? {
        technical: countBySeverity(allIssues.filter(i => i.type === 'technical')),
        performance: countBySeverity(allIssues.filter(i => i.type === 'performance')),
        visual: countBySeverity(allIssues.filter(i => i.type === 'visual')),
        accessibility: countBySeverity(allIssues.filter(i => i.type === 'accessibility')),
        pages: { total: pageResults.length },
      }
    : {};

  // Drill-down: matching issues and affected pages
  const drillDownIssues = drillDown
    ? getIssuesByKey(allIssues, drillDown.issueKey)
    : [];
  const drillDownPages = drillDown
    ? getAffectedPages(allIssues, pageResults, drillDown.issueKey)
    : [];
  const drillDownAgg = drillDown && aggregatedIssues.find(a => a.key === drillDown.issueKey);

  // ─── AI Issue Translations (Visual & UX tab + Accessibility) ──

  useEffect(() => {
    if (!isCompleted || !latestAudit?.id || locale === 'en') return;

    // Find AI-generated issues (messages that don't start with translation keys)
    const aiIssues = allIssues.filter(
      i => i.source === 'ai-vision' && i.message && !i.message.startsWith('audit.')
    );

    // Find accessibility issues (axe-core) — description + suggestion need translation
    const a11yIssues = allIssues.filter(i => i.source === 'axe' && i.type === 'accessibility');

    if (aiIssues.length === 0 && a11yIssues.length === 0) return;

    // Dedupe by message (for ai-vision)
    const seen = new Set();
    const uniqueIssues = [];
    for (const issue of aiIssues) {
      if (!seen.has(issue.message)) {
        seen.add(issue.message);
        uniqueIssues.push({
          key: issue.message,
          message: issue.message,
          suggestion: issue.suggestion || '',
        });
      }
    }

    // Dedupe accessibility issues by description (stored in details JSON)
    for (const issue of a11yIssues) {
      let details = {};
      try {
        details = typeof issue.details === 'string' ? JSON.parse(issue.details) : (issue.details || {});
      } catch { /* ignore */ }
      const description = details.description || '';
      const suggestion = issue.suggestion || '';
      // Use "a11y:<ruleId>" as key to avoid collision with ai-vision keys
      const key = `a11y:${details.ruleId || issue.message || description}`;
      if (description && !seen.has(key)) {
        seen.add(key);
        uniqueIssues.push({
          key,
          message: description,
          suggestion,
        });
      }
    }

    // Check if we already have these translations
    const missing = uniqueIssues.filter(i => !issueTranslations[i.key]);
    if (missing.length === 0) return;

    let cancelled = false;
    setIsTranslatingIssues(true);

    fetch('/api/audit/translate-issues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auditId: latestAudit.id,
        targetLang: locale,
        issues: missing,
      }),
    })
      .then(res => res.json())
      .then(data => {
        if (!cancelled && data.translations) {
          setIssueTranslations(prev => ({ ...prev, ...data.translations }));
        }
      })
      .catch(err => console.error('[SiteAudit] Issue translation failed:', err))
      .finally(() => { if (!cancelled) setIsTranslatingIssues(false); });

    return () => { cancelled = true; };
  }, [isCompleted, latestAudit?.id, locale, allIssues.length]);

  /**
   * Get the translated message for an issue (AI-generated or axe a11y).
   * Falls back to the original message.
   * @param {string} msg — the original text (also used as key for ai-vision)
   * @param {string} field — 'message' or 'suggestion'
   * @param {string} [translationKey] — optional explicit key (e.g. "a11y:image-alt")
   */
  const translateIssueMsg = (msg, field = 'message', translationKey) => {
    if (!msg || msg.startsWith('audit.')) return msg?.startsWith('audit.') ? t(msg) : msg;
    // Try explicit key first, then fall back to msg as key
    const key = translationKey || msg;
    const tr = issueTranslations[key];
    if (tr && tr[field]) return tr[field];
    return msg;
  };

  /**
   * Get the relevant screenshot for an issue based on its device field.
   * Returns the homepage screenshots data URI.
   */
  const getIssueScreenshot = (issue) => {
    const ss = latestAudit?.screenshots;
    if (!ss) return null;
    const d = issue.device || 'both';
    if (d === 'desktop' && ss.desktop) return toImgSrc(ss.desktop);
    if (d === 'mobile' && ss.mobile) return toImgSrc(ss.mobile);
    // For "both", prefer desktop
    if (ss.desktop) return toImgSrc(ss.desktop);
    if (ss.mobile) return toImgSrc(ss.mobile);
    return null;
  };

  /** Check plugin connection and handle AI Fix click */
  const isPluginConnected = selectedSite?.connectionStatus === 'CONNECTED' && !!selectedSite?.siteKey;

  const handleAiFix = (issueKey, issue) => {
    if (!isPluginConnected) {
      setShowPluginModal(true);
      return;
    }

    // Route to the appropriate fix modal based on issue type
    switch (issueKey) {
      case 'audit.issues.titleTooShort':
        setShowTitleFixModal(true);
        break;
      default:
        // Future: handle other AI-fixable issues
        console.log('[AiFix] No handler yet for:', issueKey);
        break;
    }
  };

  /** Handle free Fix click (non-AI fixes that cost nothing) */
  const handleFix = (issueKey) => {
    if (!isPluginConnected) {
      setShowPluginModal(true);
      return;
    }

    switch (issueKey) {
      case 'audit.issues.noFavicon':
        setShowFaviconMediaModal(true);
        break;
      default:
        console.log('[Fix] No handler yet for:', issueKey);
        break;
    }
  };

  /** Callback when user selects a media item for favicon */
  const handleFaviconSelected = async (mediaItem) => {
    if (!mediaItem?.id) return;
    setIsSettingFavicon(true);
    try {
      const res = await fetch('/api/audit/set-favicon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: selectedSite?.id,
          auditId: latestAudit?.id,
          attachmentId: mediaItem.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error('[SetFavicon] Failed:', data.error);
        return;
      }
      // Refresh audit data to reflect the fix
      if (data.auditUpdated) {
        fetchAudits(selectedSite?.id, activeDevice);
      }
    } catch (err) {
      console.error('[SetFavicon] Error:', err);
    } finally {
      setIsSettingFavicon(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────

  if (isSiteLoading) {
    return (
      <div className={styles.container}>
        <PageHeaderSkeleton hasActions />
        <StatsGridSkeleton count={4} />
      </div>
    );
  }

  if (!selectedSite) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <Activity className={styles.emptyIcon} />
          <p>{t('siteAudit.selectSite')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>{t('siteAudit.title')}</h1>
          <p className={styles.subtitle}>{t('siteAudit.subtitle')}</p>
        </div>
        <div className={styles.headerActions}>
          {auditHistory.length > 1 && (
            <button
              className={styles.historyButton}
              onClick={() => setShowHistory(!showHistory)}
            >
              <History size={16} />
              {t('siteAudit.history')}
            </button>
          )}
          <SmartActionButton
            resourceKey="siteAudits"
            accountId={user?.accountId}
            label={isRunning ? t('siteAudit.scanning') : t('siteAudit.startScan')}
            icon={isRunning || isStarting ? Loader2 : RefreshCw}
            onAction={handleStartAudit}
            disabled={isRunning || isStarting}
            busy={isRunning || isStarting}
            busyLabel={t('siteAudit.scanning')}
            className={styles.scanButton}
          />
        </div>
      </div>

      {/* Device Toggle — only when not running and there's at least one audit */}
      {!isRunning && auditHistory.length > 0 && (
        <div className={styles.deviceToggle}>
          <button
            className={`${styles.deviceBtn} ${activeDevice === 'desktop' ? styles.deviceBtnActive : ''}`}
            onClick={() => handleDeviceChange('desktop')}
          >
            <Monitor size={16} />
            <span>{t('siteAudit.desktopAudit')}</span>
          </button>
          <button
            className={`${styles.deviceBtn} ${activeDevice === 'mobile' ? styles.deviceBtnActive : ''}`}
            onClick={() => handleDeviceChange('mobile')}
          >
            <Smartphone size={16} />
            <span>{t('siteAudit.mobileAudit')}</span>
          </button>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className={styles.errorBanner}>
          <XCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Scanning Animation */}
      {isRunning && (() => {
        const prog = latestAudit?.progress;
        const pct = prog?.percentage ?? Math.min(95, (scanStepIndex + 1) / SCAN_STEPS.length * 100);
        const pageUrl = prog?.labelParams?.page;
        const label = prog?.labelKey
          ? t(prog.labelKey, { ...(prog.labelParams || {}), page: '__URL__' })
          : (prog?.label || t(SCAN_STEPS[scanStepIndex]));

        // Split around the URL placeholder so we can wrap it with dir="ltr"
        const labelParts = pageUrl ? label.split('__URL__') : null;

        return (
          <div className={styles.scanningCard}>
            <div className={styles.scanningAnimation}>
              <div className={styles.scanPulse} />
              <Activity className={styles.scanIcon} />
            </div>
            <div className={styles.scanningInfo}>
              <h3 className={styles.scanningTitle}>{t('siteAudit.scanInProgress')}</h3>
              <p className={styles.scanningStep}>
                {labelParts
                  ? <>{labelParts[0]}<bdi dir="ltr">{pageUrl}</bdi>{labelParts[1]}</>
                  : label
                }
              </p>
              <div className={styles.scanProgressBar}>
                <div
                  className={styles.scanProgressFill}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className={styles.scanProgressLabel}>{Math.round(pct)}%</span>
              <p className={styles.scanningHint}>{t('siteAudit.scanHint')}</p>
            </div>
          </div>
        );
      })()}

      {/* Failed State — No Sitemap */}
      {isFailed && !isRunning && latestAudit?.progress?.failureReason === 'NO_SITEMAP' && (
        <div className={styles.failedCard}>
          <XCircle className={styles.failedIcon} />
          <h3 className={styles.failedTitle}>{t('siteAudit.noSitemapTitle')}</h3>
          <p className={styles.failedDescription}>{t('siteAudit.noSitemapDescription')}</p>
          <p className={styles.failedDescription} style={{ marginTop: 8, fontWeight: 500 }}>{t('siteAudit.noSitemapNotCharged')}</p>
          <SmartActionButton
            resourceKey="siteAudits"
            accountId={user?.accountId}
            label={t('siteAudit.retryAudit')}
            icon={RefreshCw}
            onAction={handleStartAudit}
            className={styles.scanButton}
          />
        </div>
      )}

      {/* Failed State — Generic */}
      {isFailed && !isRunning && latestAudit?.progress?.failureReason !== 'NO_SITEMAP' && (
        <div className={styles.failedCard}>
          <XCircle className={styles.failedIcon} />
          <h3 className={styles.failedTitle}>{t('siteAudit.auditFailed')}</h3>
          <p className={styles.failedDescription}>{t('siteAudit.auditFailedDescription')}</p>
          <SmartActionButton
            resourceKey="siteAudits"
            accountId={user?.accountId}
            label={t('siteAudit.retryAudit')}
            icon={RefreshCw}
            onAction={handleStartAudit}
            className={styles.scanButton}
          />
        </div>
      )}

      {/* Loading audits */}
      {isLoadingAudits && !isRunning && (
        <StatsGridSkeleton count={4} />
      )}

      {/* ════════════════════════════════════════════════════════════
          COMPLETED RESULTS
          ════════════════════════════════════════════════════════════ */}
      {isCompleted && !isRunning && (
        <>
          {/* ═══ TABS ═══════════════════════════════════════════════ */}
          <div className={styles.tabsCard}>
            <div className={styles.tabsHeader}>
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const tc = tabCounts[tab.id] || {};
                const isActive = activeTab === tab.id;
                const errCount = tc.errors || 0;
                const warnCount = tc.warnings || 0;

                return (
                  <button
                    key={tab.id}
                    className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
                    onClick={() => { setActiveTab(tab.id); setDrillDown(null); setPageDetail(null); }}
                  >
                    <Icon size={16} />
                    <span className={styles.tabLabel}>{t(tab.labelKey)}</span>
                    {tab.id === 'overview' ? (
                      isActive && (
                        <div className={`${styles.tabScore} ${styles[getScoreColor(latestAudit?.score ?? 0)]}`}>
                          {latestAudit?.score ?? 0}
                        </div>
                      )
                    ) : tab.id === 'pages' ? (
                      <span className={styles.tabBadge}>{tc.total || 0}</span>
                    ) : (
                      <div className={styles.tabCounts}>
                        {errCount > 0 && <span className={styles.tabCountError}>{errCount}</span>}
                        {warnCount > 0 && <span className={styles.tabCountWarning}>{warnCount}</span>}
                      </div>
                    )}
                    {isActive && tab.id !== 'pages' && tab.id !== 'overview' && (
                      <div className={`${styles.tabScore} ${styles[getScoreColor(categoryScores[tab.id] ?? 0)]}`}>
                        {categoryScores[tab.id] ?? 0}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Tab Content */}
            <div className={styles.tabContent}>
              {/* ─── Overview Tab ─── */}
              {activeTab === 'overview' && (
                <AuditOverviewTab
                  audit={latestAudit}
                  allCounts={allCounts}
                  categoryScores={categoryScores}
                  onLightbox={setLightboxImg}
                />
              )}

              {/* ─── Category Tabs: Aggregated Issues ─── */}
              {isIssueCategoryTab && !drillDown && (
                <>
                  {isTranslatingIssues && activeTab === 'visual' && (
                    <div className={styles.translatingBanner}>
                      <Loader2 size={14} className={styles.spinning} />
                      <span>{t('siteAudit.translatingIssues')}</span>
                    </div>
                  )}
                  {aggregatedIssues.length === 0 ? (
                    <div className={styles.tabEmpty}>
                      <CheckCircle2 size={24} className={styles.tabEmptyIcon} />
                      <p>{t('siteAudit.noIssuesInCategory')}</p>
                    </div>
                  ) : (
                    <div className={styles.aggregatedList}>
                      {aggregatedIssues.map((agg) => {
                        const issueScreenshot = agg.source === 'ai-vision' ? getIssueScreenshot(agg) : null;
                        return (
                          <button
                            key={agg.key}
                            className={`${styles.aggregatedRow} ${styles[`issue_${agg.severity}`]}`}
                            onClick={() => setDrillDown({ issueKey: agg.key, category: activeTab })}
                          >
                            <div className={styles.aggIcon}>
                              {agg.severity === 'passed' && <CheckCircle2 size={16} />}
                              {agg.severity === 'warning' && <AlertTriangle size={16} />}
                              {agg.severity === 'error' && <XCircle size={16} />}
                              {agg.severity === 'info' && <Info size={16} />}
                            </div>
                            <div className={styles.aggContent}>
                              <span className={styles.aggMessage}>
                                {agg.source === 'ai-vision'
                                  ? translateIssueMsg(agg.message, 'message')
                                  : (agg.message?.startsWith('audit.') ? t(agg.message) : agg.message)}
                              </span>
                              {agg.details && (
                                <span className={styles.issueDetailsValue}>{agg.details}</span>
                              )}
                              {agg.suggestion && (
                                <span className={styles.aggSuggestion}>
                                  {agg.source === 'ai-vision'
                                    ? translateIssueMsg(agg.suggestion, 'suggestion')
                                    : (agg.suggestion?.startsWith('audit.') ? t(agg.suggestion) : agg.suggestion)}
                                </span>
                              )}
                              <div className={styles.aggMeta}>
                                {agg.source && (
                                  <span className={`${styles.sourceBadge} ${styles[`source_${agg.source?.replace('-', '_')}`] || ''}`}>
                                    {SOURCE_KEYS[agg.source] ? t(SOURCE_KEYS[agg.source]) : agg.source}
                                  </span>
                                )}
                                {agg.device && agg.device !== 'both' && (
                                  <span className={styles.deviceBadge}>
                                    {agg.device === 'desktop' ? <Monitor size={11} /> : <Smartphone size={11} />}
                                    {agg.device === 'desktop' ? t('siteAudit.desktop') : t('siteAudit.mobile')}
                                  </span>
                                )}
                                {agg.device === 'both' && (
                                  <span className={styles.deviceBadge}>
                                    <Monitor size={11} />
                                    <Smartphone size={11} />
                                  </span>
                                )}
                              </div>
                            </div>
                            {/* Thumbnail screenshot for visual issues */}
                            {issueScreenshot && (
                              <div
                                className={styles.aggScreenshotThumb}
                                onClick={(e) => { e.stopPropagation(); setLightboxImg(issueScreenshot); }}
                              >
                                <img src={issueScreenshot} alt="" className={styles.aggScreenshotImg} />
                                {/* Bounding box overlay */}
                                {agg.boundingBox && (
                                  <div
                                    className={styles.boundingBox}
                                    style={{
                                      left: `${agg.boundingBox.x}%`,
                                      top: `${agg.boundingBox.y}%`,
                                      width: `${agg.boundingBox.width}%`,
                                      height: `${agg.boundingBox.height}%`,
                                    }}
                                  />
                                )}
                              </div>
                            )}
                            <div className={styles.aggRight}>
                              {AI_FIXABLE_ISSUES.has(agg.key) && (
                                <span
                                  role="button"
                                  tabIndex={0}
                                  className={styles.aiFixBtn}
                                  onClick={(e) => { e.stopPropagation(); handleAiFix(agg.key, agg); }}
                                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); handleAiFix(agg.key, agg); } }}
                                  title={t('siteAudit.aiFix.title')}
                                >
                                  <Wand2 size={13} />
                                  <span>{t('siteAudit.aiFix.label')}</span>
                                </span>
                              )}
                              {FREE_FIXABLE_ISSUES.has(agg.key) && (
                                <span
                                  role="button"
                                  tabIndex={0}
                                  className={styles.fixBtn}
                                  onClick={(e) => { e.stopPropagation(); handleFix(agg.key); }}
                                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); handleFix(agg.key); } }}
                                  title={t('siteAudit.fix.title')}
                                >
                                  <Wrench size={13} />
                                  <span>{t('siteAudit.fix.label')}</span>
                                </span>
                              )}
                              {agg.count > 1 && (
                                <span className={styles.aggCount}>
                                  {agg.urls.length} {t('siteAudit.pages')}
                                </span>
                              )}
                              <ChevronRight size={16} className={styles.aggChevron} />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {/* ─── Drill-Down View ─── */}
              {isIssueCategoryTab && drillDown && (
                <div className={styles.drillDown}>
                  <button
                    className={styles.drillDownBack}
                    onClick={() => setDrillDown(null)}
                  >
                    <ChevronDown size={16} className={styles.backIcon} />
                    {t('siteAudit.backToList')}
                  </button>

                  {/* Issue Summary */}
                  {drillDownAgg && (
                    <div className={`${styles.drillDownHeader} ${styles[`issue_${drillDownAgg.severity}`]}`}>
                      <div className={styles.drillDownIcon}>
                        {drillDownAgg.severity === 'passed' && <CheckCircle2 size={20} />}
                        {drillDownAgg.severity === 'warning' && <AlertTriangle size={20} />}
                        {drillDownAgg.severity === 'error' && <XCircle size={20} />}
                        {drillDownAgg.severity === 'info' && <Info size={20} />}
                      </div>
                      <div className={styles.drillDownInfo}>
                        <h3 className={styles.drillDownTitle}>
                          {drillDownAgg.message?.startsWith('audit.') ? t(drillDownAgg.message) : drillDownAgg.message}
                        </h3>
                        {drillDownAgg.suggestion && (
                          <p className={styles.drillDownSuggestion}>
                            {drillDownAgg.suggestion?.startsWith('audit.') ? t(drillDownAgg.suggestion) : drillDownAgg.suggestion}
                          </p>
                        )}
                        <div className={styles.drillDownMeta}>
                          <span className={styles.drillDownCount}>
                            {drillDownAgg.count} {drillDownAgg.count === 1 ? t('siteAudit.occurrence') : t('siteAudit.occurrences')}
                          </span>
                          {drillDownAgg.source && (
                            <span className={`${styles.sourceBadge} ${styles[`source_${drillDownAgg.source?.replace('-', '_')}`] || ''}`}>
                              {SOURCE_KEYS[drillDownAgg.source] ? t(SOURCE_KEYS[drillDownAgg.source]) : drillDownAgg.source}
                            </span>
                          )}
                          {AI_FIXABLE_ISSUES.has(drillDownAgg.key) && (
                            <button
                              className={styles.aiFixBtn}
                              onClick={() => handleAiFix(drillDownAgg.key, drillDownAgg)}
                            >
                              <Wand2 size={13} />
                              <span>{t('siteAudit.aiFix.label')}</span>
                            </button>
                          )}
                          {FREE_FIXABLE_ISSUES.has(drillDownAgg.key) && (
                            <button
                              className={styles.fixBtn}
                              onClick={() => handleFix(drillDownAgg.key)}
                            >
                              <Wrench size={13} />
                              <span>{t('siteAudit.fix.label')}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Affected Pages */}
                  <div className={styles.drillDownPages}>
                    <h4 className={styles.drillDownSubtitle}>
                      {t('siteAudit.affectedPages')} ({drillDownPages.length})
                    </h4>
                    <div className={styles.drillDownPageList}>
                      {/* Table header for full view */}
                      <div className={styles.drillDownPageHeader}>
                        <span className={styles.drillDownColUrl}>{t('siteAudit.pr.url')}</span>
                        <span className={styles.drillDownColStatus}>{t('siteAudit.pr.status')}</span>
                        <span className={styles.drillDownColPsi}>{t('siteAudit.pr.psi')}</span>
                        <span className={styles.drillDownColActions}></span>
                      </div>
                      {drillDownPages.map((pr, idx) => (
                        <ScannedPageRow
                          key={idx}
                          pageResult={pr}
                          auditId={latestAudit.id}
                          siteId={selectedSite.id}
                          onRescanComplete={handleRescanComplete}
                          onViewDetails={(p) => setPageDetail(p)}
                          compact
                          pageIssues={allIssues.filter(i => i.url === pr.url)}
                          onFixComplete={() => handleRescanComplete()}
                          isPluginConnected={isPluginConnected}
                          onPluginRequired={() => setShowPluginModal(true)}
                        />
                      ))}
                      {drillDownPages.length === 0 && (
                        <div className={styles.drillDownEmpty}>
                          {t('siteAudit.noAffectedPages')}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ─── Accessibility Tab ─── */}
              {isAccessibilityTab && (
                <AccessibilityTab
                  issues={accessibilityIssues}
                  auditId={latestAudit.id}
                  siteId={selectedSite.id}
                  score={categoryScores.accessibility}
                  onFixComplete={handleRescanComplete}
                  translateIssueMsg={translateIssueMsg}
                  locale={locale}
                />
              )}

              {/* ─── Pages Tab ─── */}
              {activeTab === 'pages' && (
                <div className={styles.pagesTab}>
                  {/* Column Headers */}
                  <div className={styles.pagesHeader}>
                    <span className={styles.phUrl}>{t('siteAudit.pr.url')}</span>
                    <span className={styles.phStatus}>{t('siteAudit.pr.status')}</span>
                    <span className={styles.phTtfb}>{t('siteAudit.pr.ttfb')}</span>
                    <span className={styles.phPsi}>{t('siteAudit.pr.psi')}</span>
                    <span className={styles.phLcp}>{t('siteAudit.pr.lcp')}</span>
                    <span className={styles.phCls}>{t('siteAudit.pr.cls')}</span>
                    <span className={styles.phIssues}>{t('siteAudit.pr.issues')}</span>
                    <span className={styles.phActions}></span>
                  </div>
                  {pageResults.length === 0 ? (
                    <div className={styles.tabEmpty}>
                      <p>{t('siteAudit.noPagesScanned')}</p>
                    </div>
                  ) : (
                    pageResults.map((pr, idx) => (
                      <ScannedPageRow
                        key={idx}
                        pageResult={pr}
                        auditId={latestAudit.id}
                        siteId={selectedSite.id}
                        onRescanComplete={handleRescanComplete}
                        onViewDetails={(p) => setPageDetail(p)}
                        pageIssues={allIssues.filter(i => i.url === pr.url)}
                        onFixComplete={() => handleRescanComplete()}
                        isPluginConnected={isPluginConnected}
                        onPluginRequired={() => setShowPluginModal(true)}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* No Scans Empty State */}
      {!isLoadingAudits && !isRunning && !isCompleted && !isFailed && (
        <div className={styles.emptyState}>
          <Activity className={styles.emptyIcon} />
          <h3 className={styles.emptyTitle}>{t('siteAudit.noScans')}</h3>
          <p className={styles.emptyDescription}>{t('siteAudit.noScansDescription')}</p>
          <SmartActionButton
            resourceKey="siteAudits"
            accountId={user?.accountId}
            label={t('siteAudit.runFirstScan')}
            icon={RefreshCw}
            onAction={handleStartAudit}
            className={styles.scanButton}
          />
        </div>
      )}

      {/* History Panel */}
      {showHistory && auditHistory.length > 1 && (
        <div className={styles.historyPanel}>
          <h3 className={styles.historyTitle}>{t('siteAudit.auditHistory')}</h3>
          <div className={styles.historyList}>
            {auditHistory.map((audit) => (
              <button
                key={audit.id}
                className={`${styles.historyItem} ${audit.id === latestAudit?.id ? styles.historyItemActive : ''}`}
                onClick={() => {
                  setLatestAudit(audit);
                  setActiveTab('overview');
                  setDrillDown(null);
                  setPageDetail(null);
                }}
              >
                <div className={styles.historyItemLeft}>
                  {audit.status === 'COMPLETED' && (
                    <div className={`${styles.historyScore} ${styles[getScoreColor(audit.score)]}`}>
                      {audit.score}
                    </div>
                  )}
                  {audit.status === 'FAILED' && (
                    <div className={`${styles.historyScore} ${styles.bad}`}>
                      <XCircle size={14} />
                    </div>
                  )}
                  {(audit.status === 'RUNNING' || audit.status === 'PENDING') && (
                    <div className={styles.historyScore}>
                      <Loader2 size={14} className={styles.spinning} />
                    </div>
                  )}
                </div>
                <div className={styles.historyItemInfo}>
                  <span className={styles.historyDate}>{formatDate(audit.createdAt)}</span>
                  <span className={styles.historyStatus}>
                    {t(`siteAudit.status.${audit.status.toLowerCase()}`)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Page Detail Modal */}
      {pageDetail && createPortal(
        <div className={styles.lightbox} onClick={() => setPageDetail(null)}>
          <div className={styles.pageDetailModal} onClick={(e) => e.stopPropagation()}>
            <button className={styles.lightboxClose} onClick={() => setPageDetail(null)}>
              <X size={20} />
            </button>
            <h3 className={styles.pageDetailTitle}>
              <FileSearch size={18} />
              {shortenUrl(pageDetail.url)}
            </h3>

            {/* Page metrics */}
            <div className={styles.pageDetailMetrics}>
              <div className={styles.pdMetric}>
                <span className={styles.pdMetricLabel}>{t('siteAudit.pr.status')}</span>
                <span className={styles.pdMetricValue}>{pageDetail.statusCode || '—'}</span>
              </div>
              <div className={styles.pdMetric}>
                <span className={styles.pdMetricLabel}>{t('siteAudit.pr.ttfb')}</span>
                <span className={styles.pdMetricValue}>{pageDetail.ttfb ? `${pageDetail.ttfb}ms` : t('siteAudit.na')}</span>
              </div>
              <div className={styles.pdMetric}>
                <span className={styles.pdMetricLabel}>{t('siteAudit.pr.psi')}</span>
                <span className={styles.pdMetricValue}>{pageDetail.performanceScore ?? t('siteAudit.na')}</span>
              </div>
              <div className={styles.pdMetric}>
                <span className={styles.pdMetricLabel}>{t('siteAudit.pr.lcp')}</span>
                <span className={styles.pdMetricValue}>{pageDetail.lcp != null ? `${pageDetail.lcp.toFixed(1)}s` : t('siteAudit.na')}</span>
              </div>
              <div className={styles.pdMetric}>
                <span className={styles.pdMetricLabel}>{t('siteAudit.pr.cls')}</span>
                <span className={styles.pdMetricValue}>{pageDetail.cls != null ? pageDetail.cls.toFixed(3) : t('siteAudit.na')}</span>
              </div>
            </div>

            {/* Issues for this page */}
            <h4 className={styles.pageDetailSubtitle}>
              {t('siteAudit.pr.issues')} ({allIssues.filter(i => i.url === pageDetail.url).length})
            </h4>
            <div className={styles.pageDetailIssues}>
              {allIssues.filter(i => i.url === pageDetail.url).length === 0 ? (
                <p className={styles.pageDetailNoIssues}>{t('siteAudit.noIssuesForPage')}</p>
              ) : (
                allIssues
                  .filter(i => i.url === pageDetail.url)
                  .sort((a, b) => {
                    const order = { error: 0, warning: 1, info: 2, passed: 3 };
                    return (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
                  })
                  .map((issue, idx) => (
                    <div key={idx} className={`${styles.pdIssue} ${styles[`issue_${issue.severity}`]}`}>
                      <div className={styles.issueIcon}>
                        {issue.severity === 'passed' && <CheckCircle2 size={14} />}
                        {issue.severity === 'warning' && <AlertTriangle size={14} />}
                        {issue.severity === 'error' && <XCircle size={14} />}
                        {issue.severity === 'info' && <Info size={14} />}
                      </div>
                      <div className={styles.pdIssueContent}>
                        <span className={styles.pdIssueMessage}>
                          {issue.source === 'ai-vision'
                            ? translateIssueMsg(issue.message, 'message')
                            : (issue.message?.startsWith('audit.') ? t(issue.message) : issue.message)}
                        </span>
                        {issue.details && (
                          <span className={styles.issueDetailsValue}>{issue.details}</span>
                        )}
                        {/* Detailed sources (script URLs, image files, etc.) */}
                        {issue.detailedSources && Array.isArray(issue.detailedSources) && issue.detailedSources.length > 0 && (
                          <div className={styles.detailedSources}>
                            {issue.detailedSources.slice(0, 8).map((src, si) => (
                              <span key={si} className={styles.detailedSourceItem}>
                                {typeof src === 'string' ? shortenUrl(src) : (src.url ? shortenUrl(src.url) : (src.text || JSON.stringify(src)))}
                              </span>
                            ))}
                            {issue.detailedSources.length > 8 && (
                              <span className={styles.detailedSourceMore}>+{issue.detailedSources.length - 8} more</span>
                            )}
                          </div>
                        )}
                      </div>
                      {AI_FIXABLE_ISSUES.has(issue.message) && (
                        <button
                          className={styles.aiFixBtnSmall}
                          onClick={() => handleAiFix(issue.message, issue)}
                          title={t('siteAudit.aiFix.title')}
                        >
                          <Wand2 size={12} />
                          <span>{t('siteAudit.aiFix.label')}</span>
                        </button>
                      )}
                      {FREE_FIXABLE_ISSUES.has(issue.message) && (
                        <button
                          className={styles.fixBtnSmall}
                          onClick={() => handleFix(issue.message)}
                          title={t('siteAudit.fix.title')}
                        >
                          <Wrench size={12} />
                          <span>{t('siteAudit.fix.label')}</span>
                        </button>
                      )}
                    </div>
                  ))
              )}
            </div>

            {/* JS Errors */}
            {pageDetail.jsErrors?.length > 0 && (
              <ErrorLog
                errors={pageDetail.jsErrors}
                title={`${t('siteAudit.jsErrors')} (${pageDetail.jsErrors.length})`}
                maxVisible={5}
              />
            )}

            {/* Filmstrip (Loading Timeline) */}
            {(() => {
              const filmD = pageDetail.filmstripDesktop;
              const filmM = pageDetail.filmstripMobile;
              if ((!filmD || filmD.length === 0) && (!filmM || filmM.length === 0)) return null;
              return (
                <>
                  <h4 className={styles.pageDetailSubtitle}>
                    <Clock size={14} />
                    {t('siteAudit.filmstrip')}
                  </h4>
                  {filmD?.length > 0 && (
                    <div className={styles.filmstripSection}>
                      <span className={styles.filmstripDevice}>
                        <Monitor size={12} /> {t('siteAudit.desktop')}
                      </span>
                      <div className={styles.filmstripTimeline}>
                        {filmD.map((f, idx) => (
                          <div key={idx} className={styles.filmstripFrame}>
                            <img
                              src={filmSrc(f)}
                              alt={f.stage}
                              className={styles.filmstripImg}
                              onClick={() => { setPageDetail(null); setLightboxImg(filmSrc(f)); }}
                            />
                            <span className={styles.filmstripLabel}>{f.stage}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {filmM?.length > 0 && (
                    <div className={styles.filmstripSection}>
                      <span className={styles.filmstripDevice}>
                        <Smartphone size={12} /> {t('siteAudit.mobile')}
                      </span>
                      <div className={styles.filmstripTimeline}>
                        {filmM.map((f, idx) => (
                          <div key={idx} className={styles.filmstripFrame}>
                            <img
                              src={filmSrc(f)}
                              alt={f.stage}
                              className={`${styles.filmstripImg} ${styles.filmstripImgMobile}`}
                              onClick={() => { setPageDetail(null); setLightboxImg(filmSrc(f)); }}
                            />
                            <span className={styles.filmstripLabel}>{f.stage}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}

            {/* Per-Page Segmented Screenshots */}
            {(() => {
              const hasSegDesktop = pageDetail.screenshotsDesktop?.length > 0;
              const hasSegMobile = pageDetail.screenshotsMobile?.length > 0;
              const hasSingle = pageDetail.screenshotDesktop || pageDetail.screenshotMobile;

              if (!hasSegDesktop && !hasSegMobile && !hasSingle) return null;

              return (
                <>
                  <h4 className={styles.pageDetailSubtitle}>
                    <Monitor size={14} />
                    {t('siteAudit.pageScreenshots')}
                  </h4>

                  {/* Segmented screenshots (viewport-height captures) */}
                  {(hasSegDesktop || hasSegMobile) && (
                    <div className={styles.segmentedScreenshots}>
                      {hasSegDesktop && (
                        <div className={styles.segmentedGroup}>
                          <span className={styles.pdScreenshotLabel}>
                            <Monitor size={12} /> {t('siteAudit.desktop')} — {pageDetail.screenshotsDesktop.length} {t('siteAudit.segments')}
                          </span>
                          <div className={styles.segmentedGrid}>
                            {pageDetail.screenshotsDesktop.map((seg, idx) => (
                              <div
                                key={idx}
                                className={styles.segmentThumb}
                                onClick={() => { setPageDetail(null); setLightboxImg(toImgSrc(seg)); }}
                              >
                                <img
                                  src={toImgSrc(seg)}
                                  alt={`${t('siteAudit.desktop')} ${t('siteAudit.segment')} ${idx + 1}`}
                                  className={styles.segmentThumbImg}
                                />
                                <span className={styles.segmentNumber}>{idx + 1}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {hasSegMobile && (
                        <div className={styles.segmentedGroup}>
                          <span className={styles.pdScreenshotLabel}>
                            <Smartphone size={12} /> {t('siteAudit.mobile')} — {pageDetail.screenshotsMobile.length} {t('siteAudit.segments')}
                          </span>
                          <div className={styles.segmentedGrid}>
                            {pageDetail.screenshotsMobile.map((seg, idx) => (
                              <div
                                key={idx}
                                className={`${styles.segmentThumb} ${styles.segmentThumbMobile}`}
                                onClick={() => { setPageDetail(null); setLightboxImg(toImgSrc(seg)); }}
                              >
                                <img
                                  src={toImgSrc(seg)}
                                  alt={`${t('siteAudit.mobile')} ${t('siteAudit.segment')} ${idx + 1}`}
                                  className={styles.segmentThumbImg}
                                />
                                <span className={styles.segmentNumber}>{idx + 1}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Fallback: single full-page screenshots if no segments */}
                  {!hasSegDesktop && !hasSegMobile && hasSingle && (
                    <div className={styles.pdScreenshots}>
                      {pageDetail.screenshotDesktop && (
                        <div className={styles.pdScreenshotItem}>
                          <span className={styles.pdScreenshotLabel}>
                            <Monitor size={12} /> {t('siteAudit.desktop')}
                          </span>
                          <div
                            className={styles.pdScreenshotWrapper}
                            onClick={() => { setPageDetail(null); setLightboxImg(toImgSrc(pageDetail.screenshotDesktop)); }}
                          >
                            <img
                              src={toImgSrc(pageDetail.screenshotDesktop)}
                              alt={t('siteAudit.desktopScreenshot')}
                              className={styles.pdScreenshotImg}
                            />
                            <div className={styles.screenshotOverlay}>
                              <Maximize2 size={16} />
                            </div>
                          </div>
                        </div>
                      )}
                      {pageDetail.screenshotMobile && (
                        <div className={styles.pdScreenshotItem}>
                          <span className={styles.pdScreenshotLabel}>
                            <Smartphone size={12} /> {t('siteAudit.mobile')}
                          </span>
                          <div
                            className={styles.pdScreenshotWrapper}
                            onClick={() => { setPageDetail(null); setLightboxImg(toImgSrc(pageDetail.screenshotMobile)); }}
                          >
                            <img
                              src={toImgSrc(pageDetail.screenshotMobile)}
                              alt={t('siteAudit.mobileScreenshot')}
                              className={`${styles.pdScreenshotImg} ${styles.pdScreenshotMobile}`}
                            />
                            <div className={styles.screenshotOverlay}>
                              <Maximize2 size={16} />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>,
        document.body
      )}

      {/* Screenshot Lightbox */}
      {lightboxImg && createPortal(
        <div className={styles.lightbox} onClick={() => setLightboxImg(null)}>
          <button className={styles.lightboxClose} onClick={() => setLightboxImg(null)}>
            <X size={24} />
          </button>
          <img
            src={lightboxImg}
            alt={t('siteAudit.screenshotAlt')}
            className={styles.lightboxImage}
            onClick={(e) => e.stopPropagation()}
          />
        </div>,
        document.body
      )}

      {/* Plugin Required Modal (for AI Fix) */}
      <PluginRequiredModal
        open={showPluginModal}
        onClose={() => setShowPluginModal(false)}
      />

      {/* AI Title Fix Preview Modal */}
      <FixTitlePreviewModal
        open={showTitleFixModal}
        onClose={() => setShowTitleFixModal(false)}
        auditId={latestAudit?.id}
        siteId={selectedSite?.id}
        onAuditUpdated={() => fetchAudits(selectedSite?.id, activeDevice)}
      />

      {/* Favicon Media Picker */}
      <MediaModal
        isOpen={showFaviconMediaModal}
        onClose={() => setShowFaviconMediaModal(false)}
        onSelect={handleFaviconSelected}
        multiple={false}
        allowedTypes={['image']}
        title={t('siteAudit.fix.faviconModalTitle')}
      />
    </div>
  );
}
