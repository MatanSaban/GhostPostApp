'use client';

import { useLocale } from '@/app/context/locale-context';
import styles from './shared.module.css';

/**
 * Reusable loading state component for dashboard pages
 * 
 * @param {string} message - Optional custom loading message (defaults to t('common.loading'))
 * @param {string} size - Size variant: 'small' | 'medium' | 'large' (default: 'medium')
 */
export function LoadingState({ message, size = 'medium' }) {
  const { t } = useLocale();

  return (
    <div className={`${styles.loadingState} ${styles[size]}`}>
      <div className={styles.spinner} />
      <p>{message || t('common.loading')}</p>
    </div>
  );
}
