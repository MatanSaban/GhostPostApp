'use client';

import { Clock, Loader2, Trash2 } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from '../../technical-seo.module.css';

export default function QueueStatusCard({ queueStatus, onClearQueue }) {
  const { t } = useLocale();
  
  if (!queueStatus || (queueStatus.pending === 0 && !queueStatus.is_processing)) {
    // Show completed queue if there are results
    if (queueStatus && (queueStatus.completed > 0 || queueStatus.failed > 0)) {
      return (
        <div className={styles.queueStatus}>
          <div className={styles.queueStatusHeader}>
            <Clock className={styles.queueStatusIcon} />
            <span className={styles.queueStatusTitle}>{t('tools.webp.queueStatus')}</span>
          </div>
          <div className={styles.queueStatusContent}>
            <div className={styles.queueStatusItem}>
              <span className={styles.queueStatusLabel}>{t('tools.webp.completed')}</span>
              <span className={`${styles.queueStatusValue} ${styles.queueStatusSuccess}`}>{queueStatus.completed}</span>
            </div>
            {queueStatus.failed > 0 && (
              <div className={styles.queueStatusItem}>
                <span className={styles.queueStatusLabel}>{t('tools.webp.failed')}</span>
                <span className={`${styles.queueStatusValue} ${styles.queueStatusError}`}>{queueStatus.failed}</span>
              </div>
            )}
          </div>
          <button 
            className={styles.clearQueueButton}
            onClick={onClearQueue}
          >
            <Trash2 />
            {t('tools.webp.clearQueue')}
          </button>
        </div>
      );
    }
    return null;
  }
  
  return (
    <div className={styles.queueStatus}>
      <div className={styles.queueStatusHeader}>
        <Clock className={styles.queueStatusIcon} />
        <span className={styles.queueStatusTitle}>{t('tools.webp.queueStatus')}</span>
      </div>
      <div className={styles.queueStatusContent}>
        <div className={styles.queueStatusItem}>
          <span className={styles.queueStatusLabel}>{t('tools.webp.pending')}</span>
          <span className={styles.queueStatusValue}>{queueStatus.pending}</span>
        </div>
        <div className={styles.queueStatusItem}>
          <span className={styles.queueStatusLabel}>{t('tools.webp.completed')}</span>
          <span className={`${styles.queueStatusValue} ${styles.queueStatusSuccess}`}>{queueStatus.completed}</span>
        </div>
        {queueStatus.failed > 0 && (
          <div className={styles.queueStatusItem}>
            <span className={styles.queueStatusLabel}>{t('tools.webp.failed')}</span>
            <span className={`${styles.queueStatusValue} ${styles.queueStatusError}`}>{queueStatus.failed}</span>
          </div>
        )}
        {queueStatus.is_processing && (
          <div className={styles.queueStatusProcessing}>
            <Loader2 className={styles.spinning} />
            <span>{t('tools.webp.processing')}</span>
          </div>
        )}
      </div>
    </div>
  );
}
