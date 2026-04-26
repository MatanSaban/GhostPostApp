'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Download,
  Loader2,
  Plug,
  ExternalLink,
  ShoppingBag,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useSite } from '@/app/context/site-context';
import { useCapabilities } from '@/app/hooks/useCapabilities';
import styles from './PluginRequiredModal.module.css';

/**
 * ConnectionRequiredModal — shown when an action needs the site to be
 * connected (WP plugin for WordPress, OAuth app for Shopify). The modal
 * swaps copy + primary CTA based on capabilities instead of assuming
 * WordPress.
 *
 * Kept the original `PluginRequiredModal` export name for backwards
 * compatibility with existing call sites.
 */
export default function PluginRequiredModal({ open, onClose }) {
  const { t } = useLocale();
  const { selectedSite, refreshSites } = useSite();
  const caps = useCapabilities();
  const [isDownloading, setIsDownloading] = useState(false);

  if (!open) return null;

  const isShopify = caps.platform === 'shopify';

  const handleWordPressDownload = async () => {
    if (!selectedSite?.id) return;
    setIsDownloading(true);

    try {
      const response = await fetch(`/api/sites/${selectedSite.id}/download-plugin`);
      if (!response.ok) throw new Error('Download failed');

      const contentDisposition = response.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition?.match(/filename="?([^"]+)"?/);
      const filename = filenameMatch?.[1] || 'ghost-post-connector.zip';

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      refreshSites();
    } catch (err) {
      console.error('[PluginDownload]', err);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleShopifyConnect = () => {
    if (!selectedSite?.id) return;
    // Start the Shopify install flow. If we don't already know the shop
    // domain, defer to the Settings page where the merchant can type it.
    const shop = selectedSite.shopifyDomain || selectedSite.url?.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (shop && /\.myshopify\.com$/i.test(shop)) {
      window.location.href = `/api/shopify/install?shop=${encodeURIComponent(shop)}&siteId=${encodeURIComponent(selectedSite.id)}`;
      return;
    }
    window.location.href = '/dashboard/settings';
  };

  const title = isShopify
    ? t('siteAudit.aiFix.shopifyRequired') || 'Shopify app not connected'
    : t('siteAudit.aiFix.pluginRequired');
  const description = isShopify
    ? t('siteAudit.aiFix.shopifyDescription') ||
      'Install the GhostSEO Shopify app on your store to let AI Fix apply changes on your behalf.'
    : t('siteAudit.aiFix.pluginDescription');

  const steps = isShopify
    ? [
        t('siteAudit.aiFix.shopifyStep1') || 'Click "Connect Shopify" and approve the OAuth install.',
        t('siteAudit.aiFix.shopifyStep2') || 'Shopify redirects you back here once the app is authorized.',
        t('siteAudit.aiFix.shopifyStep3') || 'GhostSEO can now read + edit products, pages, redirects, SEO.',
      ]
    : [
        t('siteAudit.aiFix.step1'),
        t('siteAudit.aiFix.step2'),
        t('siteAudit.aiFix.step3'),
        t('siteAudit.aiFix.step4'),
      ];

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}>
          <X size={18} />
        </button>

        <div className={styles.header}>
          <div className={styles.iconWrap}>
            {isShopify ? <ShoppingBag size={28} /> : <Plug size={28} />}
          </div>
          <h3 className={styles.title}>{title}</h3>
          <p className={styles.description}>{description}</p>
        </div>

        <ol className={styles.steps}>
          {steps.map((text, idx) => (
            <li key={idx}>
              <span className={styles.stepNum}>{idx + 1}</span>
              <span>{text}</span>
            </li>
          ))}
        </ol>

        {isShopify ? (
          <button
            className={styles.downloadBtn}
            onClick={handleShopifyConnect}
          >
            <ShoppingBag size={16} />
            {t('siteAudit.aiFix.connectShopify') || 'Connect Shopify'}
          </button>
        ) : (
          <button
            className={styles.downloadBtn}
            onClick={handleWordPressDownload}
            disabled={isDownloading}
          >
            {isDownloading ? <Loader2 size={16} className={styles.spinning} /> : <Download size={16} />}
            {t('siteAudit.aiFix.downloadPlugin')}
          </button>
        )}

        <a
          href="/dashboard/settings"
          className={styles.settingsLink}
          onClick={onClose}
        >
          <ExternalLink size={13} />
          {t('siteAudit.aiFix.goToSettings')}
        </a>
      </div>
    </div>,
    document.body
  );
}
