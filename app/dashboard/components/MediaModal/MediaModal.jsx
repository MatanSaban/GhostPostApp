'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  X, 
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
} from 'lucide-react';
import { useSite } from '@/app/context/site-context';
import { useLocale } from '@/app/context/locale-context';
import styles from './MediaModal.module.css';

/**
 * Media Modal Component
 * WordPress-style media library modal for selecting/uploading images
 */
export function MediaModal({ 
  isOpen, 
  onClose, 
  onSelect, 
  multiple = false,
  allowedTypes = ['image'],
  title,
}) {
  const { selectedSite } = useSite();
  const { t } = useLocale();
  const fileInputRef = useRef(null);
  
  const [activeTab, setActiveTab] = useState('library');
  const [media, setMedia] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [selectedItems, setSelectedItems] = useState([]);
  const [previewItem, setPreviewItem] = useState(null);
  
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
  
  // Fetch media when modal opens or filters change
  const fetchMedia = useCallback(async () => {
    if (!selectedSite?.id || !isOpen) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: '20',
      });
      
      if (searchDebounce) {
        params.set('search', searchDebounce);
      }
      
      // Filter by image types if only images allowed
      if (allowedTypes.length === 1 && allowedTypes[0] === 'image') {
        params.set('mime_type', 'image');
      }
      
      const response = await fetch(`/api/sites/${selectedSite.id}/media?${params}`);
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch media');
      }
      
      const data = await response.json();
      setMedia(data.items || []);
      setTotalPages(data.pages || 1);
      setTotalItems(data.total || 0);
    } catch (err) {
      setError(err.message);
      setMedia([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedSite?.id, isOpen, page, searchDebounce, allowedTypes]);
  
  useEffect(() => {
    if (isOpen) {
      fetchMedia();
    }
  }, [fetchMedia, isOpen]);
  
  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedItems([]);
      setPreviewItem(null);
      setSearch('');
      setPage(1);
      setActiveTab('library');
      setEditAlt('');
      setEditTitle('');
      setEditCaption('');
      setEditDescription('');
      setSaveSuccess(false);
      setUrlCopied(false);
    }
  }, [isOpen]);
  
  // Update edit fields when preview item changes
  useEffect(() => {
    if (previewItem) {
      setEditAlt(previewItem.alt || '');
      setEditTitle(previewItem.title || '');
      setEditCaption(previewItem.caption || '');
      setEditDescription(previewItem.description || '');
      setSaveSuccess(false);
      setUrlCopied(false);
    }
  }, [previewItem]);
  
  // Handle save metadata
  const handleSaveMetadata = async () => {
    if (!previewItem || !selectedSite?.id) return;
    
    setIsSaving(true);
    setSaveSuccess(false);
    
    try {
      const response = await fetch(`/api/sites/${selectedSite.id}/media`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaId: previewItem.id,
          alt: editAlt,
          title: editTitle,
          caption: editCaption,
          description: editDescription,
        }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save');
      }
      
      // Update local state
      setMedia(prev => prev.map(item => 
        item.id === previewItem.id 
          ? { ...item, alt: editAlt, title: editTitle, caption: editCaption, description: editDescription }
          : item
      ));
      setPreviewItem(prev => ({ ...prev, alt: editAlt, title: editTitle, caption: editCaption, description: editDescription }));
      
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };
  
  // Handle copy URL
  const handleCopyUrl = async () => {
    if (!previewItem?.url) return;
    
    try {
      await navigator.clipboard.writeText(previewItem.url);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    } catch (err) {
      setError('Failed to copy URL');
    }
  };
  
  // Handle file upload
  const handleFileUpload = async (e) => {
    const files = e.target.files;
    if (!files?.length || !selectedSite?.id) return;
    
    setIsUploading(true);
    setError(null);
    
    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        // Convert file to base64
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        
        const response = await fetch(`/api/sites/${selectedSite.id}/media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base64,
            filename: file.name,
            title: file.name.replace(/\.[^/.]+$/, ''),
          }),
        });
        
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Upload failed');
        }
        
        return response.json();
      });
      
      await Promise.all(uploadPromises);
      
      // Refresh media list
      fetchMedia();
      setActiveTab('library');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };
  
  // Handle item selection
  const handleItemClick = (item) => {
    if (multiple) {
      setSelectedItems(prev => {
        const exists = prev.find(i => i.id === item.id);
        if (exists) {
          return prev.filter(i => i.id !== item.id);
        }
        return [...prev, item];
      });
    } else {
      setSelectedItems([item]);
    }
    setPreviewItem(item);
  };
  
  // Handle confirm selection
  const handleConfirm = () => {
    if (selectedItems.length === 0) return;
    
    if (multiple) {
      onSelect(selectedItems);
    } else {
      onSelect(selectedItems[0]);
    }
    onClose();
  };
  
  // Get icon for file type
  const getFileIcon = (mimeType) => {
    if (mimeType?.startsWith('image/')) return ImageIcon;
    if (mimeType?.startsWith('video/')) return Film;
    if (mimeType?.startsWith('application/pdf')) return FileText;
    return File;
  };
  
  if (!isOpen) return null;
  
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>
            {title || t('media.modal.title')}
          </h2>
          <button className={styles.closeButton} onClick={onClose}>
            <X />
          </button>
        </div>
        
        {/* Tabs */}
        <div className={styles.tabs}>
          <button 
            className={`${styles.tab} ${activeTab === 'library' ? styles.activeTab : ''}`}
            onClick={() => setActiveTab('library')}
          >
            {t('media.modal.library')}
          </button>
          <button 
            className={`${styles.tab} ${activeTab === 'upload' ? styles.activeTab : ''}`}
            onClick={() => setActiveTab('upload')}
          >
            {t('media.modal.upload')}
          </button>
        </div>
        
        {/* Content */}
        <div className={styles.content}>
          {activeTab === 'library' && (
            <div className={styles.libraryContent}>
              {/* Sidebar with filters and preview */}
              <div className={styles.sidebar}>
                {/* Search */}
                <div className={styles.searchBox}>
                  <Search className={styles.searchIcon} />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('media.modal.search')}
                    className={styles.searchInput}
                  />
                </div>
                
                {/* Preview */}
                {previewItem && (
                  <div className={styles.preview}>
                    <div className={styles.previewImage}>
                      {previewItem.mime_type?.startsWith('image/') ? (
                        <img src={previewItem.url} alt={previewItem.alt || previewItem.title} />
                      ) : (
                        <div className={styles.previewIcon}>
                          {(() => {
                            const Icon = getFileIcon(previewItem.mime_type);
                            return <Icon />;
                          })()}
                        </div>
                      )}
                    </div>
                    
                    {/* Editable Fields */}
                    <div className={styles.editFields}>
                      <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>{t('media.modal.altText')}</label>
                        <input
                          type="text"
                          value={editAlt}
                          onChange={(e) => setEditAlt(e.target.value)}
                          placeholder={t('media.modal.altTextPlaceholder')}
                          className={styles.fieldInput}
                        />
                      </div>
                      
                      <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>{t('media.modal.titleField')}</label>
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          placeholder={t('media.modal.titlePlaceholder')}
                          className={styles.fieldInput}
                        />
                      </div>
                      
                      <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>{t('media.modal.caption')}</label>
                        <textarea
                          value={editCaption}
                          onChange={(e) => setEditCaption(e.target.value)}
                          placeholder={t('media.modal.captionPlaceholder')}
                          className={styles.fieldTextarea}
                          rows={2}
                        />
                      </div>
                      
                      <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>{t('media.modal.description')}</label>
                        <textarea
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          placeholder={t('media.modal.descriptionPlaceholder')}
                          className={styles.fieldTextarea}
                          rows={3}
                        />
                      </div>
                      
                      {/* Save Button */}
                      <button
                        type="button"
                        onClick={handleSaveMetadata}
                        disabled={isSaving}
                        className={`${styles.saveButton} ${saveSuccess ? styles.saveSuccess : ''}`}
                      >
                        {isSaving ? (
                          <>
                            <Loader2 className={styles.spinning} />
                            <span>{t('common.saving')}</span>
                          </>
                        ) : saveSuccess ? (
                          <>
                            <Check />
                            <span>{t('common.saved')}</span>
                          </>
                        ) : (
                          <>
                            <Save />
                            <span>{t('common.save')}</span>
                          </>
                        )}
                      </button>
                    </div>
                    
                    {/* File Info */}
                    <div className={styles.previewInfo}>
                      {previewItem.width && previewItem.height && (
                        <p className={styles.previewSize}>
                          {previewItem.width} × {previewItem.height}
                        </p>
                      )}
                      <p className={styles.previewMime}>{previewItem.mime_type}</p>
                      
                      {/* Action Buttons */}
                      <div className={styles.actionButtons}>
                        <button
                          type="button"
                          onClick={handleCopyUrl}
                          className={`${styles.actionButton} ${urlCopied ? styles.actionSuccess : ''}`}
                        >
                          <Copy />
                          <span>{urlCopied ? t('common.copied') : t('media.modal.copyUrl')}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Media Grid */}
              <div className={styles.mainArea}>
                {error && (
                  <div className={styles.error}>
                    {error}
                  </div>
                )}
                
                {isLoading ? (
                  <div className={styles.loading}>
                    <Loader2 className={styles.spinning} />
                    <span>{t('common.loading')}</span>
                  </div>
                ) : media.length === 0 ? (
                  <div className={styles.empty}>
                    <ImageIcon />
                    <span>{t('media.modal.noMedia')}</span>
                  </div>
                ) : (
                  <>
                    <div className={styles.grid}>
                      {media.map((item) => {
                        const isSelected = selectedItems.some(i => i.id === item.id);
                        const Icon = getFileIcon(item.mime_type);
                        
                        return (
                          <div
                            key={item.id}
                            className={`${styles.gridItem} ${isSelected ? styles.selected : ''}`}
                            onClick={() => handleItemClick(item)}
                          >
                            {item.mime_type?.startsWith('image/') ? (
                              <img 
                                src={item.sizes?.thumbnail?.url || item.url} 
                                alt={item.alt || item.title}
                              />
                            ) : (
                              <div className={styles.fileIcon}>
                                <Icon />
                              </div>
                            )}
                            {isSelected && (
                              <div className={styles.selectedBadge}>
                                <Check />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className={styles.pagination}>
                        <button
                          className={styles.pageButton}
                          onClick={() => setPage(p => Math.max(1, p - 1))}
                          disabled={page === 1}
                        >
                          <ChevronLeft />
                        </button>
                        <span className={styles.pageInfo}>
                          {t('media.modal.page')} {page} / {totalPages}
                        </span>
                        <button
                          className={styles.pageButton}
                          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                          disabled={page === totalPages}
                        >
                          <ChevronRight />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
          
          {activeTab === 'upload' && (
            <div className={styles.uploadContent}>
              <div 
                className={styles.dropzone}
                onClick={() => fileInputRef.current?.click()}
              >
                {isUploading ? (
                  <>
                    <Loader2 className={styles.spinning} />
                    <span>{t('media.modal.uploading')}</span>
                  </>
                ) : (
                  <>
                    <Upload />
                    <span>{t('media.modal.dropzone')}</span>
                    <span className={styles.dropzoneHint}>
                      {t('media.modal.dropzoneHint')}
                    </span>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={allowedTypes.includes('image') ? 'image/*' : '*'}
                multiple={multiple}
                onChange={handleFileUpload}
                className={styles.hiddenInput}
              />
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className={styles.footer}>
          <div className={styles.footerInfo}>
            {selectedItems.length > 0 && (
              <span>{t('media.modal.selected', { count: selectedItems.length })}</span>
            )}
          </div>
          <div className={styles.footerActions}>
            <button className={styles.cancelButton} onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button 
              className={styles.confirmButton}
              onClick={handleConfirm}
              disabled={selectedItems.length === 0}
            >
              {t('media.modal.select')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MediaModal;
