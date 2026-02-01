'use client';

import { useState } from 'react';
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
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
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
  onEntityRemoved,
  isLoading = false,
  isSyncing = false,
  lastSyncDate = null,
  isPluginConnected = false,
}) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [deleteType, setDeleteType] = useState(null); // 'remove' or 'trash'

  // Remove from platform only (local delete)
  const handleRemoveFromPlatform = async (entity) => {
    const confirmMessage = locale === 'he'
      ? `האם אתה בטוח שברצונך להסיר את "${entity.title}" מהפלטפורמה?\nפעולה זו לא תשפיע על האתר של הלקוח.`
      : `Are you sure you want to remove "${entity.title}" from the platform?\nThis will NOT affect the client's website.`;
    
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
        alert(locale === 'he' ? 'הסרת הפריט נכשלה' : 'Failed to remove item');
      }
    } catch (error) {
      console.error('Failed to remove entity:', error);
      alert(locale === 'he' ? 'הסרת הפריט נכשלה' : 'Failed to remove item');
    } finally {
      setDeletingId(null);
      setDeleteType(null);
    }
  };

  // Delete from WordPress (move to trash) and remove from platform
  const handleDeleteFromWordPress = async (entity) => {
    const confirmMessage = locale === 'he'
      ? `האם אתה בטוח שברצונך למחוק את "${entity.title}"?\nפעולה זו תעביר את הפריט לאשפה באתר הלקוח.`
      : `Are you sure you want to delete "${entity.title}"?\nThis will move the item to trash on the client's website.`;
    
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
        alert(locale === 'he' ? 'מחיקת הפריט נכשלה' : 'Failed to delete item');
      }
    } catch (error) {
      console.error('Failed to delete entity:', error);
      alert(locale === 'he' ? 'מחיקת הפריט נכשלה' : 'Failed to delete item');
    } finally {
      setDeletingId(null);
      setDeleteType(null);
    }
  };

  const filteredEntities = entities.filter((entity) => 
    decodeText(entity.title)?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    decodeText(entity.slug)?.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
        <div className={styles.loadingContainer}>
          <div className={styles.loadingSpinner}></div>
          <span className={styles.loadingText}>{t('common.loading')}</span>
        </div>
      ) : filteredEntities.length === 0 ? (
        <div className={styles.emptyState}>
          <FileText className={styles.emptyIcon} />
          <h3 className={styles.emptyTitle}>{t(`entities.${entityType}.empty`)}</h3>
          <p className={styles.emptyDescription}>{t(`entities.${entityType}.emptyDescription`)}</p>
        </div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t('common.title')}</th>
              <th>{t('entities.status')}</th>
              <th>{t('common.date')}</th>
              <th>{t('entities.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntities.map((entity) => (
              <tr key={entity.id || entity.slug}>
                <td>
                  <div className={styles.entityTitle}>{decodeText(entity.title)}</div>
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
                      title={locale === 'he' ? 'הסר מהפלטפורמה' : 'Remove from platform'}
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
                        title={locale === 'he' ? 'מחק מהאתר' : 'Delete from website'}
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
      )}
    </div>
  );
}
