'use client';

import { useLocale } from '@/app/context/locale-context';
import styles from '../entities.module.css';

export function SyncStatusCard({
  syncStatus,
  syncProgress,
  syncMessage,
  syncError,
  populatedInfo,
  isConnected,
  onPopulateEntities,
  onCrawlEntities,
  onStopSync,
}) {
  const { t } = useLocale();

  if (!syncStatus && !populatedInfo) {
    return null;
  }

  const getStatusBadge = () => {
    switch (syncStatus) {
      case 'SYNCING':
        return <span className={`${styles.statusBadge} ${styles.statusSyncing}`}>{t('entities.sync.syncing')}</span>;
      case 'COMPLETED':
        return <span className={`${styles.statusBadge} ${styles.statusCompleted}`}>{t('entities.sync.completed')}</span>;
      case 'ERROR':
        return <span className={`${styles.statusBadge} ${styles.statusError}`}>{t('entities.sync.error')}</span>;
      case 'CANCELLED':
        return <span className={`${styles.statusBadge} ${styles.statusCancelled}`}>{t('entities.sync.cancelled')}</span>;
      default:
        return null;
    }
  };

  return (
    <div className={styles.syncCard}>
      <div className={styles.syncHeader}>
        <h3>{t('entities.sync.title')}</h3>
        {getStatusBadge()}
      </div>

      {syncStatus === 'SYNCING' && (
        <div className={styles.syncProgress}>
          <div className={styles.progressBar}>
            <div 
              className={styles.progressFill} 
              style={{ width: `${syncProgress}%` }}
            />
          </div>
          <div className={styles.syncMeta}>
            <span className={styles.syncProgressText}>{syncProgress}%</span>
            {syncMessage && <span className={styles.syncMessage}>{syncMessage}</span>}
          </div>
          <button onClick={onStopSync} className={styles.stopButton}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="6" y="6" width="12" height="12" />
            </svg>
            {t('entities.sync.stop')}
          </button>
        </div>
      )}

      {syncStatus === 'COMPLETED' && populatedInfo && (
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
      )}

      {syncStatus === 'ERROR' && syncError && (
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
      )}

      {syncStatus === 'CANCELLED' && (
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
      )}

      {!syncStatus && populatedInfo && (
        <div className={styles.lastSyncInfo}>
          <p>{t('entities.sync.lastSync')}: {populatedInfo.totalEntities} {t('entities.items')}</p>
          <button 
            onClick={isConnected ? onPopulateEntities : onCrawlEntities} 
            className={styles.resyncButton}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
            {t('entities.sync.resync')}
          </button>
        </div>
      )}
    </div>
  );
}

export function SyncStatusCardSkeleton() {
  return (
    <div className={styles.syncCard}>
      <div className={styles.syncHeader}>
        <div className={styles.skeletonText} style={{ width: '120px', height: '18px' }} />
        <div className={styles.skeletonBadge} />
      </div>
      <div className={styles.syncProgress}>
        <div className={styles.progressBarSkeleton} />
        <div className={styles.skeletonText} style={{ width: '200px', height: '14px', marginTop: '0.5rem' }} />
      </div>
    </div>
  );
}
