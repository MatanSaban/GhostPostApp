'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronRight, Search, Check, Plus, X, Loader2, AlertCircle, Globe } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useSite } from '@/app/context/site-context';
import styles from './site-selector.module.css';

export function SiteSelector({ onSiteChange }) {
  const { t } = useLocale();
  const { sites, selectedSite, setSelectedSite, setSites, isLoading } = useSite();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSiteUrl, setNewSiteUrl] = useState('');
  const [newSiteName, setNewSiteName] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);
  const urlInputRef = useRef(null);

  const filteredSites = sites.filter(site =>
    site.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    site.url.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (showAddModal && urlInputRef.current) {
      urlInputRef.current.focus();
    }
  }, [showAddModal]);

  const handleSelect = async (site) => {
    setSelectedSite(site);
    setIsOpen(false);
    setSearchQuery('');
    onSiteChange?.(site);

    // Save selected site to database
    try {
      await fetch('/api/sites/select', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: site.id }),
      });
    } catch (error) {
      console.error('Failed to save selected site:', error);
    }
  };

  const handleToggle = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      setSearchQuery('');
    }
  };

  const openAddModal = () => {
    setIsOpen(false);
    setShowAddModal(true);
    setNewSiteUrl('');
    setNewSiteName('');
    setValidationResult(null);
    setCreateError(null);
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setNewSiteUrl('');
    setNewSiteName('');
    setValidationResult(null);
    setCreateError(null);
  };

  const validateUrl = async () => {
    if (!newSiteUrl.trim()) return;

    setIsValidating(true);
    setValidationResult(null);
    setCreateError(null);

    try {
      // Normalize URL
      let url = newSiteUrl.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
        setNewSiteUrl(url);
      }

      const response = await fetch('/api/sites/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();
      setValidationResult(data);

      // Auto-fill name if detected
      if (data.valid && data.siteName && !newSiteName) {
        setNewSiteName(data.siteName);
      }
    } catch (error) {
      setValidationResult({ valid: false, error: t('sites.add.validationFailed') });
    } finally {
      setIsValidating(false);
    }
  };

  const handleCreateSite = async () => {
    if (!validationResult?.valid || !newSiteName.trim()) return;

    setIsCreating(true);
    setCreateError(null);

    try {
      const response = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSiteName.trim(),
          url: newSiteUrl.trim(),
          platform: validationResult.platform || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create site');
      }

      const data = await response.json();
      
      // Add to sites list and select it
      setSites(prevSites => [...prevSites, data.site]);
      setSelectedSite(data.site);
      onSiteChange?.(data.site);
      
      closeAddModal();
    } catch (error) {
      setCreateError(error.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleUrlKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      validateUrl();
    }
  };

  // Show loading state or placeholder when no sites
  if (isLoading) {
    return (
      <div className={styles.siteSelector}>
        <span className={styles.label}>{t('sites.selectSite')}</span>
        <div className={styles.trigger}>
          <span className={styles.selectedName}>{t('common.loading')}</span>
        </div>
      </div>
    );
  }

  if (sites.length === 0) {
    return (
      <>
        <div className={styles.siteSelector}>
          <span className={styles.label}>{t('sites.selectSite')}</span>
          <button className={styles.addSiteButton} onClick={openAddModal}>
            <Plus size={16} />
            <span>{t('sites.addSite')}</span>
          </button>
        </div>
        {showAddModal && renderAddModal()}
      </>
    );
  }

  function renderAddModal() {
    return (
      <div className={styles.modalOverlay} onClick={closeAddModal}>
        <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
          <div className={styles.modalHeader}>
            <h3 className={styles.modalTitle}>{t('sites.add.title')}</h3>
            <button className={styles.modalClose} onClick={closeAddModal}>
              <X size={20} />
            </button>
          </div>

          <div className={styles.modalBody}>
            {/* Step 1: URL Input */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{t('sites.add.urlLabel')}</label>
              <div className={styles.urlInputWrapper}>
                <Globe className={styles.urlIcon} size={18} />
                <input
                  ref={urlInputRef}
                  type="text"
                  value={newSiteUrl}
                  onChange={(e) => {
                    setNewSiteUrl(e.target.value);
                    setValidationResult(null);
                  }}
                  onKeyDown={handleUrlKeyDown}
                  placeholder={t('sites.add.urlPlaceholder')}
                  className={styles.urlInput}
                  disabled={isValidating}
                />
                <button
                  className={styles.validateButton}
                  onClick={validateUrl}
                  disabled={!newSiteUrl.trim() || isValidating}
                >
                  {isValidating ? (
                    <Loader2 className={styles.spinningIcon} size={18} />
                  ) : (
                    t('sites.add.validate')
                  )}
                </button>
              </div>
              <p className={styles.formHint}>{t('sites.add.urlHint')}</p>
            </div>

            {/* Validation Result */}
            {validationResult && (
              <div className={`${styles.validationResult} ${validationResult.valid ? styles.valid : styles.invalid}`}>
                {validationResult.valid ? (
                  <>
                    <Check size={18} />
                    <span>{t('sites.add.validUrl')}</span>
                    {validationResult.platform && (
                      <span className={styles.platformBadge}>
                        {validationResult.platform === 'wordpress' ? 'WordPress' : validationResult.platform}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <AlertCircle size={18} />
                    <span>{validationResult.error || t('sites.add.invalidUrl')}</span>
                  </>
                )}
              </div>
            )}

            {/* Step 2: Name Input (only after valid URL) */}
            {validationResult?.valid && (
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>{t('sites.add.nameLabel')}</label>
                <input
                  type="text"
                  value={newSiteName}
                  onChange={(e) => setNewSiteName(e.target.value)}
                  placeholder={t('sites.add.namePlaceholder')}
                  className={styles.nameInput}
                />
              </div>
            )}

            {/* Error */}
            {createError && (
              <div className={styles.errorMessage}>
                <AlertCircle size={16} />
                <span>{createError}</span>
              </div>
            )}
          </div>

          <div className={styles.modalFooter}>
            <button className={styles.cancelButton} onClick={closeAddModal}>
              {t('common.cancel')}
            </button>
            <button
              className={styles.createButton}
              onClick={handleCreateSite}
              disabled={!validationResult?.valid || !newSiteName.trim() || isCreating}
            >
              {isCreating ? (
                <>
                  <Loader2 className={styles.spinningIcon} size={16} />
                  {t('sites.add.creating')}
                </>
              ) : (
                <>
                  <Plus size={16} />
                  {t('sites.add.create')}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={styles.siteSelector} ref={dropdownRef}>
        <span className={styles.label}>{t('sites.selectSite')}</span>
        
        <button 
          className={`${styles.trigger} ${isOpen ? styles.triggerOpen : ''}`}
          onClick={handleToggle}
        >
          <span className={styles.selectedName}>{selectedSite?.name || t('sites.selectSite')}</span>
          <ChevronRight className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`} size={18} />
        </button>

        {isOpen && (
          <div className={styles.dropdown}>
            {/* Search Input */}
            <div className={styles.searchWrapper}>
              <Search className={styles.searchIcon} size={16} />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('common.search') + '...'}
                className={styles.searchInput}
              />
            </div>

            {/* Sites List */}
            <div className={styles.sitesList}>
              {filteredSites.length > 0 ? (
                filteredSites.map((site) => (
                  <button
                    key={site.id}
                    className={`${styles.siteItem} ${site.id === selectedSite?.id ? styles.siteItemSelected : ''}`}
                    onClick={() => handleSelect(site)}
                  >
                    <div className={styles.siteInfo}>
                      <span className={styles.siteName}>{site.name}</span>
                      <span className={styles.siteUrl}>{site.url}</span>
                    </div>
                    {site.id === selectedSite?.id && (
                      <Check className={styles.checkIcon} size={16} />
                    )}
                  </button>
                ))
              ) : (
                <div className={styles.noResults}>
                  {t('common.noResults')}
                </div>
              )}
            </div>

            {/* Add Site Button */}
            <button className={styles.addSiteButton} onClick={openAddModal}>
              <Plus size={16} />
              <span>{t('sites.addSite')}</span>
            </button>
          </div>
        )}
      </div>
      
      {showAddModal && renderAddModal()}
    </>
  );
}
