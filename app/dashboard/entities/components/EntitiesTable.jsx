'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Search, 
  RefreshCw, 
  ExternalLink, 
  Edit, 
  Trash2,
  FileText,
  StopCircle,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from '../entities.module.css';

export function EntitiesTable({ 
  entities = [], 
  entityType,
  entityTypeName,
  onSync,
  onStopSync,
  isLoading = false,
  isSyncing = false,
  lastSyncDate = null,
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredEntities = entities.filter((entity) => 
    entity.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    entity.slug?.toLowerCase().includes(searchQuery.toLowerCase())
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
                  <div className={styles.entityTitle}>{entity.title}</div>
                  <div className={styles.entitySlug}>{entity.slug}</div>
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
                    <button className={`${styles.actionButton} ${styles.delete}`}>
                      <Trash2 />
                    </button>
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
