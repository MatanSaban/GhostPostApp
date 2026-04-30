'use client';

import { useLocale } from '@/app/context/locale-context';
import { Skeleton } from '@/app/dashboard/components';
import styles from '../../admin.module.css';

export default function PlansStats({ stats, isLoading = false }) {
  const { t } = useLocale();

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className={styles.statsGrid}>
      <div className={styles.statCard}>
        <div className={styles.statLabel}>{t('admin.stats.totalPlans')}</div>
        {isLoading ? <Skeleton width="3rem" height="1.5rem" /> : <div className={styles.statValue}>{stats.totalPlans}</div>}
      </div>
      <div className={styles.statCard}>
        <div className={styles.statLabel}>{t('admin.stats.totalSubscribers')}</div>
        {isLoading ? <Skeleton width="3rem" height="1.5rem" /> : <div className={styles.statValue}>{stats.totalSubscribers}</div>}
      </div>
      <div className={styles.statCard}>
        <div className={styles.statLabel}>{t('admin.stats.avgPrice')}</div>
        {isLoading ? <Skeleton width="4rem" height="1.5rem" /> : <div className={styles.statValue}>{formatCurrency(stats.avgPrice)}</div>}
      </div>
    </div>
  );
}
