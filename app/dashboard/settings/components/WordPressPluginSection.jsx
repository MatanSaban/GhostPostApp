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
 * 
 * @param {Object} props
 * @param {Object} props.translations - Translation strings for the component
 * @param {boolean} props.compact - If true, shows a more compact version (no auto-install)
 * @param {boolean} props.showInstructions - If true, always shows installation instructions (for entities page)
 * @param {function} props.onConnectionChange - Callback when connection status changes
 */
export default function WordPressPluginSection({ 
  translations, 
  compact = false, 
  showInstructions = false,
  onConnectionChange,
}) {
  const t = translations;
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
    if (!dateString) return t?.wordpress?.neverConnected || 'Never connected';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 5) return t?.wordpress?.justNow || 'Just now';
    if (diffMins < 60) return `${diffMins} ${t?.wordpress?.minutesAgo || 'minutes ago'}`;
    if (diffHours < 24) return `${diffHours} ${t?.wordpress?.hoursAgo || 'hours ago'}`;
    if (diffDays < 7) return `${diffDays} ${t?.wordpress?.daysAgo || 'days ago'}`;
    
    return date.toLocaleDateString();
  };

  // Get status display info
  const getStatusInfo = () => {
    switch (connectionStatus) {
      case CONNECTION_STATUS.CONNECTED:
        return {
          icon: CheckCircle2,
          label: t?.wordpress?.connected || 'Connected',
          color: 'success',
          description: t?.wordpress?.connectedDesc || 'Plugin is active and communicating',
        };
      case CONNECTION_STATUS.CONNECTING:
        return {
          icon: Loader2,
          label: t?.wordpress?.connecting || 'Connecting...',
          color: 'warning',
          description: t?.wordpress?.connectingDesc || 'Waiting for plugin activation',
        };
      case CONNECTION_STATUS.DISCONNECTED:
        return {
          icon: XCircle,
          label: t?.wordpress?.disconnected || 'Disconnected',
          color: 'error',
          description: t?.wordpress?.disconnectedDesc || 'Plugin was deactivated or uninstalled',
        };
      case CONNECTION_STATUS.ERROR:
        return {
          icon: AlertCircle,
          label: t?.wordpress?.error || 'Connection Error',
          color: 'error',
          description: t?.wordpress?.errorDesc || 'There was a problem with the connection',
        };
      default:
        return {
          icon: Clock,
          label: t?.wordpress?.notConnected || 'Not Connected',
          color: 'neutral',
          description: t?.wordpress?.notConnectedDesc || 'Install the plugin to connect your site',
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
      REST_API_UNREACHABLE: t?.wordpress?.errors?.restApiUnreachable || 'Could not reach WordPress REST API. Make sure the site is accessible and REST API is enabled.',
      REST_API_ERROR: t?.wordpress?.errors?.restApiError || 'WordPress REST API returned an error. The REST API may be disabled or blocked.',
      AUTH_REQUEST_FAILED: t?.wordpress?.errors?.authRequestFailed || 'Could not connect to WordPress for authentication. Check the site URL.',
      AUTH_FAILED: t?.wordpress?.errors?.authFailed || 'Authentication failed. Check your username and password (use an Application Password for security).',
      INSUFFICIENT_PERMISSIONS: t?.wordpress?.errors?.insufficientPermissions || 'This user does not have permission to install plugins. Admin access is required.',
      PLUGINS_API_UNAVAILABLE: t?.wordpress?.errors?.pluginsApiUnavailable || 'WordPress plugins API is not available. You may need to install the plugin manually.',
      ACTIVATION_FAILED: t?.wordpress?.errors?.activationFailed || 'The plugin is installed but could not be activated. Try activating it manually.',
      MANUAL_INSTALL_REQUIRED: t?.wordpress?.errors?.manualInstallRequired || 'The plugin cannot be installed automatically. Please download and install it manually.',
      UNKNOWN_ERROR: t?.wordpress?.errors?.unknownError || 'An unexpected error occurred during installation.',
    };
    
    return errorMessages[errorCode] || errorDetail || (t?.wordpress?.errors?.unknownError || 'An unexpected error occurred.');
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
          : data.error || (t?.wordpress?.autoInstallFailed || 'Auto-install failed');
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
    const confirmMessage = t?.wordpress?.disconnectConfirm || 
      'Are you sure you want to disconnect? You will need to download and install the plugin again to reconnect.';
    if (!window.confirm(confirmMessage)) return;

    setIsDisconnecting(true);
    setDisconnectError(null);

    try {
      const response = await fetch(`/api/sites/${selectedSite.id}/disconnect`, {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || (t?.wordpress?.disconnectFailed || 'Failed to disconnect'));
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
          >
            {isDownloading ? (
              <>
                <Loader2 size={14} className={styles.spinning} />
                {t?.wordpress?.downloading || 'Downloading...'}
              </>
            ) : (
              <>
                <Download size={14} />
                {t?.wordpress?.downloadPlugin || 'Download Plugin'}
              </>
            )}
          </button>
          
          {!isConnected && !compact && (
            <button 
              className={styles.autoInstallButton}
              onClick={() => setShowAutoInstall(!showAutoInstall)}
            >
              <Zap size={14} />
              {t?.wordpress?.autoInstall || 'Auto-Install'}
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
                  {t?.wordpress?.disconnecting || 'Disconnecting...'}
                </>
              ) : (
                <>
                  <Unplug size={14} />
                  {t?.wordpress?.disconnect || 'Disconnect'}
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
          <span>{t?.wordpress?.autoInstallSuccess || 'Plugin installed successfully! Waiting for activation...'}</span>
        </div>
      )}

      {/* Auto-Install Form */}
      {showAutoInstall && !isConnected && (
        <form className={styles.autoInstallForm} onSubmit={handleAutoInstall}>
          <div className={styles.formHeader}>
            <h4>{t?.wordpress?.autoInstallTitle || 'Auto-Install Plugin'}</h4>
            <p className={styles.formDescription}>
              {t?.wordpress?.autoInstallDesc || 'Enter your WordPress admin credentials to automatically install and activate the plugin. Your credentials are encrypted and deleted immediately after installation.'}
            </p>
          </div>
          
          <div className={styles.formFields}>
            <div className={`${styles.formGroup} ${styles.fullWidth}`}>
              <label className={styles.formLabel}>
                {t?.wordpress?.wpAdminUrl || 'WordPress Admin URL'}
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
                {t?.wordpress?.wpUsername || 'WordPress Username'}
              </label>
              <input
                type="text"
                className={styles.formInput}
                value={autoInstallForm.wpUsername}
                onChange={(e) => setAutoInstallForm(prev => ({ ...prev, wpUsername: e.target.value }))}
                placeholder={t?.wordpress?.wpUsernamePlaceholder || 'admin'}
                required
              />
            </div>
            
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                {t?.wordpress?.wpPassword || 'WordPress Password'}
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
            <button 
              type="button" 
              className={styles.cancelButton}
              onClick={() => setShowAutoInstall(false)}
            >
              {t?.common?.cancel || 'Cancel'}
            </button>
            <button 
              type="submit" 
              className={styles.submitButton}
              disabled={isAutoInstalling}
            >
              {isAutoInstalling ? (
                <>
                  <Loader2 size={14} className={styles.spinning} />
                  {t?.wordpress?.installing || 'Installing...'}
                </>
              ) : (
                <>
                  <Zap size={14} />
                  {t?.wordpress?.installNow || 'Install Now'}
                </>
              )}
            </button>
          </div>

          <p className={styles.securityNote}>
            <Key size={12} />
            {t?.wordpress?.securityNote || 'Your credentials are encrypted and automatically deleted after installation.'}
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
            {t?.wordpress?.connectionDetails || 'Connection Details'}
            {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showDetails && (
            <div className={styles.detailsGrid}>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>{t?.wordpress?.lastPing || 'Last Ping'}</span>
                <span className={styles.detailValue}>{formatLastPing(lastPingAt)}</span>
              </div>
              {pluginVersion && (
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>{t?.wordpress?.pluginVersion || 'Plugin Version'}</span>
                  <span className={styles.detailValue}>{pluginVersion}</span>
                </div>
              )}
              {wpVersion && (
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>{t?.wordpress?.wpVersion || 'WordPress Version'}</span>
                  <span className={styles.detailValue}>{wpVersion}</span>
                </div>
              )}
              {selectedSite?.siteKey && (
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>{t?.wordpress?.siteKey || 'Site Key'}</span>
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
            {t?.wordpress?.howToInstall || 'How to Install'}
          </h4>
          <ol className={styles.stepsList}>
            <li>
              <span className={styles.stepNumber}>1</span>
              <span>{t?.wordpress?.step1 || 'Download the plugin ZIP file above'}</span>
            </li>
            <li>
              <span className={styles.stepNumber}>2</span>
              <span>{t?.wordpress?.step2 || 'Go to WordPress Dashboard → Plugins → Add New → Upload Plugin'}</span>
            </li>
            <li>
              <span className={styles.stepNumber}>3</span>
              <span>{t?.wordpress?.step3 || 'Upload the ZIP file and click "Install Now"'}</span>
            </li>
            <li>
              <span className={styles.stepNumber}>4</span>
              <span>{t?.wordpress?.step4 || 'Activate the plugin - it will connect automatically'}</span>
            </li>
          </ol>
        </div>
      )}
    </div>
  );
}
