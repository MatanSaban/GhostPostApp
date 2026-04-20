'use client';

import { useState, useEffect } from 'react';
import { 
  Download, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Clock,
  Plug,
  Settings,
  ChevronDown,
  ChevronUp,
  Key,
  RefreshCw,
  Zap,
  ExternalLink,
  Unplug,
} from 'lucide-react';
import { useSite } from '@/app/context/site-context';
import { useLocale } from '@/app/context/locale-context';
import { Button } from '@/app/dashboard/components';
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
 * @param {boolean} props.compact - If true, shows a more compact version (no auto-install)
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
  const [showAutoInstall, setShowAutoInstall] = useState(false);
  const [autoInstallForm, setAutoInstallForm] = useState({
    wpAdminUrl: '',
    wpUsername: '',
    wpPassword: '',
  });
  const [isAutoInstalling, setIsAutoInstalling] = useState(false);
  const [autoInstallError, setAutoInstallError] = useState(null);
  const [autoInstallSuccess, setAutoInstallSuccess] = useState(false);
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

      // Get filename from Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition?.match(/filename="?([^"]+)"?/);
      const filename = filenameMatch?.[1] || 'ghost-post-connector.zip';

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

  // Get translated error message from error code
  const getAutoInstallErrorMessage = (errorCode, errorDetail) => {
    const errorMessages = {
      REST_API_UNREACHABLE: t('settings.wordpress.errors.restApiUnreachable'),
      REST_API_ERROR: t('settings.wordpress.errors.restApiError'),
      AUTH_REQUEST_FAILED: t('settings.wordpress.errors.authRequestFailed'),
      AUTH_FAILED: t('settings.wordpress.errors.authFailed'),
      INSUFFICIENT_PERMISSIONS: t('settings.wordpress.errors.insufficientPermissions'),
      PLUGINS_API_UNAVAILABLE: t('settings.wordpress.errors.pluginsApiUnavailable'),
      ACTIVATION_FAILED: t('settings.wordpress.errors.activationFailed'),
      MANUAL_INSTALL_REQUIRED: t('settings.wordpress.errors.manualInstallRequired'),
      UNKNOWN_ERROR: t('settings.wordpress.errors.unknownError'),
    };
    
    return errorMessages[errorCode] || errorDetail || t('settings.wordpress.errors.unknownError');
  };

  // Handle auto-install
  const handleAutoInstall = async (e) => {
    e.preventDefault();
    if (!selectedSite?.id) return;

    setIsAutoInstalling(true);
    setAutoInstallError(null);
    setAutoInstallSuccess(false);

    try {
      const response = await fetch(`/api/sites/${selectedSite.id}/auto-install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wpAdminUrl: autoInstallForm.wpAdminUrl || `${selectedSite.url}/wp-admin`,
          username: autoInstallForm.wpUsername,
          password: autoInstallForm.wpPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Use error code if available, otherwise use the error message
        const errorMessage = data.errorCode 
          ? getAutoInstallErrorMessage(data.errorCode, data.errorDetail)
          : data.error || t('settings.wordpress.autoInstallFailed');
        throw new Error(errorMessage);
      }

      setAutoInstallSuccess(true);
      setAutoInstallForm({ wpAdminUrl: '', wpUsername: '', wpPassword: '' });
      setShowAutoInstall(false);
      
      // Refresh sites to get updated status
      refreshSites();
      onConnectionChange?.();
    } catch (error) {
      console.error('Auto-install error:', error);
      setAutoInstallError(error.message);
    } finally {
      setIsAutoInstalling(false);
    }
  };

  // Reset messages when site changes
  useEffect(() => {
    setDownloadError(null);
    setAutoInstallError(null);
    setAutoInstallSuccess(false);
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
          
          {!isConnected && !compact && (
            <button 
              className={styles.autoInstallButton}
              onClick={() => setShowAutoInstall(!showAutoInstall)}
            >
              <Zap size={14} />
              {t('settings.wordpress.autoInstall')}
              {showAutoInstall ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
          
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

      {autoInstallSuccess && (
        <div className={styles.successMessage}>
          <CheckCircle2 size={14} />
          <span>{t('settings.wordpress.autoInstallSuccess')}</span>
        </div>
      )}

      {/* Auto-Install Form */}
      {showAutoInstall && !isConnected && (
        <form className={styles.autoInstallForm} onSubmit={handleAutoInstall}>
          <div className={styles.formHeader}>
            <h4>{t('settings.wordpress.autoInstallTitle')}</h4>
            <p className={styles.formDescription}>
              {t('settings.wordpress.autoInstallDesc')}
            </p>
          </div>
          
          <div className={styles.formFields}>
            <div className={`${styles.formGroup} ${styles.fullWidth}`}>
              <label className={styles.formLabel}>
                {t('settings.wordpress.wpAdminUrl')}
              </label>
              <input
                type="url"
                className={styles.formInput}
                value={autoInstallForm.wpAdminUrl || `${selectedSite?.url || ''}/wp-admin`}
                onChange={(e) => setAutoInstallForm(prev => ({ ...prev, wpAdminUrl: e.target.value }))}
                placeholder="https://example.com/wp-admin"
                required
              />
            </div>
            
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                {t('settings.wordpress.wpUsername')}
              </label>
              <input
                type="text"
                className={styles.formInput}
                value={autoInstallForm.wpUsername}
                onChange={(e) => setAutoInstallForm(prev => ({ ...prev, wpUsername: e.target.value }))}
                placeholder={t('settings.wordpress.wpUsernamePlaceholder')}
                required
              />
            </div>
            
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                {t('settings.wordpress.wpPassword')}
              </label>
              <input
                type="password"
                className={styles.formInput}
                value={autoInstallForm.wpPassword}
                onChange={(e) => setAutoInstallForm(prev => ({ ...prev, wpPassword: e.target.value }))}
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          {autoInstallError && (
            <div className={styles.errorMessage}>
              <AlertCircle size={14} />
              <span>{autoInstallError}</span>
            </div>
          )}

          <div className={styles.formActions}>
            <Button 
              type="button" 
              onClick={() => setShowAutoInstall(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button 
              type="submit" 
              variant="primary"
              disabled={isAutoInstalling}
            >
              {isAutoInstalling ? (
                <>
                  <Loader2 size={14} className={styles.spinning} />
                  {t('settings.wordpress.installing')}
                </>
              ) : (
                <>
                  <Zap size={14} />
                  {t('settings.wordpress.installNow')}
                </>
              )}
            </Button>
          </div>

          <p className={styles.securityNote}>
            <Key size={12} />
            {t('settings.wordpress.securityNote')}
          </p>
        </form>
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
      {(showInstructions || (!isConnected && !showAutoInstall)) && (
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
