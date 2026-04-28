'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { GoogleDriveBrowser } from './GoogleDriveBrowser';
import styles from './GoogleDriveImportButton.module.css';

/**
 * "Import from Google Drive" button.
 *
 * Opens the platform-themed {@link GoogleDriveBrowser} modal - a custom
 * replacement for the Google Picker that honors the dashboard's theme,
 * opens in the site's language, and fetches the user's Drive files
 * through our backend (so the OAuth access token never touches the
 * browser). The backend uses the refresh token stored in the site's
 * GoogleIntegration record to page through the user's Drive and, on
 * import, download + re-upload each file into the connected CMS.
 */
export function GoogleDriveImportButton({ siteId, onImported, disabled }) {
  const { t } = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState(null);

  // Auto-clear the error title after a few seconds so stale states don't
  // linger as a permanent tooltip.
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(id);
  }, [error]);

  const handleImport = useCallback(async (fileIds) => {
    if (!siteId || !fileIds?.length) return;
    setIsImporting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sites/${siteId}/media/import-drive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Drive import failed');
      if (typeof onImported === 'function') {
        await onImported(data);
      }
    } catch (err) {
      console.error('[GoogleDriveImportButton] import failed:', err);
      setError(err?.message || 'Drive import failed');
      throw err; // let the browser modal surface the error too
    } finally {
      setIsImporting(false);
    }
  }, [siteId, onImported]);

  return (
    <>
      <button
        type="button"
        className={styles.button}
        onClick={() => setIsOpen(true)}
        disabled={disabled || isImporting}
        title={error || t('media.driveImport.button')}
      >
        {isImporting ? <Loader2 className={styles.spin} /> : <DriveIcon className={styles.icon} />}
        <span>{t('media.driveImport.button')}</span>
      </button>
      <GoogleDriveBrowser
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onImport={handleImport}
        siteId={siteId}
      />
    </>
  );
}

function DriveIcon({ className }) {
  // Multi-color Google Drive glyph - matches the icon used in the Settings
  // integrations section so the button reads as "Google Drive" at a glance.
  return (
    <svg className={className} viewBox="0 0 87.3 78" fill="none" aria-hidden="true">
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L27.5 53H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
      <path d="M43.65 25 29.9 1.2C28.55 2 27.4 3.1 26.6 4.5L1.2 48.5c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47" />
      <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 11.5z" fill="#ea4335" />
      <path d="M43.65 25 57.4 1.2c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
      <path d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.8 53h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
    </svg>
  );
}
