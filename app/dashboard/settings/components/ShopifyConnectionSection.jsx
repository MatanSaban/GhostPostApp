'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Loader2,
  Store,
  ExternalLink,
  Unplug,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useSite } from '@/app/context/site-context';
import { useLocale } from '@/app/context/locale-context';
import { Button } from '@/app/dashboard/components';
import styles from './ShopifyConnectionSection.module.css';

const CONNECTION_STATUS = {
  PENDING: 'PENDING',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  DISCONNECTED: 'DISCONNECTED',
  ERROR: 'ERROR',
};

const SHOP_DOMAIN_PATTERN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

// TODO i18n: move these to dictionaries under settings.shopify.*
const COPY = {
  title: 'Shopify Connection',
  description:
    'Connect your Shopify store so GhostSEO can manage products, pages, articles, SEO metadata, and redirects on your behalf.',
  connected: 'Connected',
  connectedDesc: 'GhostSEO is synced with your Shopify store.',
  notConnected: 'Not connected',
  notConnectedDesc: 'Install the GhostSEO app on your Shopify store to begin.',
  disconnected: 'Disconnected',
  disconnectedDesc:
    'The connection to your Shopify store has been removed from GhostSEO.',
  error: 'Error',
  errorDesc: 'Something went wrong with the connection.',
  shopDomainLabel: 'Shop domain',
  shopDomainPlaceholder: 'your-store.myshopify.com',
  shopDomainHint:
    'Enter the .myshopify.com domain (not your custom domain). Example: acme-store.myshopify.com',
  shopDomainInvalid:
    'Must be a valid *.myshopify.com domain (e.g. acme-store.myshopify.com).',
  connectButton: 'Connect Shopify',
  connecting: 'Redirecting to Shopify…',
  connectionDetails: 'Connection details',
  shopDomainField: 'Shop domain',
  scopes: 'Granted scopes',
  installedAt: 'Installed at',
  disconnect: 'Disconnect',
  disconnecting: 'Disconnecting…',
  disconnectConfirm:
    'Are you sure? GhostSEO will stop managing this Shopify store. To fully revoke access, you must also uninstall the app from Shopify admin → Settings → Apps.',
  disconnectFailed: 'Failed to disconnect - please try again.',
};

/**
 * ShopifyConnectionSection
 *
 * Shows Shopify connection status for the currently selected site and lets
 * the user start the OAuth install or disconnect.
 */
export default function ShopifyConnectionSection({ compact = false } = {}) {
  const { locale } = useLocale();
  const { selectedSite, refreshSites } = useSite();

  const [shopInput, setShopInput] = useState('');
  const [shopError, setShopError] = useState(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  const status = selectedSite?.connectionStatus || CONNECTION_STATUS.PENDING;
  const isConnected = status === CONNECTION_STATUS.CONNECTED;
  const shopifyDomain = selectedSite?.shopifyDomain;
  const shopifyScopes = selectedSite?.shopifyScopes || [];
  const shopifyAppInstalledAt = selectedSite?.shopifyAppInstalledAt;

  const statusInfo = (() => {
    switch (status) {
      case CONNECTION_STATUS.CONNECTED:
        return {
          Icon: CheckCircle2,
          label: COPY.connected,
          color: 'success',
          description: COPY.connectedDesc,
        };
      case CONNECTION_STATUS.CONNECTING:
        return {
          Icon: Loader2,
          label: COPY.connecting,
          color: 'warning',
          description: COPY.connecting,
        };
      case CONNECTION_STATUS.DISCONNECTED:
        return {
          Icon: XCircle,
          label: COPY.disconnected,
          color: 'error',
          description: COPY.disconnectedDesc,
        };
      case CONNECTION_STATUS.ERROR:
        return {
          Icon: AlertCircle,
          label: COPY.error,
          color: 'error',
          description: COPY.errorDesc,
        };
      default:
        return {
          Icon: Clock,
          label: COPY.notConnected,
          color: 'neutral',
          description: COPY.notConnectedDesc,
        };
    }
  })();

  const StatusIcon = statusInfo.Icon;

  const handleConnect = () => {
    const shop = shopInput.trim().toLowerCase();
    if (!SHOP_DOMAIN_PATTERN.test(shop)) {
      setShopError(COPY.shopDomainInvalid);
      return;
    }
    if (!selectedSite?.id) return;
    setShopError(null);
    setIsRedirecting(true);
    const params = new URLSearchParams({ shop, siteId: selectedSite.id });
    window.location.href = `/api/shopify/install?${params.toString()}`;
  };

  const handleDisconnect = async () => {
    if (!selectedSite?.id) return;
    if (!window.confirm(COPY.disconnectConfirm)) return;
    setIsDisconnecting(true);
    setDisconnectError(null);
    try {
      const res = await fetch('/api/shopify/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: selectedSite.id }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await refreshSites?.();
    } catch (err) {
      console.error(err);
      setDisconnectError(COPY.disconnectFailed);
    } finally {
      setIsDisconnecting(false);
    }
  };

  const formatDate = (d) => {
    if (!d) return '-';
    return new Date(d).toLocaleString(locale === 'he' ? 'he-IL' : 'en-US');
  };

  return (
    <div className={`${styles.container} ${compact ? styles.compact : ''}`}>
      <div className={styles.statusHeader}>
        <div className={styles.statusInfo}>
          <div className={`${styles.statusBadge} ${styles[statusInfo.color]}`}>
            <StatusIcon
              size={14}
              className={status === CONNECTION_STATUS.CONNECTING ? styles.spin : ''}
            />
            <span>{statusInfo.label}</span>
          </div>
          <h3 className={styles.title}>
            <Store size={18} />
            {COPY.title}
          </h3>
          <p className={styles.description}>{statusInfo.description}</p>
        </div>
      </div>

      {!isConnected && (
        <div className={styles.connectForm}>
          <label className={styles.label} htmlFor="shopify-shop-input">
            {COPY.shopDomainLabel}
          </label>
          <input
            id="shopify-shop-input"
            type="text"
            className={styles.input}
            placeholder={COPY.shopDomainPlaceholder}
            value={shopInput}
            onChange={(e) => {
              setShopInput(e.target.value);
              setShopError(null);
            }}
            disabled={isRedirecting}
            autoComplete="off"
          />
          <p className={styles.hint}>{COPY.shopDomainHint}</p>
          {shopError && <p className={styles.errorText}>{shopError}</p>}
          <Button
            onClick={handleConnect}
            disabled={isRedirecting || !shopInput.trim()}
            className={styles.connectButton}
          >
            {isRedirecting ? (
              <>
                <Loader2 size={16} className={styles.spin} />
                {COPY.connecting}
              </>
            ) : (
              <>
                <ExternalLink size={16} />
                {COPY.connectButton}
              </>
            )}
          </Button>
        </div>
      )}

      {isConnected && (
        <>
          <button
            type="button"
            className={styles.detailsToggle}
            onClick={() => setShowDetails((s) => !s)}
          >
            {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {COPY.connectionDetails}
          </button>
          {showDetails && (
            <dl className={styles.details}>
              <div className={styles.detailRow}>
                <dt>{COPY.shopDomainField}</dt>
                <dd>{shopifyDomain || '-'}</dd>
              </div>
              <div className={styles.detailRow}>
                <dt>{COPY.scopes}</dt>
                <dd>
                  {shopifyScopes.length
                    ? `${shopifyScopes.length} granted`
                    : '-'}
                </dd>
              </div>
              <div className={styles.detailRow}>
                <dt>{COPY.installedAt}</dt>
                <dd>{formatDate(shopifyAppInstalledAt)}</dd>
              </div>
            </dl>
          )}
          <div className={styles.actions}>
            <Button
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              variant="secondary"
              className={styles.disconnectButton}
            >
              {isDisconnecting ? (
                <>
                  <Loader2 size={16} className={styles.spin} />
                  {COPY.disconnecting}
                </>
              ) : (
                <>
                  <Unplug size={16} />
                  {COPY.disconnect}
                </>
              )}
            </Button>
          </div>
          {disconnectError && (
            <p className={styles.errorText}>{disconnectError}</p>
          )}
        </>
      )}
    </div>
  );
}
