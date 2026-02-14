'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Download,
  Loader2,
  Plug,
  Wand2,
  ExternalLink,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useSite } from '@/app/context/site-context';
import styles from './PluginRequiredModal.module.css';

/**
 * PluginRequiredModal — Shown when AI Fix requires a connected WP plugin
 *
 * Props:
 * - open: boolean
 * - onClose: () => void
 */
export default function PluginRequiredModal({ open, onClose }) {
  const { t } = useLocale();
  const { selectedSite, refreshSites } = useSite();
  const [isDownloading, setIsDownloading] = useState(false);

  if (!open) return null;

  const handleDownload = async () => {
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

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}>
          <X size={18} />
        </button>

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.iconWrap}>
            <Plug size={28} />
          </div>
          <h3 className={styles.title}>{t('siteAudit.aiFix.pluginRequired')}</h3>
          <p className={styles.description}>{t('siteAudit.aiFix.pluginDescription')}</p>
        </div>

        {/* Steps */}
        <ol className={styles.steps}>
          <li>
            <span className={styles.stepNum}>1</span>
            <span>{t('siteAudit.aiFix.step1')}</span>
          </li>
          <li>
            <span className={styles.stepNum}>2</span>
            <span>{t('siteAudit.aiFix.step2')}</span>
          </li>
          <li>
            <span className={styles.stepNum}>3</span>
            <span>{t('siteAudit.aiFix.step3')}</span>
          </li>
          <li>
            <span className={styles.stepNum}>4</span>
            <span>{t('siteAudit.aiFix.step4')}</span>
          </li>
        </ol>

        {/* Download Button */}
        <button
          className={styles.downloadBtn}
          onClick={handleDownload}
          disabled={isDownloading}
        >
          {isDownloading ? <Loader2 size={16} className={styles.spinning} /> : <Download size={16} />}
          {t('siteAudit.aiFix.downloadPlugin')}
        </button>

        {/* Settings Link */}
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
