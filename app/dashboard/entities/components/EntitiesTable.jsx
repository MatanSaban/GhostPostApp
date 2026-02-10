'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Search, 
  RefreshCw, 
  ExternalLink, 
  Edit, 
  Trash2,
  X,
  FileText,
  StopCircle,
  Loader2,
  CheckSquare,
  Square,
  Minus,
  AlertTriangle,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { TableSkeleton } from '@/app/dashboard/components';
import { OnboardingCard } from './OnboardingCard';
import styles from '../entities.module.css';

// Helper to decode URL-encoded strings (like Hebrew text)
const decodeText = (text) => {
  if (!text) return '';
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

export function EntitiesTable({ 
  entities = [], 
  entityType,
  entityTypeName,
  onSync,
  onStopSync,
  onRefreshEntity,
  onEntityRemoved,
  onEntitiesRemoved,
  onDownloadPlugin,
  isLoading = false,
  isSyncing = false,
  isDownloadingPlugin = false,
  lastSyncDate = null,
  isPluginConnected = false,
  hasSyncedBefore = false,
  site = null,
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [deleteType, setDeleteType] = useState(null); // 'remove' or 'trash'
  const [refreshingId, setRefreshingId] = useState(null);
  
  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [bulkDeleteType, setBulkDeleteType] = useState(null); // 'remove' or 'trash'

  // Check if site is WordPress
  const isWordPressSite = site?.platform === 'wordpress';

  // Determine which onboarding state to show
  const getOnboardingVariant = () => {
    // If loading, don't show onboarding
    if (isLoading) return null;
    
    // If we have entities, don't show onboarding
    if (entities.length > 0) return null;
    
    // If plugin is not connected
    if (!isPluginConnected) {
      // Check if it's a WordPress site - show plugin download
      if (isWordPressSite) return 'connect';
      // Non-WordPress site - show scan option
      return 'connectNonWP';
    }
    
    // If plugin is connected but never synced, show sync flow
    if (!hasSyncedBefore && !lastSyncDate) return 'sync';
    
    // If synced but no entities of this type, show empty state
    return 'empty';
  };

  const onboardingVariant = getOnboardingVariant();

  // Remove from platform only (local delete)
  const handleRemoveFromPlatform = async (entity) => {
    const confirmMessage = t('entities.removeItemConfirm', { title: entity.title });
    
    if (!confirm(confirmMessage)) return;

    setDeletingId(entity.id);
    setDeleteType('remove');

    try {
      const response = await fetch(`/api/entities/${entity.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        onEntityRemoved?.(entity.id);
      } else {
        const data = await response.json();
        console.error('Failed to remove entity:', data.error);
        alert(t('entities.removeFailed'));
      }
    } catch (error) {
      console.error('Failed to remove entity:', error);
      alert(t('entities.removeFailed'));
    } finally {
      setDeletingId(null);
      setDeleteType(null);
    }
  };

  // Refresh a single entity by deep crawling it
  const handleRefreshEntity = async (entity) => {
    if (!onRefreshEntity) return;
    
    setRefreshingId(entity.id);
    try {
      await onRefreshEntity(entity.id);
    } finally {
      setRefreshingId(null);
    }
  };

  // Delete from WordPress (move to trash) and remove from platform
  const handleDeleteFromWordPress = async (entity) => {
    const confirmMessage = t('entities.deleteItemConfirm', { title: entity.title });
    
    if (!confirm(confirmMessage)) return;

    setDeletingId(entity.id);
    setDeleteType('trash');

    try {
      const response = await fetch(`/api/entities/${entity.id}?deleteFromWP=true`, {
        method: 'DELETE',
      });

      if (response.ok) {
        onEntityRemoved?.(entity.id);
      } else {
        const data = await response.json();
        console.error('Failed to delete entity:', data.error);
        alert(t('entities.deleteFailed'));
      }
    } catch (error) {
      console.error('Failed to delete entity:', error);
      alert(t('entities.deleteFailed'));
    } finally {
      setDeletingId(null);
      setDeleteType(null);
    }
  };

  // Bulk selection handlers
  const handleSelectAll = () => {
    if (selectedIds.size === filteredEntities.length) {
      // Deselect all
      setSelectedIds(new Set());
    } else {
      // Select all filtered entities
      setSelectedIds(new Set(filteredEntities.map(e => e.id)));
    }
  };

  const handleSelectOne = (entityId) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(entityId)) {
        newSet.delete(entityId);
      } else {
        newSet.add(entityId);
      }
      return newSet;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  // Bulk remove from platform
  const handleBulkRemoveFromPlatform = async () => {
    const count = selectedIds.size;
    const confirmMessage = t('entities.bulk.removeConfirm', { count });
    
    if (!confirm(confirmMessage)) return;

    setIsBulkDeleting(true);
    setBulkDeleteType('remove');

    try {
      const idsToDelete = Array.from(selectedIds);
      const results = await Promise.allSettled(
        idsToDelete.map(id => 
          fetch(`/api/entities/${id}`, { method: 'DELETE' })
        )
      );

      const successCount = results.filter(r => r.status === 'fulfilled' && r.value.ok).length;
      
      if (successCount > 0) {
        onEntitiesRemoved?.(idsToDelete.filter((_, i) => 
          results[i].status === 'fulfilled' && results[i].value.ok
        ));
        setSelectedIds(new Set());
      }

      if (successCount < count) {
        alert(t('entities.bulk.removedCount', { success: successCount, total: count }));
      }
    } catch (error) {
      console.error('Failed to bulk remove:', error);
      alert(t('entities.bulk.removeFailed'));
    } finally {
      setIsBulkDeleting(false);
      setBulkDeleteType(null);
    }
  };

  // Bulk delete from WordPress
  const handleBulkDeleteFromWordPress = async () => {
    const count = selectedIds.size;
    const confirmMessage = t('entities.bulk.deleteConfirm', { count });
    
    if (!confirm(confirmMessage)) return;

    setIsBulkDeleting(true);
    setBulkDeleteType('trash');

    try {
      const idsToDelete = Array.from(selectedIds);
      const results = await Promise.allSettled(
        idsToDelete.map(id => 
          fetch(`/api/entities/${id}?deleteFromWP=true`, { method: 'DELETE' })
        )
      );

      const successCount = results.filter(r => r.status === 'fulfilled' && r.value.ok).length;
      
      if (successCount > 0) {
        onEntitiesRemoved?.(idsToDelete.filter((_, i) => 
          results[i].status === 'fulfilled' && results[i].value.ok
        ));
        setSelectedIds(new Set());
      }

      if (successCount < count) {
        alert(t('entities.bulk.deletedCount', { success: successCount, total: count }));
      }
    } catch (error) {
      console.error('Failed to bulk delete:', error);
      alert(t('entities.bulk.deleteFailed'));
    } finally {
      setIsBulkDeleting(false);
      setBulkDeleteType(null);
    }
  };

  const filteredEntities = useMemo(() => 
    entities.filter((entity) => 
      decodeText(entity.title)?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      decodeText(entity.slug)?.toLowerCase().includes(searchQuery.toLowerCase())
    ), [entities, searchQuery]
  );

  // Checkbox state for header
  const isAllSelected = filteredEntities.length > 0 && selectedIds.size === filteredEntities.length;
  const isPartiallySelected = selectedIds.size > 0 && selectedIds.size < filteredEntities.length;

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString();
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString();
  };

  const getStatusClass = (status) => {
    switch (status?.toLowerCase()) {
      case 'published':
      case 'publish':
        return styles.published;
      case 'draft':
        return styles.draft;
      case 'pending':
        return styles.pending;
      case 'scheduled':
      case 'future':
        return styles.scheduled;
      case 'private':
        return styles.private;
      case 'archived':
      case 'trash':
        return styles.archived;
      default:
        return styles.draft;
    }
  };

  const getStatusText = (status) => {
    switch (status?.toLowerCase()) {
      case 'published':
      case 'publish':
        return t('entities.published');
      case 'draft':
        return t('entities.draft');
      case 'pending':
        return t('entities.pending');
      case 'scheduled':
      case 'future':
        return t('entities.scheduled');
      case 'private':
        return t('entities.private');
      case 'archived':
        return t('entities.archived');
      case 'trash':
        return t('entities.trash');
      default:
        return t('entities.draft');
    }
  };

  return (
    <div className={styles.tableCard}>
      <div className={styles.tableHeader}>
        <div>
          <h2 className={styles.tableTitle}>
            {entityTypeName || t(`entities.${entityType}.title`)}
          </h2>
          {lastSyncDate && (
            <span className={styles.dateCell}>
              {t('entities.lastSync')}: {formatDate(lastSyncDate)}
            </span>
          )}
        </div>
        <div className={styles.tableActions}>
          <div className={styles.searchInput}>
            <Search />
            <input
              type="text"
              placeholder={t('entities.search')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {isSyncing ? (
            <button 
              className={`${styles.syncButton} ${styles.stopButton}`}
              onClick={onStopSync}
            >
              <StopCircle />
              <span>{t('entities.sync.stop')}</span>
            </button>
          ) : (
            <button 
              className={styles.syncButton}
              onClick={onSync}
            >
              <RefreshCw />
              <span>{t('entities.syncEntity', { name: entityTypeName || entityType })}</span>
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={8} columns={4} hasCheckbox hasHeader={false} />
      ) : onboardingVariant ? (
        <OnboardingCard
          variant={onboardingVariant}
          entityTypeName={entityTypeName || t(`entities.${entityType}.title`)}
          site={site}
          isLoading={onboardingVariant === 'connect' ? isDownloadingPlugin : isSyncing}
          onPrimaryAction={
            onboardingVariant === 'connect' ? onDownloadPlugin : 
            onboardingVariant === 'connectNonWP' ? onSync :
            onSync
          }
          onSecondaryAction={onboardingVariant === 'connect' ? () => {
            // Open instructions - could link to docs or show a modal
            window.open('https://docs.ghostpost.io/wordpress-plugin', '_blank');
          } : undefined}
        />
      ) : filteredEntities.length === 0 ? (
        <div className={styles.emptyState}>
          <FileText className={styles.emptyIcon} />
          <h3 className={styles.emptyTitle}>{t('common.noResults')}</h3>
          <p className={styles.emptyDescription}>{t('entities.noSearchResults')}</p>
        </div>
      ) : (
        <>
          {/* Bulk Actions Bar */}
          {selectedIds.size > 0 && (
            <div className={styles.bulkActionsBar}>
              <div className={styles.bulkActionsInfo}>
                <span className={styles.selectedCount}>
                  {t('entities.bulk.selected', { count: selectedIds.size })}
                </span>
                <button 
                  className={styles.clearSelectionButton}
                  onClick={clearSelection}
                >
                  {t('entities.bulk.clearSelection')}
                </button>
              </div>
              <div className={styles.bulkActionsButtons}>
                <button
                  className={`${styles.bulkActionButton} ${styles.bulkRemove}`}
                  onClick={handleBulkRemoveFromPlatform}
                  disabled={isBulkDeleting}
                >
                  {isBulkDeleting && bulkDeleteType === 'remove' ? (
                    <Loader2 className={styles.spinningIcon} />
                  ) : (
                    <X />
                  )}
                  <span>{t('entities.bulk.removeFromPlatform')}</span>
                </button>
                {isPluginConnected && (
                  <button
                    className={`${styles.bulkActionButton} ${styles.bulkDelete}`}
                    onClick={handleBulkDeleteFromWordPress}
                    disabled={isBulkDeleting}
                  >
                    {isBulkDeleting && bulkDeleteType === 'trash' ? (
                      <Loader2 className={styles.spinningIcon} />
                    ) : (
                      <Trash2 />
                    )}
                    <span>{t('entities.bulk.deleteFromWebsite')}</span>
                  </button>
                )}
              </div>
            </div>
          )}
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.checkboxCell}>
                  <button 
                    className={styles.checkboxButton}
                    onClick={handleSelectAll}
                    aria-label={isAllSelected ? t('entities.bulk.deselectAll') : t('entities.bulk.selectAll')}
                  >
                    {isAllSelected ? (
                      <CheckSquare className={styles.checkboxIcon} />
                    ) : isPartiallySelected ? (
                      <Minus className={styles.checkboxIconPartial} />
                    ) : (
                      <Square className={styles.checkboxIcon} />
                    )}
                  </button>
                </th>
                <th>{t('common.title')}</th>
                <th>{t('entities.status')}</th>
                <th>{t('common.date')}</th>
                <th>{t('entities.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntities.map((entity) => (
                <tr 
                  key={entity.id || entity.slug}
                  className={selectedIds.has(entity.id) ? styles.selectedRow : ''}
                >
                  <td className={styles.checkboxCell}>
                    <button
                      className={styles.checkboxButton}
                      onClick={() => handleSelectOne(entity.id)}
                      aria-label={selectedIds.has(entity.id) ? t('entities.bulk.deselect') : t('entities.bulk.select')}
                    >
                      {selectedIds.has(entity.id) ? (
                        <CheckSquare className={styles.checkboxIcon} />
                      ) : (
                        <Square className={styles.checkboxIcon} />
                      )}
                    </button>
                  </td>
                  <td>
                    <div className={styles.entityTitle}>
                      {decodeText(entity.title)}
                      {entity.metadata?.h1Issue && (
                        <span 
                          className={styles.h1Warning}
                          title={t('entities.h1IssueTooltip')}
                        >
                          <AlertTriangle size={14} />
                        </span>
                      )}
                    </div>
                    <div className={styles.entitySlug}>{decodeText(entity.slug)}</div>
                  </td>
                  <td>
                    <span className={`${styles.statusBadge} ${getStatusClass(entity.status)}`}>
                    {getStatusText(entity.status)}
                  </span>
                  {/* Show scheduled date for scheduled posts */}
                  {(entity.status?.toLowerCase() === 'scheduled' || entity.status?.toLowerCase() === 'future') && entity.scheduledAt && (
                    <div className={styles.scheduledDate}>
                      {formatDateTime(entity.scheduledAt)}
                    </div>
                  )}
                </td>
                <td className={styles.dateCell}>
                  {formatDate(entity.date || entity.createdAt)}
                </td>
                <td>
                  <div className={styles.actionButtons}>
                    {/* Refresh/re-crawl this entity */}
                    <button 
                      className={`${styles.actionButton} ${styles.refresh}`}
                      onClick={() => handleRefreshEntity(entity)}
                      disabled={refreshingId === entity.id}
                      title={t('entities.refreshDataTooltip')}
                    >
                      {refreshingId === entity.id ? (
                        <Loader2 className={styles.spinningIcon} />
                      ) : (
                        <RefreshCw />
                      )}
                    </button>
                    {entity.url && (
                      <a 
                        href={entity.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className={`${styles.actionButton} ${styles.view}`}
                        title={t('entities.viewOnSite')}
                      >
                        <ExternalLink />
                      </a>
                    )}
                    <button 
                      className={`${styles.actionButton} ${styles.edit}`}
                      onClick={() => router.push(`/dashboard/entities/${entityType}/${entity.id}`)}
                      title={t('common.edit')}
                    >
                      <Edit />
                    </button>
                    {/* Remove from platform only (X button) */}
                    <button 
                      className={`${styles.actionButton} ${styles.remove}`}
                      onClick={() => handleRemoveFromPlatform(entity)}
                      disabled={deletingId === entity.id}
                      title={t('entities.removeFromPlatformTooltip')}
                    >
                      {deletingId === entity.id && deleteType === 'remove' ? (
                        <Loader2 className={styles.spinningIcon} />
                      ) : (
                        <X />
                      )}
                    </button>
                    {/* Delete from WordPress (Trash button) - only show if plugin connected */}
                    {isPluginConnected && (
                      <button 
                        className={`${styles.actionButton} ${styles.delete}`}
                        onClick={() => handleDeleteFromWordPress(entity)}
                        disabled={deletingId === entity.id}
                        title={t('entities.deleteFromWebsiteTooltip')}
                      >
                        {deletingId === entity.id && deleteType === 'trash' ? (
                          <Loader2 className={styles.spinningIcon} />
                        ) : (
                          <Trash2 />
                        )}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </>
      )}
    </div>
  );
}
