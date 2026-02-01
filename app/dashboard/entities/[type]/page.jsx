'use client';

import { useState, useEffect, use, useRef } from 'react';
import { FileText, Newspaper, FolderKanban, Briefcase, Package, MoreHorizontal, Database } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useSite } from '@/app/context/site-context';
import { StatsCard } from '@/app/dashboard/components';
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

export default function EntityTypePage({ params }) {
  const { type } = use(params);
  const { t } = useLocale();
  const { selectedSite } = useSite();
  
  const [entityType, setEntityType] = useState(null);
  const [entities, setEntities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
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
    if (!selectedSite?.id) return;
    
    // Create abort controller for this sync
    syncAbortControllerRef.current = new AbortController();
    
    setIsSyncing(true);
    try {
      // Use plugin sync if connected, otherwise use scan endpoint
      const isPluginConnected = selectedSite?.connectionStatus === 'CONNECTED' && selectedSite?.siteKey;
      
      const endpoint = isPluginConnected ? '/api/entities/sync' : '/api/entities/scan';
      const body = isPluginConnected 
        ? { siteId: selectedSite.id, type }
        : { siteId: selectedSite.id, phase: 'populate' };
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: syncAbortControllerRef.current.signal,
      });
      
      if (response.ok) {
        await fetchEntities();
      } else {
        const errorData = await response.json();
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

  const handleStopSync = () => {
    if (syncAbortControllerRef.current) {
      syncAbortControllerRef.current.abort();
      syncAbortControllerRef.current = null;
      setIsSyncing(false);
    }
  };

  const statsData = [
    { 
      iconName: 'Database', 
      value: String(stats.total), 
      label: entityType?.name 
        ? t('entities.totalWithName', { entityName: entityType.name })
        : t('entities.totalEntities'), 
      color: 'purple' 
    },
    { 
      iconName: 'CheckCircle', 
      value: String(stats.published), 
      label: entityType?.name 
        ? t('entities.publishedWithName', { entityName: entityType.name })
        : t('entities.published'), 
      color: 'green' 
    },
    { 
      iconName: 'Clock', 
      value: String(stats.scheduled), 
      label: entityType?.name 
        ? t('entities.scheduledWithName', { entityName: entityType.name })
        : t('entities.scheduled'), 
      color: 'blue' 
    },
    { 
      iconName: 'AlertCircle', 
      value: String(stats.pending), 
      label: entityType?.name 
        ? t('entities.pendingWithName', { entityName: entityType.name })
        : t('entities.pending'), 
      color: 'orange' 
    },
    { 
      iconName: 'FileEdit', 
      value: String(stats.draft), 
      label: entityType?.name 
        ? t('entities.draftWithName', { entityName: entityType.name })
        : t('entities.draft'), 
      color: 'gray' 
    },
  ];

  // Show loading state
  if (isLoading && !entityType) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingContainer}>
          <div className={styles.loadingSpinner}></div>
          <span className={styles.loadingText}>{t('common.loading')}</span>
        </div>
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
          <h1 className={styles.pageTitle}>
            {entityType?.name || t(`entities.${type}.title`)}
          </h1>
          <p className={styles.pageSubtitle}>
            {entityType?.name 
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
        entityTypeName={entityType?.name}
        onSync={handleSync}
        onStopSync={handleStopSync}
        onEntityRemoved={(entityId) => {
          setEntities(prev => prev.filter(e => e.id !== entityId));
          setStats(prev => ({ ...prev, total: prev.total - 1 }));
        }}
        isLoading={isLoading}
        isSyncing={isSyncing}
        lastSyncDate={lastSyncDate}
        isPluginConnected={selectedSite?.connectionStatus === 'CONNECTED' && !!selectedSite?.siteKey}
      />
    </div>
  );
}
