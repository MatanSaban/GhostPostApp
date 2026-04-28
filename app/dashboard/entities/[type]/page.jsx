'use client';

import { useState, useEffect, use, useRef, useCallback } from 'react';
import { FileText, Newspaper, FolderKanban, Briefcase, Package, MoreHorizontal, Database, Pencil, Check, X } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useSite } from '@/app/context/site-context';
import { handleLimitError } from '@/app/context/limit-guard-context';
import { StatsCard, StatsGridSkeleton, TableSkeleton, PageHeaderSkeleton } from '@/app/dashboard/components';
import { useDynamicPageMeta } from '@/app/components/PageMeta';
import { EntitiesTable } from '../components';
import styles from '../entities.module.css';

const TYPE_ICONS = {
  pages: FileText,
  posts: Newspaper,
  projects: FolderKanban,
  services: Briefcase,
  products: Package,
  other: MoreHorizontal,
};

// Get the display name for an entity type based on current locale
function getLocalizedName(entityType, locale) {
  if (!entityType) return '';
  const labels = entityType.labels;
  if (labels && typeof labels === 'object' && labels[locale]) {
    return labels[locale];
  }
  return entityType.name || '';
}

export default function EntityTypePage({ params }) {
  const { type } = use(params);
  const { t, locale } = useLocale();
  const { selectedSite } = useSite();
  
  const [entityType, setEntityType] = useState(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState('');
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const titleInputRef = useRef(null);
  const [entities, setEntities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDownloadingPlugin, setIsDownloadingPlugin] = useState(false);
  const [lastSyncDate, setLastSyncDate] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    published: 0,
    draft: 0,
    scheduled: 0,
    pending: 0,
  });
  
  // Abort controller for cancelling sync
  const syncAbortControllerRef = useRef(null);

  const Icon = TYPE_ICONS[type] || Database;

  // Resolved localized display name
  const displayName = getLocalizedName(entityType, locale);

  // Override the document title with the user-customized entity-type name
  // (e.g. "פוסטים", "Services", or whatever the user renamed it to). Falls
  // back to the route param while the entity type is still loading.
  useDynamicPageMeta(displayName || (type ? type[0].toUpperCase() + type.slice(1) : null));

  // Start inline editing
  const handleStartEditTitle = useCallback(() => {
    setEditTitleValue(displayName);
    setIsEditingTitle(true);
    // Focus input after render
    setTimeout(() => titleInputRef.current?.focus(), 0);
  }, [displayName]);

  // Save edited title
  const handleSaveTitle = useCallback(async () => {
    const trimmed = editTitleValue.trim();
    if (!trimmed || !entityType?.id || trimmed === displayName) {
      setIsEditingTitle(false);
      return;
    }

    setIsSavingTitle(true);
    try {
      const res = await fetch('/api/entities/types', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityTypeId: entityType.id,
          locale,
          label: trimmed,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        // Update local entityType state with new labels
        setEntityType(prev => ({ ...prev, labels: data.labels }));
        // Notify sidebar to refresh
        window.dispatchEvent(new Event('entityTypeLabelUpdated'));
      }
    } catch (error) {
      console.error('Failed to save entity type label:', error);
    } finally {
      setIsSavingTitle(false);
      setIsEditingTitle(false);
    }
  }, [editTitleValue, entityType?.id, displayName, locale]);

  // Cancel editing
  const handleCancelEditTitle = useCallback(() => {
    setIsEditingTitle(false);
  }, []);

  // Handle key events in title input
  const handleTitleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveTitle();
    } else if (e.key === 'Escape') {
      handleCancelEditTitle();
    }
  }, [handleSaveTitle, handleCancelEditTitle]);

  // Fetch entity type info and entities when site changes
  useEffect(() => {
    if (selectedSite?.id) {
      fetchEntityType();
    }
  }, [selectedSite?.id, type]);

  const fetchEntityType = async () => {
    if (!selectedSite?.id) return;
    
    setIsLoading(true);
    try {
      // First fetch the entity type to verify it exists
      const typesResponse = await fetch(`/api/entities/types?siteId=${selectedSite.id}`);
      if (typesResponse.ok) {
        const typesData = await typesResponse.json();
        const foundType = typesData.types?.find(t => t.slug === type);
        
        if (!foundType) {
          setNotFound(true);
          setIsLoading(false);
          return;
        }
        
        setEntityType(foundType);
        setNotFound(false);
        await fetchEntities();
      }
    } catch (error) {
      console.error('Failed to fetch entity type:', error);
      setNotFound(true);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchEntities = async () => {
    if (!selectedSite?.id) return;
    
    try {
      const response = await fetch(`/api/entities?siteId=${selectedSite.id}&type=${type}`);
      if (response.ok) {
        const data = await response.json();
        setEntities(data.entities || []);
        setLastSyncDate(data.lastSync);
        
        // Calculate stats
        const published = data.entities?.filter(e => 
          e.status?.toLowerCase() === 'published' || e.status?.toLowerCase() === 'publish'
        ).length || 0;
        const draft = data.entities?.filter(e => e.status?.toLowerCase() === 'draft').length || 0;
        const scheduled = data.entities?.filter(e => 
          e.status?.toLowerCase() === 'scheduled' || e.status?.toLowerCase() === 'future'
        ).length || 0;
        const pending = data.entities?.filter(e => 
          e.status?.toLowerCase() === 'pending' || e.status?.toLowerCase() === 'pending review'
        ).length || 0;
        
        setStats({
          total: data.entities?.length || 0,
          published,
          draft,
          scheduled,
          pending,
        });
      }
    } catch (error) {
      console.error('Failed to fetch entities:', error);
    }
  };

  const handleSync = async () => {
    if (!selectedSite?.id || !entityType?.id) return;
    
    // Create abort controller for this sync
    syncAbortControllerRef.current = new AbortController();
    
    setIsSyncing(true);
    try {
      // Use deep crawl to sync entities (creates from sitemap + enriches in one pass)
      const response = await fetch('/api/entities/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          siteId: selectedSite.id, 
          phase: 'crawl',
          entityTypeId: entityType.id, // Only sync this specific entity type
          options: {
            forceRescan: true,
            createFromSitemap: true,
            batchSize: 50,
          },
        }),
        signal: syncAbortControllerRef.current.signal,
      });
      
      if (response.ok) {
        await fetchEntities();
      } else {
        const errorData = await response.json();
        if (handleLimitError(errorData)) {
          setIsSyncing(false);
          return;
        }
        console.error('Sync failed:', errorData.error);
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Sync was cancelled');
      } else {
        console.error('Failed to sync entities:', error);
      }
    } finally {
      setIsSyncing(false);
      syncAbortControllerRef.current = null;
    }
  };

  // Deep crawl a single entity to refresh its data
  const handleRefreshEntity = async (entityId) => {
    if (!selectedSite?.id) return false;
    
    try {
      const response = await fetch('/api/entities/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          siteId: selectedSite.id,
          entityId,
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        // Update the entity in local state
        if (data.entity) {
          setEntities(prev => prev.map(e => 
            e.id === entityId ? { ...e, ...data.entity } : e
          ));
        }
        return true;
      } else {
        const errorData = await response.json();
        if (handleLimitError(errorData)) return false;
        console.error('Refresh failed:', errorData.error);
        return false;
      }
    } catch (error) {
      console.error('Failed to refresh entity:', error);
      return false;
    }
  };

  const handleStopSync = () => {
    if (syncAbortControllerRef.current) {
      syncAbortControllerRef.current.abort();
      syncAbortControllerRef.current = null;
      setIsSyncing(false);
    }
  };

  // Download WordPress plugin
  const handleDownloadPlugin = async () => {
    if (!selectedSite?.id) return;

    setIsDownloadingPlugin(true);
    try {
      const response = await fetch(`/api/sites/${selectedSite.id}/download-plugin`);
      
      if (!response.ok) {
        throw new Error('Failed to download plugin');
      }

      // Get the blob and create download link
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ghostseo-${selectedSite.id}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to download plugin:', error);
    } finally {
      setIsDownloadingPlugin(false);
    }
  };

  const statsData = [
    { 
      iconName: 'Database', 
      value: String(stats.total), 
      label: displayName 
        ? t('entities.totalWithName', { entityName: displayName })
        : t('entities.totalEntities'), 
      color: 'purple' 
    },
    { 
      iconName: 'CheckCircle', 
      value: String(stats.published), 
      label: displayName 
        ? t('entities.publishedWithName', { entityName: displayName })
        : t('entities.published'), 
      color: 'green' 
    },
    { 
      iconName: 'Clock', 
      value: String(stats.scheduled), 
      label: displayName 
        ? t('entities.scheduledWithName', { entityName: displayName })
        : t('entities.scheduled'), 
      color: 'blue' 
    },
    { 
      iconName: 'AlertCircle', 
      value: String(stats.pending), 
      label: displayName 
        ? t('entities.pendingWithName', { entityName: displayName })
        : t('entities.pending'), 
      color: 'orange' 
    },
    { 
      iconName: 'FileEdit', 
      value: String(stats.draft), 
      label: displayName 
        ? t('entities.draftWithName', { entityName: displayName })
        : t('entities.draft'), 
      color: 'gray' 
    },
  ];

  // Show loading state
  if (isLoading && !entityType) {
    return (
      <div className={styles.container}>
        <PageHeaderSkeleton />
        <StatsGridSkeleton count={5} />
        <TableSkeleton rows={8} columns={4} hasCheckbox />
      </div>
    );
  }

  // Show not found state
  if (notFound || !entityType) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <Database className={styles.emptyIcon} />
          <h3 className={styles.emptyTitle}>{t('common.noResults')}</h3>
          <p className={styles.emptyDescription}>
            {t(`entities.${type}.emptyDescription`) || t('entities.types.selectDescription')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div className={styles.headerContent}>
          {isEditingTitle ? (
            <div className={styles.editTitleRow}>
              <input
                ref={titleInputRef}
                className={styles.editTitleInput}
                value={editTitleValue}
                onChange={(e) => setEditTitleValue(e.target.value)}
                onKeyDown={handleTitleKeyDown}
                onBlur={handleSaveTitle}
                disabled={isSavingTitle}
              />
              <button
                className={styles.editTitleBtn}
                onMouseDown={(e) => { e.preventDefault(); handleSaveTitle(); }}
                disabled={isSavingTitle}
                aria-label={t('common.save')}
              >
                <Check size={16} />
              </button>
              <button
                className={styles.editTitleBtnCancel}
                onMouseDown={(e) => { e.preventDefault(); handleCancelEditTitle(); }}
                disabled={isSavingTitle}
                aria-label={t('common.cancel')}
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <h1
              className={`${styles.pageTitle} ${styles.pageTitleEditable}`}
              onClick={handleStartEditTitle}
              title={t('entities.editTypeName')}
            >
              {displayName || t(`entities.${type}.title`)}
              <Pencil className={styles.editTitleIcon} size={14} />
            </h1>
          )}
          <p className={styles.pageSubtitle}>
            {displayName 
              ? t('entities.subtitle') 
              : t(`entities.${type}.subtitle`) || t('entities.subtitle')}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className={styles.statsGrid}>
        {statsData.map((stat, index) => (
          <StatsCard
            key={index}
            iconName={stat.iconName}
            value={stat.value}
            label={stat.label}
            color={stat.color}
          />
        ))}
      </div>

      {/* Entities Table */}
      <EntitiesTable
        entities={entities}
        entityType={type}
        entityTypeName={displayName}
        onSync={handleSync}
        onStopSync={handleStopSync}
        onRefreshEntity={handleRefreshEntity}
        onDownloadPlugin={handleDownloadPlugin}
        onEntityRemoved={(entityId) => {
          setEntities(prev => prev.filter(e => e.id !== entityId));
          setStats(prev => ({ ...prev, total: prev.total - 1 }));
        }}
        onEntitiesRemoved={(entityIds) => {
          setEntities(prev => prev.filter(e => !entityIds.includes(e.id)));
          setStats(prev => ({ ...prev, total: prev.total - entityIds.length }));
        }}
        isLoading={isLoading}
        isSyncing={isSyncing}
        isDownloadingPlugin={isDownloadingPlugin}
        lastSyncDate={lastSyncDate}
        hasSyncedBefore={!!lastSyncDate}
        isPluginConnected={selectedSite?.connectionStatus === 'CONNECTED' && !!selectedSite?.siteKey}
        site={selectedSite}
      />
    </div>
  );
}
