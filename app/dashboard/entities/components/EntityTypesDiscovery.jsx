'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useLocale } from '@/app/context/locale-context';
import { Button } from '@/app/dashboard/components';
import styles from '../entities.module.css';

function formatTimeLeft(seconds, t) {
  if (seconds < 60) return t('entities.sync.etaSeconds').replace('{seconds}', String(Math.ceil(seconds)));
  const minutes = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  if (minutes < 60) return t('entities.sync.etaMinutes').replace('{minutes}', String(minutes)).replace('{seconds}', String(secs));
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return t('entities.sync.etaHours').replace('{hours}', String(hours)).replace('{minutes}', String(mins));
}

export function EntityTypesDiscovery({
  // Discovery props
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
  // Enabled types props (merged from EnabledTypesCard)
  enabledTypes = [],
  siteId,
  isConnected,
  onPopulateEntities,
  onCrawlEntities,
  syncStatus,
  // Sync status props
  syncProgress,
  syncMessage,
  syncError,
  populatedInfo,
  onStopSync,
}) {
  const { t, locale } = useLocale();
  const [editLabel, setEditLabel] = useState('');
  const syncStartRef = useRef(null);
  const startProgressRef = useRef(0);
  const [eta, setEta] = useState(null);

  useEffect(() => {
    if (syncStatus === 'SYNCING' && syncProgress > 0 && !syncStartRef.current) {
      syncStartRef.current = Date.now();
      startProgressRef.current = syncProgress;
    }
    if (syncStatus !== 'SYNCING') {
      syncStartRef.current = null;
      startProgressRef.current = 0;
      setEta(null);
    }
  }, [syncStatus, syncProgress]);

  useEffect(() => {
    if (syncStatus !== 'SYNCING' || !syncStartRef.current || syncProgress <= startProgressRef.current) return;
    const elapsed = (Date.now() - syncStartRef.current) / 1000;
    const progressDelta = syncProgress - startProgressRef.current;
    if (progressDelta > 0 && elapsed > 2) {
      const rate = progressDelta / elapsed;
      const remaining = (100 - syncProgress) / rate;
      setEta(remaining);
    }
  }, [syncStatus, syncProgress]);

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

  const hasEnabledTypes = enabledTypes.length > 0;
  const isSyncing = syncStatus === 'SYNCING';

  // Enabled types section (rendered at the top when types exist)
  const enabledTypesSection = hasEnabledTypes ? (
    <div className={styles.enabledTypesSection}>
      <div className={styles.enabledTypesHeader}>
        <h3>{t('entities.enabledTypes.title')}</h3>
        <button
          onClick={isConnected ? onPopulateEntities : onCrawlEntities}
          disabled={isSyncing}
          className={styles.syncAllButton}
        >
          {isSyncing ? (
            <>
              <span className={styles.spinner} />
              {t('entities.sync.syncing')}
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
              {t('entities.enabledTypes.syncAll')}
            </>
          )}
        </button>
      </div>

      <div className={styles.enabledTypesList}>
        {enabledTypes.map((type) => {
          const displayName = locale === 'he' && type.nameHe ? type.nameHe : type.name;
          const entityCount = type.entityCount || type._count?.entities || 0;

          return (
            <Link
              key={type.id || type.slug}
              href={`/dashboard/entities/${type.slug}`}
              className={styles.enabledTypeItem}
            >
              <div className={styles.typeInfo}>
                <span className={styles.typeName}>{displayName}</span>
                <span className={styles.typeSlug}>{t('entities.entitySlug')} {type.slug}</span>
              </div>
              <div className={styles.typeMeta}>
                <span className={styles.entityCount}>
                  {entityCount} {t('entities.items')}
                </span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  ) : null;

  // Sync status section (shown inside the enabled types area)
  const syncStatusSection = (() => {
    if (syncStatus === 'SYNCING') {
      return (
        <div className={styles.syncProgress}>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${syncProgress}%` }}
            />
          </div>
          <div className={styles.syncMeta}>
            <span className={styles.syncProgressText}>{syncProgress}%</span>
            {eta != null && eta > 0 && syncProgress < 99 && (
              <span className={styles.syncEta}>{formatTimeLeft(eta, t)}</span>
            )}
            {syncMessage && <span className={styles.syncMessage} dir="ltr">{decodeURIComponent(syncMessage)}</span>}
          </div>
          <button onClick={onStopSync} className={styles.stopButton}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="6" y="6" width="12" height="12" />
            </svg>
            {t('entities.sync.stop')}
          </button>
        </div>
      );
    }

    if (syncStatus === 'COMPLETED' && populatedInfo) {
      return (
        <div className={styles.syncComplete}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <div className={styles.syncStats}>
            <span>{t('entities.sync.created')}: {populatedInfo.created}</span>
            <span>{t('entities.sync.updated')}: {populatedInfo.updated}</span>
            <span>{t('entities.sync.total')}: {populatedInfo.totalEntities}</span>
          </div>
        </div>
      );
    }

    if (syncStatus === 'ERROR' && syncError) {
      return (
        <div className={styles.syncErrorState}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p>{syncError}</p>
          <button
            onClick={isConnected ? onPopulateEntities : onCrawlEntities}
            className={styles.retryButton}
          >
            {t('common.retry')}
          </button>
        </div>
      );
    }

    if (syncStatus === 'CANCELLED') {
      return (
        <div className={styles.syncCancelled}>
          <p>{t('entities.sync.cancelledMessage')}</p>
          <button
            onClick={isConnected ? onPopulateEntities : onCrawlEntities}
            className={styles.resumeButton}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            {t('entities.sync.resume')}
          </button>
        </div>
      );
    }

    return null;
  })();

  // Discovery content (varies based on state)
  let discoveryContent = null;

  if (sitemapNotFound && discoveredTypes.length === 0) {
    discoveryContent = (
      <>
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
              <Button
                variant="primary"
                onClick={onCustomSitemapSubmit}
                disabled={!customSitemapUrl.trim() || isDiscovering}
              >
                {isDiscovering ? t('common.loading') : t('entities.discovery.tryCustom')}
              </Button>
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
      </>
    );
  } else if (isDiscovering) {
    discoveryContent = (
      <div className={styles.discoveringState}>
        <div className={styles.loadingSpinner} />
        <p>{t('entities.discovery.discovering')}</p>
      </div>
    );
  } else if (discoveryError) {
    discoveryContent = (
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
    );
  } else if (discoveredTypes.length === 0) {
    discoveryContent = (
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
    );
  } else {
    discoveryContent = (
      <>
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
                  <span className={styles.typeSlug}>{t('entities.entitySlug')} {type.slug}</span>
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

        <div className={styles.discoveryActions} data-onboarding="entities-save-populate">
          <Button
            variant="primary"
            onClick={onSaveAndPopulate}
            disabled={selectedTypes.length === 0 || isSaving}
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
          </Button>
        </div>
      </>
    );
  }

  return (
    <div className={styles.discoveryCard} data-onboarding="entities-discovery-card">
      {/* Enabled types */}
      {enabledTypesSection}

      {/* Sync status (inside enabled types area) */}
      {hasEnabledTypes && syncStatusSection}

      {/* Divider between sections */}
      {hasEnabledTypes && discoveryContent && (
        <div className={styles.sectionDivider} />
      )}

      {/* Discovery */}
      {discoveryContent}
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
