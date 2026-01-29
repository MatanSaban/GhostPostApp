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
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from '../entities.module.css';

export function EntitiesTable({ 
  entities = [], 
  entityType,
  onSync,
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

  const getStatusClass = (status) => {
    switch (status?.toLowerCase()) {
      case 'published':
      case 'publish':
        return styles.published;
      case 'draft':
        return styles.draft;
      case 'archived':
        return styles.archived;
      default:
        return styles.published;
    }
  };

  const getStatusText = (status) => {
    switch (status?.toLowerCase()) {
      case 'published':
      case 'publish':
        return t('entities.published');
      case 'draft':
        return t('entities.draft');
      case 'archived':
        return t('entities.archived');
      default:
        return t('entities.published');
    }
  };

  return (
    <div className={styles.tableCard}>
      <div className={styles.tableHeader}>
        <div>
          <h2 className={styles.tableTitle}>
            {t(`entities.${entityType}.title`)}
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
          <button 
            className={`${styles.syncButton} ${isSyncing ? styles.syncButtonLoading : ''}`}
            onClick={onSync}
            disabled={isSyncing}
          >
            <RefreshCw />
            <span>{isSyncing ? t('entities.syncing') : t('entities.sync')}</span>
          </button>
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
