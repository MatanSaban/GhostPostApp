'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  X,
  Search,
  Loader2,
  Check,
  AlertCircle,
  Image as ImageIcon,
  Film,
  FileText,
  File as FileIcon,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from './GoogleDriveBrowser.module.css';

const FILTERS = ['image', 'video', 'doc', 'any'];

function getFileIcon(mimeType) {
  if (mimeType?.startsWith('image/')) return ImageIcon;
  if (mimeType?.startsWith('video/')) return Film;
  if (mimeType?.startsWith('application/pdf')) return FileText;
  return FileIcon;
}

function formatSize(bytes) {
  const n = parseInt(bytes, 10);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Platform-themed Google Drive browser. Replaces the Google Picker iframe
 * with a modal that:
 *   - Matches the platform's modal pattern (portaled, scroll-locked, Esc-close)
 *   - Honors light/dark via CSS variables
 *   - Opens in the website's language (uses useLocale)
 *   - Pages through the user's Drive files via our backend proxy so we
 *     never expose the Google access token to this component
 *
 * When the user confirms a selection we return the list of file IDs to the
 * caller, which POSTs them to /api/sites/[id]/media/import-drive. That
 * endpoint uses the stored refresh token to download + upload server-side.
 */
export function GoogleDriveBrowser({ isOpen, onClose, onImport, siteId }) {
  const { t } = useLocale();
  const router = useRouter();

  const [files, setFiles] = useState([]);
  const [nextPageToken, setNextPageToken] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [notConnected, setNotConnected] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [filter, setFilter] = useState('image');
  const [isImporting, setIsImporting] = useState(false);

  const closeBtnRef = useRef(null);

  // Debounce search so we're not hammering Drive's API on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setSearchDebounced(search.trim()), 350);
    return () => clearTimeout(id);
  }, [search]);

  // Reset everything when the modal opens / the site changes / a new search
  // or filter is applied.
  const fetchFiles = useCallback(async ({ append = false } = {}) => {
    if (!siteId) return;
    if (append) setIsLoadingMore(true);
    else {
      setIsLoading(true);
      setError(null);
      setNotConnected(false);
    }
    try {
      const params = new URLSearchParams();
      if (searchDebounced) params.set('q', searchDebounced);
      if (filter) params.set('mimeFilter', filter);
      if (append && nextPageToken) params.set('pageToken', nextPageToken);

      const res = await fetch(`/api/sites/${siteId}/integrations/drive/files?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.code === 'DRIVE_NOT_CONNECTED') {
          setNotConnected(true);
        } else {
          setError(data?.error || t('media.driveImport.listFailed'));
        }
        if (!append) setFiles([]);
        setNextPageToken(null);
        return;
      }
      const incoming = Array.isArray(data.files) ? data.files : [];
      setFiles((prev) => (append ? [...prev, ...incoming] : incoming));
      setNextPageToken(data.nextPageToken || null);
    } catch (err) {
      console.error('[GoogleDriveBrowser] fetch failed:', err);
      setError(err?.message || t('media.driveImport.listFailed'));
    } finally {
      if (append) setIsLoadingMore(false);
      else setIsLoading(false);
    }
  }, [siteId, searchDebounced, filter, nextPageToken, t]);

  // Initial load + reset when search / filter changes.
  useEffect(() => {
    if (!isOpen) return;
    setFiles([]);
    setSelected(new Set());
    setNextPageToken(null);
    fetchFiles({ append: false });
    // fetchFiles closure already captures latest searchDebounced/filter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, siteId, searchDebounced, filter]);

  // Clear state when the modal is closed so next open starts fresh.
  useEffect(() => {
    if (isOpen) return;
    setFiles([]);
    setSelected(new Set());
    setNextPageToken(null);
    setSearch('');
    setSearchDebounced('');
    setFilter('image');
    setError(null);
    setNotConnected(false);
  }, [isOpen]);

  // Lock background scroll + focus close button while open.
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = setTimeout(() => closeBtnRef.current?.focus(), 0);
    return () => {
      document.body.style.overflow = prev;
      clearTimeout(focusTimer);
    };
  }, [isOpen]);

  // Esc closes (unless we're mid-import — don't drop the action).
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape' && !isImporting) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, isImporting, onClose]);

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleImport = async () => {
    if (!selected.size || isImporting) return;
    setIsImporting(true);
    try {
      await onImport(Array.from(selected));
      onClose();
    } catch (err) {
      console.error('[GoogleDriveBrowser] import failed:', err);
      setError(err?.message || t('media.driveImport.listFailed'));
    } finally {
      setIsImporting(false);
    }
  };

  const selectedCount = selected.size;

  const filterLabels = useMemo(() => ({
    image: t('media.driveImport.filterImages'),
    video: t('media.driveImport.filterVideos'),
    doc: t('media.driveImport.filterDocs'),
    any: t('media.driveImport.filterAny'),
  }), [t]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isImporting) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.title}>
            <svg className={styles.driveIcon} viewBox="0 0 87.3 78" aria-hidden="true">
              <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L27.5 53H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
              <path d="M43.65 25 29.9 1.2C28.55 2 27.4 3.1 26.6 4.5L1.2 48.5c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47" />
              <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 11.5z" fill="#ea4335" />
              <path d="M43.65 25 57.4 1.2c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
              <path d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
              <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.8 53h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
            </svg>
            <h2>{t('media.driveImport.modalTitle')}</h2>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            disabled={isImporting}
            aria-label={t('common.close')}
          >
            <X size={18} />
          </button>
        </div>

        <div className={styles.controls}>
          <div className={styles.searchWrap}>
            <Search className={styles.searchIcon} size={16} />
            <input
              type="text"
              className={styles.searchInput}
              placeholder={t('media.driveImport.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={notConnected}
            />
          </div>
          <div className={styles.filters}>
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                className={`${styles.filterChip} ${filter === f ? styles.filterChipActive : ''}`}
                onClick={() => setFilter(f)}
                disabled={notConnected}
              >
                {filterLabels[f]}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.body}>
          {notConnected ? (
            <div className={styles.emptyState}>
              <AlertCircle size={36} className={styles.emptyIcon} />
              <p>{t('media.driveImport.connectFirst')}</p>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => {
                  onClose();
                  router.push('/dashboard/settings?tab=integrations');
                }}
              >
                {t('media.driveImport.connectFirstButton')}
              </button>
            </div>
          ) : error ? (
            <div className={styles.emptyState}>
              <AlertCircle size={36} className={styles.emptyIcon} />
              <p>{error}</p>
            </div>
          ) : isLoading ? (
            <div className={styles.emptyState}>
              <Loader2 size={28} className={styles.spinner} />
              <p>{t('media.driveImport.loading')}</p>
            </div>
          ) : files.length === 0 ? (
            <div className={styles.emptyState}>
              <p>{t('media.driveImport.empty')}</p>
            </div>
          ) : (
            <>
              <div className={styles.grid}>
                {files.map((file) => {
                  const isSelected = selected.has(file.id);
                  const Icon = getFileIcon(file.mimeType);
                  const thumb = file.thumbnailLink || null;
                  return (
                    <button
                      key={file.id}
                      type="button"
                      className={`${styles.fileCard} ${isSelected ? styles.fileCardSelected : ''}`}
                      onClick={() => toggleSelect(file.id)}
                      aria-pressed={isSelected}
                    >
                      <div className={styles.thumb}>
                        {thumb ? (
                          // Drive thumbnail URLs require the user's cookie to load;
                          // they work because the browser is logged into Google.
                          // Fallback to the mime icon if the image fails.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumb}
                            alt=""
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <Icon size={36} className={styles.fileIcon} />
                        )}
                        {isSelected && (
                          <div className={styles.selectedBadge}>
                            <Check size={14} />
                          </div>
                        )}
                      </div>
                      <div className={styles.fileMeta}>
                        <div className={styles.fileName} title={file.name}>{file.name}</div>
                        <div className={styles.fileSub}>{formatSize(file.size)}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {nextPageToken && (
                <div className={styles.loadMoreWrap}>
                  <button
                    type="button"
                    className={styles.loadMoreBtn}
                    onClick={() => fetchFiles({ append: true })}
                    disabled={isLoadingMore}
                  >
                    {isLoadingMore
                      ? <Loader2 size={14} className={styles.spinner} />
                      : t('media.driveImport.loadMore')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div className={styles.footer}>
          <div className={styles.selectedCount}>
            {t('media.driveImport.selected', { count: selectedCount })}
          </div>
          <div className={styles.footerActions}>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={onClose}
              disabled={isImporting}
            >
              {t('media.driveImport.cancel')}
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={handleImport}
              disabled={!selectedCount || isImporting || notConnected}
            >
              {isImporting
                ? <Loader2 size={14} className={styles.spinner} />
                : t('media.driveImport.importSelected', { count: selectedCount })}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
