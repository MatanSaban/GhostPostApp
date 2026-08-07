'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Code2,
  Copy,
  Check,
  Info,
  Cloud,
  Terminal,
  ChevronDown,
  ChevronUp,
  PauseCircle,
  PlayCircle,
} from 'lucide-react';
import { useSite } from '@/app/context/site-context';
import { useLocale } from '@/app/context/locale-context';
import styles from './CustomSiteConnectionSection.module.css';

const CONNECTION_STATUS = {
  PENDING: 'PENDING',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  DISCONNECTED: 'DISCONNECTED',
  ERROR: 'ERROR',
};

const POLL_INTERVAL_MS = 30000;
const BASE_URL = 'https://app.ghostseo.ai';

// Human-readable transport names (product terms - not translated)
const TRANSPORT_LABELS = {
  SDK: 'SDK',
  EDGE_PROXY: 'Edge proxy',
  MCP: 'MCP',
  GITHUB_APP: 'GitHub App',
  CUSTOM_API: 'Custom API',
};

/**
 * CustomSiteConnectionSection
 *
 * Connection panel for custom-code (non-WordPress/Shopify) sites that
 * integrate via the GhostSEO SDK + public Contract API. Shows the public
 * site key, live connection status (polled from the connection-status
 * endpoint every 30s, including per-transport data), and step-by-step
 * install instructions for the two transports: the @ghostseo/seo SDK and
 * the managed Cloudflare edge proxy.
 *
 * Uses useLocale() internally for translations (settings.customSite.* keys)
 * with inline English fallbacks until the dictionary keys land.
 *
 * @param {Object} props
 * @param {boolean} props.compact - If true, tighter paddings and the install
 *   instructions are hidden behind a toggle (for reuse on the entities page)
 * @param {function} props.onConnectionChange - Callback when connection status changes
 */
export default function CustomSiteConnectionSection({
  compact = false,
  onConnectionChange,
} = {}) {
  const { t, locale } = useLocale();
  const { selectedSite, refreshSites } = useSite();

  // t() echoes the key when a translation is missing - fall back to English
  // so the section works before the dictionary keys land.
  const tr = useCallback(
    (key, fallback) => {
      const value = t(key);
      return value === key ? fallback : value;
    },
    [t],
  );

  const [statusData, setStatusData] = useState(null);
  const [integrations, setIntegrations] = useState([]);
  const [confirmTarget, setConfirmTarget] = useState(null); // transport type awaiting pause/resume confirm
  const [savingType, setSavingType] = useState(null);
  const [toggleErrorType, setToggleErrorType] = useState(null);
  const [activeTab, setActiveTab] = useState('sdk');
  const [showSetup, setShowSetup] = useState(!compact);
  const [copiedField, setCopiedField] = useState(null);
  const [origin, setOrigin] = useState('');
  const promotedRef = useRef(false);

  // Resolved on mount (not during render) to avoid an SSR hydration mismatch
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Poll the connection-status endpoint every 30s while mounted
  const fetchStatus = useCallback(async () => {
    if (!selectedSite?.id) return;
    try {
      const response = await fetch(`/api/sites/${selectedSite.id}/connection-status`);
      if (!response.ok) return;
      const data = await response.json();
      setStatusData(data);
    } catch {
      /* network hiccup - keep the last known status */
    }
  }, [selectedSite?.id]);

  // Transport rows (with kill-switch state) from the integrations endpoint
  const fetchIntegrations = useCallback(async () => {
    if (!selectedSite?.id) return;
    try {
      const response = await fetch(`/api/sites/${selectedSite.id}/integrations`);
      if (!response.ok) return;
      const data = await response.json();
      setIntegrations(data.integrations || []);
    } catch {
      /* network hiccup - keep the last known rows */
    }
  }, [selectedSite?.id]);

  useEffect(() => {
    setStatusData(null);
    setIntegrations([]);
    setConfirmTarget(null);
    setToggleErrorType(null);
    promotedRef.current = false;
    fetchStatus();
    fetchIntegrations();
    const interval = setInterval(() => {
      fetchStatus();
      fetchIntegrations();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchStatus, fetchIntegrations]);

  // Flip a transport's kill switch (after the inline confirm step)
  const applyKillSwitch = async (type, killSwitch) => {
    if (!selectedSite?.id) return;
    setSavingType(type);
    setToggleErrorType(null);
    try {
      const response = await fetch(`/api/sites/${selectedSite.id}/integrations`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, killSwitch }),
      });
      if (!response.ok) throw new Error('patch failed');
      const data = await response.json();
      setIntegrations((rows) =>
        rows.map((row) => (row.type === type ? { ...row, ...data.integration } : row)),
      );
    } catch {
      setToggleErrorType(type);
    } finally {
      setSavingType(null);
      setConfirmTarget(null);
    }
  };

  // When the poll sees the site flip to CONNECTED, refresh the site context
  // once so the rest of the dashboard picks up the new connectionStatus.
  useEffect(() => {
    if (promotedRef.current) return;
    if (
      statusData?.connectionStatus === CONNECTION_STATUS.CONNECTED &&
      selectedSite?.connectionStatus !== CONNECTION_STATUS.CONNECTED
    ) {
      promotedRef.current = true;
      refreshSites();
      onConnectionChange?.();
    }
  }, [statusData, selectedSite?.connectionStatus, refreshSites, onConnectionChange]);

  const status =
    statusData?.connectionStatus || selectedSite?.connectionStatus || CONNECTION_STATUS.PENDING;
  const transports = statusData?.transports || [];

  // Most recent contract fetch across all transports (SDK / edge proxy / MCP)
  const lastSeenAt = transports.reduce((latest, transport) => {
    if (!transport.lastSeenAt) return latest;
    const seen = new Date(transport.lastSeenAt);
    return !latest || seen > latest ? seen : latest;
  }, null);
  const clientVersion = transports.find((transport) => transport.clientVersion)?.clientVersion;

  const siteKey = selectedSite?.siteKey || '';
  const siteKeyDisplay = siteKey || 'gp_site_...';
  const manifestUrl =
    siteKey && origin ? `${origin}/api/public/sites/${siteKey}/manifest` : '';

  // Format last fetch time (relative, formatLastPing-style)
  const formatLastSeen = (date) => {
    if (!date) return tr('settings.customSite.neverFetched', 'no fetch recorded yet');

    const diffMs = new Date() - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 2) return tr('settings.customSite.justNow', 'just now');
    if (diffMins < 60) return `${diffMins} ${tr('settings.customSite.minutesAgo', 'min ago')}`;
    if (diffHours < 24) return `${diffHours} ${tr('settings.customSite.hoursAgo', 'hours ago')}`;
    if (diffDays < 7) return `${diffDays} ${tr('settings.customSite.daysAgo', 'days ago')}`;

    return date.toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US');
  };

  const statusInfo = (() => {
    switch (status) {
      case CONNECTION_STATUS.CONNECTED:
        return {
          Icon: CheckCircle2,
          label: tr('settings.customSite.connected', 'Connected'),
          color: 'success',
        };
      case CONNECTION_STATUS.ERROR:
        return {
          Icon: AlertCircle,
          label: tr('settings.customSite.error', 'Error'),
          color: 'error',
        };
      case CONNECTION_STATUS.DISCONNECTED:
        return {
          Icon: XCircle,
          label: tr('settings.customSite.disconnected', 'Disconnected'),
          color: 'error',
        };
      default:
        return {
          Icon: Clock,
          label: tr('settings.customSite.pending', 'Pending'),
          color: 'warning',
        };
    }
  })();

  const StatusIcon = statusInfo.Icon;
  const isConnected = status === CONNECTION_STATUS.CONNECTED;

  const copyValue = async (field, value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField((f) => (f === field ? null : f)), 2000);
    } catch { /* clipboard unavailable */ }
  };

  const installSnippet = 'npm install @ghostseo/seo';

  const clientSnippet = `// lib/ghostseo.js
import { createClient } from '@ghostseo/seo';

export const gs = createClient({
  siteKey: '${siteKeyDisplay}',
  baseUrl: '${BASE_URL}',
});`;

  const metadataSnippet = `// any page.js / layout.js in your App Router
import { metadataForPath } from '@ghostseo/seo';
import { gs } from '@/lib/ghostseo';

export async function generateMetadata() {
  return metadataForPath(gs, '/'); // pass this page's path
}`;

  const redirectsSnippet = `// next.config.mjs (optional - managed redirects)
import { createClient, toNextRedirects } from '@ghostseo/seo';

const gs = createClient({
  siteKey: '${siteKeyDisplay}',
  baseUrl: '${BASE_URL}',
});

const nextConfig = {
  async redirects() {
    return toNextRedirects(gs);
  },
};

export default nextConfig;`;

  const sdkSteps = [
    {
      copyKey: 'install',
      label: tr('settings.customSite.sdkStep1', 'Install the SDK package:'),
      code: installSnippet,
    },
    {
      copyKey: 'client',
      label: tr(
        'settings.customSite.sdkStep2',
        'Create lib/ghostseo.js and initialize the client with your site key:',
      ),
      code: clientSnippet,
    },
    {
      copyKey: 'metadata',
      label: tr(
        'settings.customSite.sdkStep3',
        'Wire SEO metadata into your pages with generateMetadata:',
      ),
      code: metadataSnippet,
    },
    {
      copyKey: 'redirects',
      label: tr(
        'settings.customSite.sdkStep4',
        'Optional: serve managed redirects from next.config:',
      ),
      code: redirectsSnippet,
    },
  ];

  const renderCodeBlock = (code, copyKey) => (
    <div className={styles.codeBlock} dir="ltr">
      <pre className={styles.codePre}>{code}</pre>
      <button
        type="button"
        className={styles.copyCodeButton}
        onClick={() => copyValue(copyKey, code)}
        aria-label={tr('settings.customSite.copy', 'Copy')}
        title={tr('settings.customSite.copy', 'Copy')}
      >
        {copiedField === copyKey ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );

  if (!selectedSite) return null;

  return (
    <div className={`${styles.container} ${compact ? styles.compact : ''}`}>
      {/* Status Header */}
      <div className={styles.statusInfo}>
        <div className={`${styles.statusBadge} ${styles[statusInfo.color]}`}>
          <StatusIcon size={14} />
          <span>{statusInfo.label}</span>
        </div>
        <h3 className={styles.title}>
          <Code2 size={18} />
          {tr('settings.customSite.title', 'Custom Site Connection (SDK)')}
        </h3>
        {isConnected ? (
          <p className={styles.description}>
            {tr('settings.customSite.lastFetch', 'Last SDK fetch')}: {formatLastSeen(lastSeenAt)}
            {clientVersion ? ` · ${clientVersion}` : ''}
            <span className={styles.cacheNote}>
              {' '}
              ({tr(
                'settings.customSite.cacheLagNote',
                'responses are edge-cached ~15 min, so this can lag',
              )})
            </span>
          </p>
        ) : (
          <p className={styles.description}>
            {tr(
              'settings.customSite.pendingDesc',
              'Waiting for the first contract fetch from your site.',
            )}
          </p>
        )}
        <p className={styles.description}>
          {tr(
            'settings.customSite.description',
            'Custom-code sites connect through the GhostSEO SDK: it reads this site’s public Contract API (titles, metas, redirects) and applies them at render time — no plugin needed.',
          )}
        </p>
      </div>

      {/* Site Key */}
      <div className={styles.fieldGroup}>
        <span className={styles.label}>
          {tr('settings.customSite.siteKeyLabel', 'Site key (public)')}
        </span>
        <div className={styles.valueRow}>
          <code className={styles.value} dir="ltr">{siteKey || '-'}</code>
          {siteKey && (
            <button type="button" className={styles.copyButton} onClick={() => copyValue('key', siteKey)}>
              {copiedField === 'key' ? <Check size={14} /> : <Copy size={14} />}
              {copiedField === 'key'
                ? tr('settings.customSite.copied', 'Copied')
                : tr('settings.customSite.copy', 'Copy')}
            </button>
          )}
        </div>
        <p className={styles.fieldNote}>
          <Info size={12} />
          <span>
            {tr(
              'settings.customSite.siteKeyNote',
              'This is a public identifier, not a secret - it is safe to commit and ship to the browser.',
            )}
          </span>
        </p>
      </div>

      {/* Contract Manifest URL */}
      {manifestUrl && (
        <div className={styles.fieldGroup}>
          <span className={styles.label}>
            {tr('settings.customSite.manifestLabel', 'Contract manifest URL')}
          </span>
          <div className={styles.valueRow}>
            <code className={styles.value} dir="ltr">{manifestUrl}</code>
            <button type="button" className={styles.copyButton} onClick={() => copyValue('manifest', manifestUrl)}>
              {copiedField === 'manifest' ? <Check size={14} /> : <Copy size={14} />}
              {copiedField === 'manifest'
                ? tr('settings.customSite.copied', 'Copied')
                : tr('settings.customSite.copy', 'Copy')}
            </button>
          </div>
        </div>
      )}

      {/* Connected transports + per-transport kill switch */}
      {integrations.length > 0 && (
        <div className={styles.fieldGroup}>
          <span className={styles.label}>
            {tr('settings.customSite.transportsTitle', 'Connected transports')}
          </span>
          <ul className={styles.transportsList}>
            {integrations.map((row) => {
              const paused = Boolean(row.killSwitch);
              const isConfirming = confirmTarget === row.type;
              const isSaving = savingType === row.type;
              return (
                <li key={row.type} className={styles.transportRow}>
                  <div className={styles.transportInfo}>
                    <span className={styles.transportName}>
                      {TRANSPORT_LABELS[row.type] || row.type}
                    </span>
                    {paused ? (
                      <span className={`${styles.statusBadge} ${styles.badgeSm} ${styles.warning}`}>
                        <PauseCircle size={12} />
                        {tr('settings.customSite.paused', 'Paused')}
                      </span>
                    ) : row.status === 'CONNECTED' ? (
                      <span className={`${styles.statusBadge} ${styles.badgeSm} ${styles.success}`}>
                        <CheckCircle2 size={12} />
                        {tr('settings.customSite.connected', 'Connected')}
                      </span>
                    ) : (
                      <span className={`${styles.statusBadge} ${styles.badgeSm} ${styles.neutral}`}>
                        {row.status}
                      </span>
                    )}
                    <span className={styles.transportMeta}>
                      {formatLastSeen(row.lastSeenAt ? new Date(row.lastSeenAt) : null)}
                      {row.clientVersion ? ` · ${row.clientVersion}` : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={styles.pauseButton}
                    disabled={isSaving}
                    onClick={() => {
                      setToggleErrorType(null);
                      setConfirmTarget(isConfirming ? null : row.type);
                    }}
                  >
                    {paused ? <PlayCircle size={14} /> : <PauseCircle size={14} />}
                    {paused
                      ? tr('settings.customSite.resumeGhostSeo', 'Resume GhostSEO')
                      : tr('settings.customSite.pauseGhostSeo', 'Pause GhostSEO')}
                  </button>
                  {isConfirming && (
                    <div className={styles.confirmBox}>
                      <p>
                        {paused
                          ? tr(
                              'settings.customSite.resumeConfirm',
                              'Resuming lets GhostSEO serve SEO metadata and redirects for this site again. Propagation can take up to ~5 minutes (edge caches).',
                            )
                          : tr(
                              'settings.customSite.pauseConfirm',
                              'Pausing stops GhostSEO from serving SEO metadata and redirects for this site. Propagation can take up to ~5 minutes (edge caches).',
                            )}
                      </p>
                      <div className={styles.confirmActions}>
                        <button
                          type="button"
                          className={styles.confirmButton}
                          disabled={isSaving}
                          onClick={() => applyKillSwitch(row.type, !paused)}
                        >
                          {paused
                            ? tr('settings.customSite.confirmResume', 'Yes, resume')
                            : tr('settings.customSite.confirmPause', 'Yes, pause')}
                        </button>
                        <button
                          type="button"
                          className={styles.copyButton}
                          disabled={isSaving}
                          onClick={() => setConfirmTarget(null)}
                        >
                          {tr('settings.customSite.cancel', 'Cancel')}
                        </button>
                      </div>
                    </div>
                  )}
                  {toggleErrorType === row.type && (
                    <p className={styles.fieldNote}>
                      <AlertCircle size={12} />
                      <span>
                        {tr('settings.customSite.updateFailed', 'Update failed - please try again.')}
                      </span>
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Setup Instructions (behind a toggle in compact mode) */}
      {compact && (
        <button
          type="button"
          className={styles.setupToggle}
          onClick={() => setShowSetup(!showSetup)}
        >
          <Terminal size={14} />
          {tr('settings.customSite.setupInstructions', 'Setup instructions')}
          {showSetup ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      )}

      {showSetup && (
        <div className={styles.setupSection}>
          {/* Transport Tabs */}
          <div className={styles.tabs} role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'sdk'}
              className={`${styles.tab} ${activeTab === 'sdk' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('sdk')}
            >
              <Terminal size={14} />
              {tr('settings.customSite.tabSdk', 'SDK (recommended)')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'edge'}
              className={`${styles.tab} ${activeTab === 'edge' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('edge')}
            >
              <Cloud size={14} />
              {tr('settings.customSite.tabEdge', 'Edge proxy')}
            </button>
          </div>

          {activeTab === 'sdk' ? (
            <>
              <ol className={styles.stepsList}>
                {sdkSteps.map((step, index) => (
                  <li key={step.copyKey}>
                    <span className={styles.stepNumber}>{index + 1}</span>
                    <div className={styles.stepBody}>
                      <span className={styles.stepLabel}>{step.label}</span>
                      {renderCodeBlock(step.code, step.copyKey)}
                    </div>
                  </li>
                ))}
              </ol>
              <p className={styles.fieldNote}>
                <Info size={12} />
                <span>
                  {tr(
                    'settings.customSite.vendorNote',
                    'Until the npm package is live, you can vendor the SDK by copying its source files into lib/ghostseo/ and importing from there.',
                  )}
                </span>
              </p>
            </>
          ) : (
            <div className={styles.edgePanel}>
              <p className={styles.description}>
                {tr(
                  'settings.customSite.edgeDesc',
                  'Whole-site, zero-code integration: a Cloudflare edge proxy sits in front of your existing site and applies SEO fixes on the fly - no code changes required.',
                )}
              </p>
              <span className={styles.managedBadge}>
                {tr(
                  'settings.customSite.edgeManaged',
                  'Managed setup - contact us to enable it for your site.',
                )}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
