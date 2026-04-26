'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Upload,
  Image as ImageIcon,
  Loader2,
  Check,
  ChevronLeft,
  ChevronRight,
  File,
  Film,
  FileText,
  Copy,
  Trash2,
  Save,
  X,
  AlertCircle,
  RefreshCw,
  Sparkles,
  Maximize2,
} from 'lucide-react';
import { useSite } from '@/app/context/site-context';
import { useLocale } from '@/app/context/locale-context';
import { usePermissions, MODULES } from '@/app/hooks/usePermissions';
import { Skeleton, Button } from '@/app/dashboard/components';
import { AIRegenerateModal } from './AIRegenerateModal';
import { MediaLightbox } from './MediaLightbox';
import { MediaFieldAIButton } from './MediaFieldAIButton';
import { GoogleDriveImportButton } from './GoogleDriveImportButton';
import styles from './media.module.css';

/**
 * Media Library Page
 * Full-page media library for viewing and managing site media
 * Only available for WordPress sites with connected plugin
 */
export default function MediaPage() {
  const router = useRouter();
  const { selectedSite, isLoading: isSiteLoading } = useSite();
  const { t } = useLocale();
  const { canCreate, canEdit, canDelete } = usePermissions();
  const canUploadMedia = canCreate(MODULES.ENTITIES);
  const canEditMedia = canEdit(MODULES.ENTITIES);
  const canDeleteMedia = canDelete(MODULES.ENTITIES);
  const fileInputRef = useRef(null);
  const pageCacheRef = useRef(new Map());

  const PER_PAGE_OPTIONS = [10, 15, 20, 25, 30, 50, 100, 200];
  const DEFAULT_PER_PAGE = 20;

  const [media, setMedia] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [selectedItem, setSelectedItem] = useState(null);
  const [brokenImageIds, setBrokenImageIds] = useState(() => new Set());
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);

  // Editable fields state
  const [editAlt, setEditAlt] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editCaption, setEditCaption] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  
  // Debounced search
  const [searchDebounce, setSearchDebounce] = useState('');
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounce(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Clear cache when the site, search term, or page size changes — those invalidate every cached page.
  useEffect(() => {
    pageCacheRef.current.clear();
  }, [selectedSite?.id, searchDebounce, perPage]);
  
  // Update editable fields when selected item changes
  useEffect(() => {
    if (selectedItem) {
      setEditAlt(selectedItem.alt_text || '');
      setEditTitle(selectedItem.title?.rendered || '');
      setEditCaption(selectedItem.caption?.rendered?.replace(/<[^>]*>/g, '') || '');
      setEditDescription(selectedItem.description?.rendered?.replace(/<[^>]*>/g, '') || '');
    }
  }, [selectedItem]);
  
  // Fetch media — uses an in-memory page cache so revisiting a page is instant.
  const fetchMedia = useCallback(async ({ force = false } = {}) => {
    if (!selectedSite?.id) return;

    const cacheKey = `${page}`;
    if (!force) {
      const cached = pageCacheRef.current.get(cacheKey);
      if (cached) {
        setMedia(cached.items);
        setTotalPages(cached.totalPages);
        setTotalItems(cached.total);
        setError(null);
        setIsLoading(false);
        return;
      }
    }

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: perPage.toString(),
      });

      if (searchDebounce) {
        params.set('search', searchDebounce);
      }

      const response = await fetch(`/api/sites/${selectedSite.id}/media?${params}`);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch media');
      }

      const data = await response.json();
      const items = data.items || [];
      const totalPages = data.totalPages || 1;
      const total = data.total || 0;
      pageCacheRef.current.set(cacheKey, { items, totalPages, total });
      setMedia(items);
      setTotalPages(totalPages);
      setTotalItems(total);
    } catch (err) {
      console.error('Error fetching media:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [selectedSite?.id, page, perPage, searchDebounce]);

  const handleRefresh = useCallback(() => {
    pageCacheRef.current.clear();
    fetchMedia({ force: true });
  }, [fetchMedia]);

  // Progressive search: while the user types, filter already-loaded items by
  // title first, then other metadata fields — so they see matches instantly.
  // Once the debounce fires, the server search replaces `media` with the
  // definitive result set (which spans the full library, not just the current
  // page), and the filter re-applies on top of that.
  const displayedMedia = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return media;

    const rankItem = (item) => {
      const title = (item.title?.rendered || '').toLowerCase();
      if (title.includes(q)) return 0;
      const alt = (item.alt_text || '').toLowerCase();
      if (alt.includes(q)) return 1;
      const caption = (item.caption?.rendered || '').toLowerCase();
      if (caption.includes(q)) return 2;
      const description = (item.description?.rendered || '').toLowerCase();
      if (description.includes(q)) return 3;
      const slug = (item.slug || '').toLowerCase();
      if (slug.includes(q)) return 4;
      return -1;
    };

    const matched = media
      .map((item) => ({ item, rank: rankItem(item) }))
      .filter((r) => r.rank !== -1)
      .sort((a, b) => a.rank - b.rank)
      .map((r) => r.item);

    return matched;
  }, [media, search]);

  const isSearchPending = search.trim() !== '' && search.trim() !== searchDebounce.trim();

  const handlePerPageChange = (e) => {
    const next = parseInt(e.target.value, 10);
    if (!PER_PAGE_OPTIONS.includes(next) || next === perPage) return;
    setPage(1);
    setPerPage(next);
  };

  const markImageBroken = useCallback((itemId) => {
    setBrokenImageIds(prev => {
      if (prev.has(itemId)) return prev;
      const next = new Set(prev);
      next.add(itemId);
      return next;
    });
  }, []);

  /**
   * Apply an in-memory change to the media list + all cached pages without
   * triggering a refetch. Used for uploads / deletes / AI replacements so
   * the grid updates instantly instead of flashing back to the skeleton.
   *
   *   patch.add    — items to prepend (new uploads/imports)
   *   patch.remove — Set<id> of items to drop (deletes/AI replacement)
   *   patch.delta  — change to `totalItems` (defaults to add.length - remove.size)
   */
  const applyLocalMediaPatch = useCallback((patch) => {
    const addItems = Array.isArray(patch?.add) ? patch.add.filter(Boolean) : [];
    const removeIds = patch?.remove instanceof Set ? patch.remove : new Set(patch?.remove || []);
    const delta = typeof patch?.delta === 'number'
      ? patch.delta
      : addItems.length - removeIds.size;

    setMedia((prev) => {
      let next = prev;
      if (removeIds.size) next = next.filter((m) => !removeIds.has(m.id));
      if (addItems.length) next = [...addItems, ...next];
      return next;
    });

    pageCacheRef.current.forEach((entry, key) => {
      let items = entry.items;
      if (removeIds.size) items = items.filter((m) => !removeIds.has(m.id));
      // Only prepend new items to the CURRENT page cache — adding them to
      // every page would make them appear multiple times.
      if (addItems.length && String(key) === String(page)) {
        items = [...addItems, ...items];
      }
      pageCacheRef.current.set(key, { ...entry, items });
    });

    if (delta !== 0) {
      setTotalItems((prev) => Math.max(0, prev + delta));
    }
  }, [page]);

  // Called when the user "keeps" an AI-regenerated image. We get `oldId` — the
  // media item the user was regenerating — and delete it so the new upload
  // replaces it in the library, rather than leaving both side by side.
  const handleAIUploaded = useCallback(async (newItem, oldId) => {
    const removeIds = new Set();
    if (oldId && oldId !== newItem?.id && selectedSite?.id) {
      try {
        await fetch(`/api/sites/${selectedSite.id}/media/${oldId}`, { method: 'DELETE' });
        removeIds.add(oldId);
      } catch (err) {
        console.warn('[Media] Failed to delete replaced media', oldId, err);
      }
    }
    // Optimistic local update: drop the replaced item and prepend the new one
    // without forcing the whole grid to reload.
    applyLocalMediaPatch({
      add: newItem ? [newItem] : [],
      remove: removeIds,
    });
    if (newItem?.id) setSelectedItem(newItem);
  }, [selectedSite?.id, applyLocalMediaPatch]);
  
  useEffect(() => {
    fetchMedia();
  }, [fetchMedia]);
  
  // Get file type icon
  const getFileIcon = (mimeType) => {
    if (mimeType?.startsWith('image/')) return ImageIcon;
    if (mimeType?.startsWith('video/')) return Film;
    if (mimeType?.startsWith('application/pdf')) return FileText;
    return File;
  };
  
  // Get thumbnail URL
  const getThumbnail = (item) => {
    if (item.media_details?.sizes?.thumbnail?.source_url) {
      return item.media_details.sizes.thumbnail.source_url;
    }
    if (item.media_details?.sizes?.medium?.source_url) {
      return item.media_details.sizes.medium.source_url;
    }
    return item.source_url;
  };
  
  // Read a File as a base64 data URL (keeps the `data:<mime>;base64,` prefix so
  // the server can sniff mime from it if the client didn't pass one explicitly).
  const fileToBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
      reader.readAsDataURL(file);
    });

  // Handle file upload — client converts File → base64 JSON which both the
  // WordPress plugin and the Shopify Files API path accept. Successfully
  // uploaded items are prepended to the grid optimistically; no full refetch.
  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || !selectedSite?.id) return;

    setIsUploading(true);
    setError(null);

    const uploaded = [];
    try {
      for (const file of files) {
        const base64 = await fileToBase64(file);

        const response = await fetch(`/api/sites/${selectedSite.id}/media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base64,
            filename: file.name,
            mimeType: file.type || undefined,
          }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || `Failed to upload ${file.name}`);
        }

        const item = await response.json().catch(() => null);
        if (item?.id) uploaded.push(item);
      }

      if (uploaded.length) {
        // Reverse so the first file the user picked ends up first in the grid.
        applyLocalMediaPatch({ add: uploaded.reverse() });
      }
    } catch (err) {
      console.error('Error uploading file:', err);
      setError(err.message);
      // If anything succeeded before the failure we still want it visible.
      if (uploaded.length) applyLocalMediaPatch({ add: uploaded.reverse() });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };
  
  // Copy URL to clipboard
  const copyUrl = async () => {
    if (!selectedItem?.source_url) return;
    
    try {
      await navigator.clipboard.writeText(selectedItem.source_url);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  };
  
  // Save media details
  const handleSave = async () => {
    if (!selectedItem || !selectedSite?.id) return;
    
    setIsSaving(true);
    setSaveSuccess(false);
    
    try {
      const response = await fetch(`/api/sites/${selectedSite.id}/media/${selectedItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alt_text: editAlt,
          title: editTitle,
          caption: editCaption,
          description: editDescription,
        }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update media');
      }
      
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      
      // Update in list and in cache so the change persists across navigation
      const updateItem = (item) =>
        item.id === selectedItem.id
          ? { ...item, alt_text: editAlt, title: { rendered: editTitle } }
          : item;
      setMedia(prev => prev.map(updateItem));
      pageCacheRef.current.forEach((entry, key) => {
        pageCacheRef.current.set(key, { ...entry, items: entry.items.map(updateItem) });
      });
    } catch (err) {
      console.error('Error saving media:', err);
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };
  
  // Save media fields from the lightbox. The details-panel `handleSave` above
  // uses its own edit state; the lightbox manages its own edit buffer and
  // passes the final values here so one item can be edited from either place.
  const handleLightboxSave = useCallback(async (itemId, fields) => {
    if (!itemId || !selectedSite?.id) return;
    const response = await fetch(`/api/sites/${selectedSite.id}/media/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alt_text: fields.alt,
        title: fields.title,
        caption: fields.caption,
        description: fields.description,
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to update media');
    }

    // Mirror what the details-panel save does: patch the in-memory list + cache
    // so navigating back to the grid shows the updated values.
    const updateItem = (m) =>
      m.id === itemId
        ? {
            ...m,
            alt_text: fields.alt ?? m.alt_text,
            title: { rendered: fields.title ?? m.title?.rendered ?? '' },
            caption: { rendered: fields.caption ?? m.caption?.rendered ?? '' },
            description: { rendered: fields.description ?? m.description?.rendered ?? '' },
          }
        : m;
    setMedia((prev) => prev.map(updateItem));
    pageCacheRef.current.forEach((entry, key) => {
      pageCacheRef.current.set(key, { ...entry, items: entry.items.map(updateItem) });
    });
    // Also reflect in the details panel if the same item is currently selected.
    setSelectedItem((prev) => (prev?.id === itemId ? updateItem(prev) : prev));
  }, [selectedSite?.id]);

  // Delete media
  const handleDelete = async () => {
    if (!selectedItem || !selectedSite?.id) return;
    
    if (!confirm(t('media.confirmDelete'))) return;
    
    try {
      const response = await fetch(`/api/sites/${selectedSite.id}/media/${selectedItem.id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete media');
      }

      const deletedId = selectedItem.id;
      setSelectedItem(null);
      // Optimistic local update — drop the deleted item from the grid and
      // caches without a full refetch.
      applyLocalMediaPatch({ remove: new Set([deletedId]) });
    } catch (err) {
      console.error('Error deleting media:', err);
      setError(err.message);
    }
  };
  
  const renderPaginationControls = (wrapperClass) => (
    <div className={wrapperClass}>
      {totalPages > 1 ? (
        <>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1 || isLoading}
            className={styles.paginationButton}
            aria-label={t('media.pagination.previous')}
          >
            <ChevronLeft />
          </button>
          <span className={styles.paginationInfo}>
            {t('media.pagination.pageOf', { current: page, total: totalPages })}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || isLoading}
            className={styles.paginationButton}
            aria-label={t('media.pagination.next')}
          >
            <ChevronRight />
          </button>
        </>
      ) : (
        <span className={styles.paginationInfo} />
      )}
      <label className={styles.perPageField}>
        <span className={styles.perPageLabel}>{t('media.perPage')}</span>
        <select
          value={perPage}
          onChange={handlePerPageChange}
          disabled={isLoading}
          className={styles.perPageSelect}
          aria-label={t('media.perPage')}
        >
          {PER_PAGE_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </label>
    </div>
  );

  // Check if media library is accessible (WordPress + connected plugin only)
  const isMediaAccessible = selectedSite?.platform === 'wordpress' && selectedSite?.connectionStatus === 'CONNECTED';
  
  // Redirect if site is not eligible for media library
  useEffect(() => {
    if (!isSiteLoading && selectedSite && !isMediaAccessible) {
      router.push('/dashboard/entities');
    }
  }, [isSiteLoading, selectedSite, isMediaAccessible, router]);
  
  // No site is selected and we're not mid-loading → prompt the user.
  if (!selectedSite && !isSiteLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <ImageIcon className={styles.emptyIcon} />
          <p>{t('media.selectSite')}</p>
        </div>
      </div>
    );
  }

  // Site resolved but not WordPress-connected → explain why this page is empty.
  // Guarded with `!isSiteLoading` so we don't flash this during site load.
  if (!isSiteLoading && selectedSite && !isMediaAccessible) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <AlertCircle className={styles.emptyIcon} />
          <p>{t('media.requiresWordPress')}</p>
        </div>
      </div>
    );
  }

  // Either site is still loading, or media is loading — the grid skeleton
  // covers both so the user sees a single consistent placeholder.
  const showGridSkeleton = isSiteLoading || isLoading;
  
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>{t('media.title')}</h1>
          <span className={styles.count}>{totalItems} {t('media.items')}</span>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.searchWrapper}>
            <Search className={styles.searchIcon} />
            <input
              type="text"
              placeholder={t('media.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={styles.searchInput}
            />
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isLoading}
            className={styles.refreshButton}
            title={t('common.refresh')}
            aria-label={t('common.refresh')}
          >
            <RefreshCw className={`${styles.buttonIcon} ${isLoading ? styles.spinIcon : ''}`} />
          </button>
          {canUploadMedia && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,application/pdf"
                multiple
                onChange={handleFileSelect}
                className={styles.hiddenInput}
              />
              <GoogleDriveImportButton
                siteId={selectedSite?.id}
                disabled={isUploading}
                onImported={(data) => {
                  // Prepend the imported items without a full refetch.
                  const newItems = Array.isArray(data?.results)
                    ? data.results.filter((r) => r?.ok && r?.item?.id).map((r) => r.item)
                    : [];
                  if (newItems.length) {
                    applyLocalMediaPatch({ add: newItems.reverse() });
                  }
                }}
              />
              <Button
                variant="primary"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                {isUploading ? (
                  <Loader2 className={styles.spinIcon} />
                ) : (
                  <Upload className={styles.buttonIcon} />
                )}
                {t('media.upload')}
              </Button>
            </>
          )}
        </div>
      </div>
      
      {error && (
        <div className={styles.error}>
          {error}
        </div>
      )}

      {renderPaginationControls(styles.paginationTop)}

      <div className={styles.content}>
        <div className={styles.mediaGrid}>
          {showGridSkeleton ? (
            Array.from({ length: perPage }).map((_, i) => (
              <Skeleton key={i} className={styles.skeletonItem} height="auto" />
            ))
          ) : displayedMedia.length === 0 ? (
            <div className={styles.emptyState}>
              <ImageIcon className={styles.emptyIcon} />
              <p>{t('media.noMedia')}</p>
            </div>
          ) : (
            <>
              {displayedMedia.map((item, idx) => {
                const FileIcon = getFileIcon(item.mime_type);
                const isImage = item.mime_type?.startsWith('image/');
                const isSelected = selectedItem?.id === item.id;

                return (
                  <div
                    key={item.id}
                    className={`${styles.mediaItem} ${isSelected ? styles.selected : ''}`}
                  >
                    <button
                      type="button"
                      className={styles.mediaItemSelect}
                      onClick={() => setSelectedItem(item)}
                      aria-label={item.title?.rendered || item.slug || ''}
                    >
                      {isImage ? (
                        <img
                          src={getThumbnail(item)}
                          alt={item.alt_text || ''}
                          className={styles.thumbnail}
                          onError={() => markImageBroken(item.id)}
                        />
                      ) : (
                        <div className={styles.filePreview}>
                          <FileIcon className={styles.fileIcon} />
                        </div>
                      )}
                      {isSelected && (
                        <div className={styles.selectedOverlay}>
                          <Check className={styles.checkIcon} />
                        </div>
                      )}
                    </button>
                    <button
                      type="button"
                      className={styles.mediaItemExpand}
                      onClick={(e) => {
                        e.stopPropagation();
                        setLightboxIndex(idx);
                      }}
                      aria-label={t('media.lightbox.expand')}
                      title={t('media.lightbox.expand')}
                    >
                      <Maximize2 />
                    </button>
                  </div>
                );
              })}
            </>
          )}
        </div>
        
        {/* Details Panel */}
        {selectedItem && (
          <div className={styles.detailsPanel}>
            <div className={styles.detailsHeader}>
              <h3 className={styles.detailsTitle}>{t('media.details')}</h3>
              <button 
                className={styles.closeDetails}
                onClick={() => setSelectedItem(null)}
              >
                <X />
              </button>
            </div>
            
            <div className={styles.detailsContent}>
              {selectedItem.mime_type?.startsWith('image/') ? (
                <img
                  src={selectedItem.source_url}
                  alt={selectedItem.alt_text || ''}
                  className={styles.detailsPreview}
                  onError={() => markImageBroken(selectedItem.id)}
                />
              ) : (
                <div className={styles.detailsFilePreview}>
                  {(() => {
                    const FileIcon = getFileIcon(selectedItem.mime_type);
                    return <FileIcon className={styles.detailsFileIcon} />;
                  })()}
                </div>
              )}
              
              <div className={styles.detailsInfo}>
                <p className={styles.detailsMeta}>
                  {selectedItem.mime_type} • {selectedItem.media_details?.width}x{selectedItem.media_details?.height}
                </p>
              </div>
              
              <div className={styles.detailsForm}>
                {(() => {
                  const fieldContext = {
                    altText: editAlt,
                    title: editTitle,
                    caption: editCaption,
                    description: editDescription,
                    filename: selectedItem.title?.rendered || selectedItem.slug || '',
                    sourceUrl: selectedItem.source_url || '',
                    mimeType: selectedItem.mime_type || '',
                    width: selectedItem.media_details?.width ?? null,
                    height: selectedItem.media_details?.height ?? null,
                  };
                  const showAI = canEditMedia && selectedSite?.id && selectedItem?.id;
                  return (
                    <>
                      <div className={styles.formLabel}>
                        <div className={styles.formLabelRow}>
                          <label htmlFor="details-alt" className={styles.formLabelText}>{t('media.altText')}</label>
                          {showAI && (
                            <MediaFieldAIButton
                              siteId={selectedSite.id}
                              mediaId={selectedItem.id}
                              field="altText"
                              context={fieldContext}
                              onResult={(v) => setEditAlt(v)}
                            />
                          )}
                        </div>
                        <input
                          id="details-alt"
                          type="text"
                          value={editAlt}
                          onChange={(e) => setEditAlt(e.target.value)}
                          className={styles.formInput}
                        />
                      </div>

                      <div className={styles.formLabel}>
                        <div className={styles.formLabelRow}>
                          <label htmlFor="details-title" className={styles.formLabelText}>{t('media.lightbox.filename')}</label>
                          {showAI && (
                            <MediaFieldAIButton
                              siteId={selectedSite.id}
                              mediaId={selectedItem.id}
                              field="title"
                              context={fieldContext}
                              onResult={(v) => setEditTitle(v)}
                            />
                          )}
                        </div>
                        <input
                          id="details-title"
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className={styles.formInput}
                        />
                      </div>

                      <div className={styles.formLabel}>
                        <div className={styles.formLabelRow}>
                          <label htmlFor="details-caption" className={styles.formLabelText}>{t('media.caption')}</label>
                          {showAI && (
                            <MediaFieldAIButton
                              siteId={selectedSite.id}
                              mediaId={selectedItem.id}
                              field="caption"
                              context={fieldContext}
                              onResult={(v) => setEditCaption(v)}
                            />
                          )}
                        </div>
                        <textarea
                          id="details-caption"
                          value={editCaption}
                          onChange={(e) => setEditCaption(e.target.value)}
                          className={styles.formTextarea}
                          rows={2}
                        />
                      </div>

                      <div className={styles.formLabel}>
                        <div className={styles.formLabelRow}>
                          <label htmlFor="details-description" className={styles.formLabelText}>{t('media.description')}</label>
                          {showAI && (
                            <MediaFieldAIButton
                              siteId={selectedSite.id}
                              mediaId={selectedItem.id}
                              field="description"
                              context={fieldContext}
                              onResult={(v) => setEditDescription(v)}
                            />
                          )}
                        </div>
                        <textarea
                          id="details-description"
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          className={styles.formTextarea}
                          rows={3}
                        />
                      </div>
                    </>
                  );
                })()}
                
                <div className={styles.urlField}>
                  <label className={styles.formLabel}>{t('media.url')}</label>
                  <div className={styles.urlWrapper}>
                    <input
                      type="text"
                      value={selectedItem.source_url}
                      readOnly
                      dir="ltr"
                      className={styles.formInput}
                    />
                    <button 
                      onClick={copyUrl}
                      className={styles.copyButton}
                      title={t('common.copy')}
                    >
                      {urlCopied ? <Check /> : <Copy />}
                    </button>
                  </div>
                </div>
              </div>
              
              {selectedItem.mime_type?.startsWith('image/') && canUploadMedia && (() => {
                const isBroken = brokenImageIds.has(selectedItem.id);
                const hasAnyMeta = !!(editAlt || editTitle || editCaption || editDescription);
                const canRegenerate = isBroken ? hasAnyMeta : true;
                if (!canRegenerate) return null;
                return (
                  <div className={styles.aiActionRow}>
                    <Button
                      variant="primary"
                      onClick={() => setAiModalOpen(true)}
                      className={styles.aiButton}
                    >
                      <Sparkles />
                      {isBroken ? t('media.ai.generateButton') : t('media.ai.regenerateButton')}
                      <span className={styles.aiCost}>{t('media.ai.costShort', { credits: 5 })}</span>
                    </Button>
                  </div>
                );
              })()}

              <div className={styles.detailsActions}>
                {canEditMedia && (
                  <Button
                    variant="primary"
                    onClick={handleSave}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <Loader2 className={styles.spinIcon} />
                    ) : saveSuccess ? (
                      <Check />
                    ) : (
                      <Save />
                    )}
                    {t('common.save')}
                  </Button>
                )}
                {canDeleteMedia && (
                  <Button
                    variant="danger"
                    onClick={handleDelete}
                  >
                    <Trash2 />
                    {t('common.delete')}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      
      {renderPaginationControls(styles.pagination)}

      <AIRegenerateModal
        isOpen={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        selectedItem={selectedItem}
        isBroken={selectedItem ? brokenImageIds.has(selectedItem.id) : false}
        siteId={selectedSite?.id}
        onUploaded={handleAIUploaded}
      />

      <MediaLightbox
        items={displayedMedia}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onIndexChange={setLightboxIndex}
        brokenImageIds={brokenImageIds}
        siteId={selectedSite?.id}
        canEdit={canEditMedia}
        onSave={handleLightboxSave}
        onRegenerate={canUploadMedia ? (item) => {
          // Close the lightbox, select the current carousel item, and pop the
          // AI modal on top. The AI modal's onUploaded handler will delete the
          // original media item when the user keeps the new one.
          setLightboxIndex(null);
          setSelectedItem(item);
          setAiModalOpen(true);
        } : undefined}
      />
    </div>
  );
}
