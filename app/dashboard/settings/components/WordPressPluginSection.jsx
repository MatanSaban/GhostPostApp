'use client';

import { useState, useEffect } from 'react';
import {
  Download,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Settings,
  ChevronDown,
  ChevronUp,
  Unplug,
} from 'lucide-react';
import { useSite } from '@/app/context/site-context';
import { useLocale } from '@/app/context/locale-context';
import styles from './WordPressPluginSection.module.css';

const CONNECTION_STATUS = {
  PENDING: 'PENDING',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  DISCONNECTED: 'DISCONNECTED',
  ERROR: 'ERROR',
};

/**
 * WordPressPluginSection - Reusable component for WordPress plugin connection
 * Uses useLocale() internally for translations (settings.wordpress.* keys)
 * 
 * @param {Object} props
 * @param {boolean} props.compact - If true, shows a more compact version
 * @param {boolean} props.showInstructions - If true, always shows installation instructions (for entities page)
 * @param {function} props.onConnectionChange - Callback when connection status changes
 */
export default function WordPressPluginSection({
  compact = false,
  showInstructions = false,
  onConnectionChange,
}) {
  const { t, locale } = useLocale();
  const { selectedSite, refreshSites } = useSite();

  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState(null);

  // Get connection status from site
  const connectionStatus = selectedSite?.connectionStatus || CONNECTION_STATUS.PENDING;
  const isConnected = connectionStatus === CONNECTION_STATUS.CONNECTED;
  const lastPingAt = selectedSite?.lastPingAt;
  const pluginVersion = selectedSite?.pluginVersion;
  const wpVersion = selectedSite?.wpVersion;

  // Format last ping time
  const formatLastPing = (dateString) => {
    if (!dateString) return t('settings.wordpress.neverConnected');
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 5) return t('settings.wordpress.justNow');
    if (diffMins < 60) return `${diffMins} ${t('settings.wordpress.minutesAgo')}`;
    if (diffHours < 24) return `${diffHours} ${t('settings.wordpress.hoursAgo')}`;
    if (diffDays < 7) return `${diffDays} ${t('settings.wordpress.daysAgo')}`;
    
    return date.toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US');
  };

  // Get status display info
  const getStatusInfo = () => {
    switch (connectionStatus) {
      case CONNECTION_STATUS.CONNECTED:
        return {
          icon: CheckCircle2,
          label: t('settings.wordpress.connected'),
          color: 'success',
          description: t('settings.wordpress.connectedDesc'),
        };
      case CONNECTION_STATUS.CONNECTING:
        return {
          icon: Loader2,
          label: t('settings.wordpress.connecting'),
          color: 'warning',
          description: t('settings.wordpress.connectingDesc'),
        };
      case CONNECTION_STATUS.DISCONNECTED:
        return {
          icon: XCircle,
          label: t('settings.wordpress.disconnected'),
          color: 'error',
          description: t('settings.wordpress.disconnectedDesc'),
        };
      case CONNECTION_STATUS.ERROR:
        return {
          icon: AlertCircle,
          label: t('settings.wordpress.error'),
          color: 'error',
          description: t('settings.wordpress.errorDesc'),
        };
      default:
        return {
          icon: Clock,
          label: t('settings.wordpress.notConnected'),
          color: 'neutral',
          description: t('settings.wordpress.notConnectedDesc'),
        };
    }
  };

  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;

  // Handle plugin download
  const handleDownload = async () => {
    if (!selectedSite?.id) return;

    setIsDownloading(true);
    setDownloadError(null);

    try {
      const response = await fetch(`/api/sites/${selectedSite.id}/download-plugin`);
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to download plugin');
      }

      // Get filename from Content-Disposition header. Prefer RFC 5987's
      // `filename*=UTF-8''<percent-encoded>` over the legacy `filename="…"`
      // so non-Latin site names (Hebrew, Arabic, …) render correctly. The
      // legacy parameter contains an ASCII-only fallback (Hebrew chars
      // replaced with `_`) on purpose - picking it up here is what was
      // saving sites named "קידוז" as "____" before this fix.
      const cd = response.headers.get('Content-Disposition') || '';
      const utf8Match = cd.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
      const legacyMatch = cd.match(/filename(?!\*)\s*=\s*"?([^";]+)"?/i);
      let filename = 'ghostseo-connector.zip';
      if (utf8Match?.[1]) {
        try { filename = decodeURIComponent(utf8Match[1]); }
        catch { filename = utf8Match[1]; }
      } else if (legacyMatch?.[1]) {
        filename = legacyMatch[1];
      }

      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      // Refresh sites to get updated connection status
      refreshSites();
      onConnectionChange?.();
    } catch (error) {
      console.error('Download error:', error);
      setDownloadError(error.message);
    } finally {
      setIsDownloading(false);
    }
  };

  // Reset messages when site changes
  useEffect(() => {
    setDownloadError(null);
    setDisconnectError(null);
  }, [selectedSite?.id]);

  // Handle disconnect
  const handleDisconnect = async () => {
    if (!selectedSite?.id) return;
    
    // Confirm before disconnecting
    const confirmMessage = t('settings.wordpress.disconnectConfirm');
    if (!window.confirm(confirmMessage)) return;

    setIsDisconnecting(true);
    setDisconnectError(null);

    try {
      const response = await fetch(`/api/sites/${selectedSite.id}/disconnect`, {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t('settings.wordpress.disconnectFailed'));
      }

      // Refresh sites to get updated status
      refreshSites();
      onConnectionChange?.();
    } catch (error) {
      console.error('Disconnect error:', error);
      setDisconnectError(error.message);
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <div className={`${styles.container} ${compact ? styles.compact : ''}`}>
      {/* Status Header */}
      <div className={styles.statusHeader}>
        <div className={styles.statusInfo}>
          <div className={`${styles.statusBadge} ${styles[statusInfo.color]}`}>
            <StatusIcon 
              size={16} 
              className={connectionStatus === CONNECTION_STATUS.CONNECTING ? styles.spinning : ''} 
            />
            <span>{statusInfo.label}</span>
          </div>
          <p className={styles.statusDescription}>{statusInfo.description}</p>
        </div>

        {/* Quick Actions */}
        <div className={styles.quickActions}>
          <button
            className={styles.downloadButton}
            onClick={handleDownload}
            disabled={isDownloading}
            data-onboarding="plugin-download-button"
          >
            {isDownloading ? (
              <>
                <Loader2 size={14} className={styles.spinning} />
                {t('settings.wordpress.downloading')}
              </>
            ) : (
              <>
                <Download size={14} />
                {t('settings.wordpress.downloadPlugin')}
              </>
            )}
          </button>
          
          {isConnected && (
            <button 
              className={styles.disconnectButton}
              onClick={handleDisconnect}
              disabled={isDisconnecting}
            >
              {isDisconnecting ? (
                <>
                  <Loader2 size={14} className={styles.spinning} />
                  {t('settings.wordpress.disconnecting')}
                </>
              ) : (
                <>
                  <Unplug size={14} />
                  {t('settings.wordpress.disconnect')}
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Error Messages */}
      {downloadError && (
        <div className={styles.errorMessage}>
          <AlertCircle size={14} />
          <span>{downloadError}</span>
        </div>
      )}

      {disconnectError && (
        <div className={styles.errorMessage}>
          <AlertCircle size={14} />
          <span>{disconnectError}</span>
        </div>
      )}

      {/* Connection Details (when connected) */}
      {isConnected && (
        <div className={styles.connectionDetails}>
          <button 
            className={styles.detailsToggle}
            onClick={() => setShowDetails(!showDetails)}
          >
            <Settings size={14} />
            {t('settings.wordpress.connectionDetails')}
            {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showDetails && (
            <div className={styles.detailsGrid}>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>{t('settings.wordpress.lastPing')}</span>
                <span className={styles.detailValue}>{formatLastPing(lastPingAt)}</span>
              </div>
              {pluginVersion && (
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>{t('settings.wordpress.pluginVersion')}</span>
                  <span className={styles.detailValue}>{pluginVersion}</span>
                </div>
              )}
              {wpVersion && (
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>{t('settings.wordpress.wpVersion')}</span>
                  <span className={styles.detailValue}>{wpVersion}</span>
                </div>
              )}
              {selectedSite?.siteKey && (
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>{t('settings.wordpress.siteKey')}</span>
                  <span className={`${styles.detailValue} ${styles.monospace}`}>
                    {selectedSite.siteKey.substring(0, 8)}...
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Installation Steps (when not connected or showInstructions is true) */}
      {(showInstructions || !isConnected) && (
        <div className={styles.installationSteps}>
          <h4 className={styles.stepsTitle}>
            {t('settings.wordpress.howToInstall')}
          </h4>
          <ol className={styles.stepsList}>
            <li>
              <span className={styles.stepNumber}>1</span>
              <span>{t('settings.wordpress.step1')}</span>
            </li>
            <li>
              <span className={styles.stepNumber}>2</span>
              <span>{t('settings.wordpress.step2')}</span>
            </li>
            <li>
              <span className={styles.stepNumber}>3</span>
              <span>{t('settings.wordpress.step3')}</span>
            </li>
            <li>
              <span className={styles.stepNumber}>4</span>
              <span>{t('settings.wordpress.step4')}</span>
            </li>
          </ol>
        </div>
      )}
    </div>
  );
}
