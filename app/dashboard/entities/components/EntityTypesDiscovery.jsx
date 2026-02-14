'use client';

import { useState } from 'react';
import { useLocale } from '@/app/context/locale-context';
import styles from '../entities.module.css';

export function EntityTypesDiscovery({
  discoveredTypes,
  selectedTypes,
  isDiscovering,
  discoveryError,
  editingType,
  setEditingType,
  sitemapNotFound,
  customSitemapUrl,
  setCustomSitemapUrl,
  isCrawling,
  isSaving,
  onToggleType,
  onUpdateLabel,
  onCustomSitemapSubmit,
  onDiscoverByCrawling,
  onSaveAndPopulate,
  onDiscoverEntityTypes,
}) {
  const { t, locale } = useLocale();
  const [editLabel, setEditLabel] = useState('');

  const handleStartEdit = (type) => {
    setEditingType(type.slug);
    setEditLabel(type.name);
  };

  const handleSaveEdit = (slug) => {
    onUpdateLabel(slug, editLabel);
    setEditingType(null);
  };

  const handleCancelEdit = () => {
    setEditingType(null);
    setEditLabel('');
  };

  if (sitemapNotFound && discoveredTypes.length === 0) {
    return (
      <div className={styles.discoveryCard}>
        <div className={styles.sitemapNotFound}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
          <h3>{t('entities.discovery.sitemapNotFound')}</h3>
          <p>{t('entities.discovery.sitemapNotFoundDesc')}</p>
        </div>

        <div className={styles.sitemapOptions}>
          <div className={styles.customSitemapForm}>
            <label className={styles.inputLabel}>{t('entities.discovery.customSitemapLabel')}</label>
            <div className={styles.inputGroup}>
              <input
                type="url"
                value={customSitemapUrl}
                onChange={(e) => setCustomSitemapUrl(e.target.value)}
                placeholder="https://example.com/sitemap.xml"
                className={styles.sitemapInput}
              />
              <button
                onClick={onCustomSitemapSubmit}
                disabled={!customSitemapUrl.trim() || isDiscovering}
                className={styles.submitButton}
              >
                {isDiscovering ? t('common.loading') : t('entities.discovery.tryCustom')}
              </button>
            </div>
          </div>

          <div className={styles.orDivider}>
            <span>{t('common.or')}</span>
          </div>

          <button
            onClick={onDiscoverByCrawling}
            disabled={isCrawling}
            className={styles.crawlButton}
          >
            {isCrawling ? (
              <>
                <span className={styles.spinner} />
                {t('entities.discovery.crawling')}
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                  <path d="M21 3v5h-5" />
                </svg>
                {t('entities.discovery.discoverByCrawling')}
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  if (isDiscovering) {
    return (
      <div className={styles.discoveryCard}>
        <div className={styles.discoveringState}>
          <div className={styles.loadingSpinner} />
          <p>{t('entities.discovery.discovering')}</p>
        </div>
      </div>
    );
  }

  if (discoveryError) {
    return (
      <div className={styles.discoveryCard}>
        <div className={styles.discoveryError}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p>{discoveryError}</p>
          <button onClick={() => onDiscoverEntityTypes()} className={styles.retryButton}>
            {t('common.retry')}
          </button>
        </div>
      </div>
    );
  }

  if (discoveredTypes.length === 0) {
    return (
      <div className={styles.discoveryCard}>
        <div className={styles.discoveringState}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <h3>{t('entities.discovery.noTypes')}</h3>
          <p>{t('entities.discovery.noTypesDescription')}</p>
          <button
            onClick={() => onDiscoverEntityTypes()}
            disabled={isDiscovering}
            className={styles.detectButton}
          >
            {isDiscovering ? (
              <>
                <span className={styles.spinner} />
                {t('entities.discovery.discovering')}
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                {t('entities.discovery.scan')}
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.discoveryCard}>
      <div className={styles.discoveryHeader}>
        <h3>{t('entities.discovery.title')}</h3>
        <p>{t('entities.discovery.selectTypes')}</p>
      </div>

      <div className={styles.typesGrid}>
        {discoveredTypes.map((type) => {
          const isSelected = selectedTypes.includes(type.slug);
          const isEditing = editingType === type.slug;
          const displayName = locale === 'he' && type.nameHe ? type.nameHe : type.name;

          return (
            <div
              key={type.slug}
              className={`${styles.typeCard} ${isSelected ? styles.typeCardSelected : ''}`}
              onClick={() => !isEditing && onToggleType(type.slug)}
            >
              <div className={styles.typeCardHeader}>
                <div className={styles.typeCheckbox}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleType(type.slug)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                {isEditing ? (
                  <input
                    type="text"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className={styles.editLabelInput}
                    autoFocus
                  />
                ) : (
                  <span className={styles.typeName}>{displayName}</span>
                )}
                <button
                  className={styles.editButton}
                  onClick={(e) => {
                    e.stopPropagation();
                    isEditing ? handleSaveEdit(type.slug) : handleStartEdit(type);
                  }}
                >
                  {isEditing ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  )}
                </button>
                {isEditing && (
                  <button
                    className={styles.cancelEditButton}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCancelEdit();
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
              <div className={styles.typeCardMeta}>
                <span className={styles.typeSlug}>{type.slug}</span>
                {type.entityCount > 0 && (
                  <span className={styles.typeCount}>{type.entityCount} {t('entities.items')}</span>
                )}
                {type.isCore && (
                  <span className={styles.coreBadge}>{t('entities.core')}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.discoveryActions}>
        <button
          onClick={onSaveAndPopulate}
          disabled={selectedTypes.length === 0 || isSaving}
          className={styles.saveButton}
        >
          {isSaving ? (
            <>
              <span className={styles.spinner} />
              {t('entities.discovery.saving')}
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              {t('entities.discovery.saveAndPopulate')} ({selectedTypes.length})
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export function EntityTypesDiscoverySkeleton() {
  return (
    <div className={styles.discoveryCard}>
      <div className={styles.discoveryHeader}>
        <div className={styles.skeletonText} style={{ width: '180px', height: '20px' }} />
        <div className={styles.skeletonText} style={{ width: '250px', height: '14px', marginTop: '0.5rem' }} />
      </div>
      <div className={styles.typesGrid}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className={styles.typeCardSkeleton}>
            <div className={styles.skeletonCheckbox} />
            <div className={styles.skeletonText} style={{ width: '80px', height: '16px' }} />
            <div className={styles.skeletonText} style={{ width: '50px', height: '12px', marginTop: '0.5rem' }} />
          </div>
        ))}
      </div>
      <div className={styles.discoveryActions}>
        <div className={styles.skeletonButton} style={{ width: '180px' }} />
      </div>
    </div>
  );
}
