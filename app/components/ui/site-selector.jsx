'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Search, Check, Plus, X, Loader2, AlertCircle, Globe, Plug, PlugZap, Pencil, ExternalLink } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useSite } from '@/app/context/site-context';
import { AddSiteModal } from './AddSiteModal';
import styles from './site-selector.module.css';

// Platform display labels
const PLATFORM_LABELS = {
  wordpress: 'WordPress',
  shopify: 'Shopify',
  wix: 'Wix',
  squarespace: 'Squarespace',
  webflow: 'Webflow',
  drupal: 'Drupal',
  joomla: 'Joomla',
  custom: 'Custom Code',
};

function getPlatformLabel(platform) {
  return PLATFORM_LABELS[platform] || platform;
}

export function SiteSelector({ onSiteChange }) {
  const { t } = useLocale();
  const { sites, selectedSite, setSelectedSite, setSites, isLoading } = useSite();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingSite, setEditingSite] = useState(null);
  const [editName, setEditName] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState(null);
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);
  const editInputRef = useRef(null);

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
  };

  const closeAddModal = () => {
    setShowAddModal(false);
  };

  const handleSiteAdded = (site) => {
    setSelectedSite(site);
    onSiteChange?.(site);
  };

  // Edit site functions
  const openEditModal = (site, e) => {
    e.stopPropagation();
    setIsOpen(false);
    setEditingSite(site);
    setEditName(site.name);
    setUpdateError(null);
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditingSite(null);
    setEditName('');
    setUpdateError(null);
  };

  const handleUpdateSite = async () => {
    if (!editingSite || !editName.trim()) return;

    setIsUpdating(true);
    setUpdateError(null);

    try {
      const response = await fetch('/api/sites', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: editingSite.id,
          name: editName.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update site');
      }

      const data = await response.json();
      
      // Update sites list
      setSites(prevSites => 
        prevSites.map(s => s.id === data.site.id ? data.site : s)
      );
      
      // Update selected site if it's the one we edited
      if (selectedSite?.id === data.site.id) {
        setSelectedSite(data.site);
      }
      
      closeEditModal();
    } catch (error) {
      setUpdateError(error.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleEditKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleUpdateSite();
    }
  };

  useEffect(() => {
    if (showEditModal && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [showEditModal]);

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
        <AddSiteModal
          isOpen={showAddModal}
          onClose={closeAddModal}
          onSiteAdded={handleSiteAdded}
          autoSelect
          showInterviewOnCreate
        />
      </>
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
          <span className={styles.selectedNameWrapper}>
            <span className={styles.selectedName}>{selectedSite?.name || t('sites.selectSite')}</span>
            {selectedSite?.platform === 'wordpress' && (
              <span 
                className={`${styles.connectionDot} ${
                  selectedSite.connectionStatus === 'CONNECTED' ? styles.connected : 
                  selectedSite.connectionStatus === 'DISCONNECTED' ? styles.disconnected : 
                  selectedSite.connectionStatus === 'ERROR' ? styles.error : 
                  styles.pending
                }`}
                title={
                  selectedSite.connectionStatus === 'CONNECTED' ? t('sites.status.connected') :
                  selectedSite.connectionStatus === 'DISCONNECTED' ? t('sites.status.disconnected') :
                  selectedSite.connectionStatus === 'ERROR' ? t('sites.status.error') :
                  t('sites.status.pending')
                }
              />
            )}
          </span>
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
                  <div
                    key={site.id}
                    className={`${styles.siteItem} ${site.id === selectedSite?.id ? styles.siteItemSelected : ''}`}
                  >
                    <button
                      className={styles.siteItemContent}
                      onClick={() => handleSelect(site)}
                    >
                      <div className={styles.siteInfo}>
                        <div className={styles.siteNameRow}>
                          <span className={styles.siteName}>{site.name}</span>
                          {site.platform === 'wordpress' && (
                            <span 
                              className={`${styles.connectionDot} ${
                                site.connectionStatus === 'CONNECTED' ? styles.connected : 
                                site.connectionStatus === 'DISCONNECTED' ? styles.disconnected : 
                                site.connectionStatus === 'ERROR' ? styles.error : 
                                styles.pending
                              }`}
                              title={
                                site.connectionStatus === 'CONNECTED' ? t('sites.status.connected') :
                                site.connectionStatus === 'DISCONNECTED' ? t('sites.status.disconnected') :
                                site.connectionStatus === 'ERROR' ? t('sites.status.error') :
                                t('sites.status.pending')
                              }
                            />
                          )}
                        </div>
                        <span className={styles.siteUrl}>{site.url}</span>
                      </div>
                    </button>
                    <div className={styles.siteItemActions}>
                      <a
                        href={site.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.openSiteLink}
                        onClick={(e) => e.stopPropagation()}
                        title={t('sites.openWebsite')}
                      >
                        <ExternalLink size={14} />
                      </a>
                      <button
                        className={styles.editSiteButton}
                        onClick={(e) => openEditModal(site, e)}
                        title={t('common.edit')}
                      >
                        <Pencil size={14} />
                      </button>
                    </div>
                  </div>
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
      
      <AddSiteModal
        isOpen={showAddModal}
        onClose={closeAddModal}
        onSiteAdded={handleSiteAdded}
        autoSelect
        showInterviewOnCreate
      />
      {showEditModal && renderEditModal()}
    </>
  );

  function renderEditModal() {
    return createPortal(
      <div className={styles.modalOverlay} onClick={closeEditModal}>
        <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
          <div className={styles.modalHeader}>
            <h3 className={styles.modalTitle}>{t('sites.edit.title')}</h3>
            <button className={styles.modalClose} onClick={closeEditModal}>
              <X size={20} />
            </button>
          </div>

          <div className={styles.modalBody}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{t('sites.edit.nameLabel')}</label>
              <input
                ref={editInputRef}
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={handleEditKeyDown}
                placeholder={t('sites.edit.namePlaceholder')}
                className={styles.nameInput}
                disabled={isUpdating}
              />
            </div>

            {editingSite && (
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>{t('sites.edit.urlLabel')}</label>
                <div className={styles.urlDisplay}>{editingSite.url}</div>
              </div>
            )}

            {updateError && (
              <div className={styles.errorMessage}>
                <AlertCircle size={16} />
                <span>{updateError}</span>
              </div>
            )}
          </div>

          <div className={styles.modalFooter}>
            <button className={styles.cancelButton} onClick={closeEditModal}>
              {t('common.cancel')}
            </button>
            <button
              className={styles.createButton}
              onClick={handleUpdateSite}
              disabled={!editName.trim() || isUpdating}
            >
              {isUpdating ? (
                <>
                  <Loader2 className={styles.spinningIcon} size={16} />
                  {t('common.saving')}
                </>
              ) : (
                <>
                  <Check size={16} />
                  {t('common.save')}
                </>
              )}
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  }
}
