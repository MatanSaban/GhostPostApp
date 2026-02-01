'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
} from 'lucide-react';
import { useSite } from '@/app/context/site-context';
import { useLocale } from '@/app/context/locale-context';
import styles from './media.module.css';

/**
 * Media Library Page
 * Full-page media library for viewing and managing site media
 */
export default function MediaPage() {
  const { selectedSite } = useSite();
  const { t, isRtl } = useLocale();
  const fileInputRef = useRef(null);
  
  const [media, setMedia] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [selectedItem, setSelectedItem] = useState(null);
  
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
  
  // Update editable fields when selected item changes
  useEffect(() => {
    if (selectedItem) {
      setEditAlt(selectedItem.alt_text || '');
      setEditTitle(selectedItem.title?.rendered || '');
      setEditCaption(selectedItem.caption?.rendered?.replace(/<[^>]*>/g, '') || '');
      setEditDescription(selectedItem.description?.rendered?.replace(/<[^>]*>/g, '') || '');
    }
  }, [selectedItem]);
  
  // Fetch media
  const fetchMedia = useCallback(async () => {
    if (!selectedSite?.id) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: '24',
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
      setMedia(data.items || []);
      setTotalPages(data.totalPages || 1);
      setTotalItems(data.total || 0);
    } catch (err) {
      console.error('Error fetching media:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [selectedSite?.id, page, searchDebounce]);
  
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
  
  // Handle file upload
  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || !selectedSite?.id) return;
    
    setIsUploading(true);
    setError(null);
    
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch(`/api/sites/${selectedSite.id}/media`, {
          method: 'POST',
          body: formData,
        });
        
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to upload file');
        }
      }
      
      // Refresh the media list
      await fetchMedia();
    } catch (err) {
      console.error('Error uploading file:', err);
      setError(err.message);
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
      
      // Update in list
      setMedia(prev => prev.map(item => 
        item.id === selectedItem.id 
          ? { ...item, alt_text: editAlt, title: { rendered: editTitle } }
          : item
      ));
    } catch (err) {
      console.error('Error saving media:', err);
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };
  
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
      
      setSelectedItem(null);
      await fetchMedia();
    } catch (err) {
      console.error('Error deleting media:', err);
      setError(err.message);
    }
  };
  
  if (!selectedSite) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <ImageIcon className={styles.emptyIcon} />
          <p>{t('media.selectSite')}</p>
        </div>
      </div>
    );
  }
  
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
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,application/pdf"
            multiple
            onChange={handleFileSelect}
            className={styles.hiddenInput}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className={styles.uploadButton}
          >
            {isUploading ? (
              <Loader2 className={styles.spinIcon} />
            ) : (
              <Upload className={styles.buttonIcon} />
            )}
            {t('media.upload')}
          </button>
        </div>
      </div>
      
      {error && (
        <div className={styles.error}>
          {error}
        </div>
      )}
      
      <div className={styles.content}>
        <div className={styles.mediaGrid}>
          {isLoading ? (
            <div className={styles.loadingState}>
              <Loader2 className={styles.spinIcon} />
              <p>{t('common.loading')}</p>
            </div>
          ) : media.length === 0 ? (
            <div className={styles.emptyState}>
              <ImageIcon className={styles.emptyIcon} />
              <p>{t('media.noMedia')}</p>
            </div>
          ) : (
            <>
              {media.map((item) => {
                const FileIcon = getFileIcon(item.mime_type);
                const isImage = item.mime_type?.startsWith('image/');
                const isSelected = selectedItem?.id === item.id;
                
                return (
                  <button
                    key={item.id}
                    className={`${styles.mediaItem} ${isSelected ? styles.selected : ''}`}
                    onClick={() => setSelectedItem(item)}
                  >
                    {isImage ? (
                      <img 
                        src={getThumbnail(item)} 
                        alt={item.alt_text || ''} 
                        className={styles.thumbnail}
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
                <p className={styles.detailsFilename}>
                  {selectedItem.title?.rendered || selectedItem.slug}
                </p>
                <p className={styles.detailsMeta}>
                  {selectedItem.mime_type} • {selectedItem.media_details?.width}x{selectedItem.media_details?.height}
                </p>
              </div>
              
              <div className={styles.detailsForm}>
                <label className={styles.formLabel}>
                  {t('media.altText')}
                  <input
                    type="text"
                    value={editAlt}
                    onChange={(e) => setEditAlt(e.target.value)}
                    className={styles.formInput}
                  />
                </label>
                
                <label className={styles.formLabel}>
                  {t('media.mediaTitle')}
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className={styles.formInput}
                  />
                </label>
                
                <label className={styles.formLabel}>
                  {t('media.caption')}
                  <textarea
                    value={editCaption}
                    onChange={(e) => setEditCaption(e.target.value)}
                    className={styles.formTextarea}
                    rows={2}
                  />
                </label>
                
                <label className={styles.formLabel}>
                  {t('media.description')}
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className={styles.formTextarea}
                    rows={3}
                  />
                </label>
                
                <div className={styles.urlField}>
                  <label className={styles.formLabel}>{t('media.url')}</label>
                  <div className={styles.urlWrapper}>
                    <input
                      type="text"
                      value={selectedItem.source_url}
                      readOnly
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
              
              <div className={styles.detailsActions}>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className={styles.saveButton}
                >
                  {isSaving ? (
                    <Loader2 className={styles.spinIcon} />
                  ) : saveSuccess ? (
                    <Check />
                  ) : (
                    <Save />
                  )}
                  {t('common.save')}
                </button>
                <button
                  onClick={handleDelete}
                  className={styles.deleteButton}
                >
                  <Trash2 />
                  {t('common.delete')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Pagination */}
      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1 || isLoading}
            className={styles.paginationButton}
          >
            {isRtl ? <ChevronRight /> : <ChevronLeft />}
          </button>
          <span className={styles.paginationInfo}>
            {t('common.page')} {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || isLoading}
            className={styles.paginationButton}
          >
            {isRtl ? <ChevronLeft /> : <ChevronRight />}
          </button>
        </div>
      )}
    </div>
  );
}
