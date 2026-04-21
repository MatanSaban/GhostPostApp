'use client';

import { useLocale } from '@/app/context/locale-context';
import styles from '../../admin.module.css';

export default function PlansStats({ stats }) {
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
        <div className={styles.statValue}>{stats.totalPlans}</div>
      </div>
      <div className={styles.statCard}>
        <div className={styles.statLabel}>{t('admin.stats.totalSubscribers')}</div>
        <div className={styles.statValue}>{stats.totalSubscribers}</div>
      </div>
      <div className={styles.statCard}>
        <div className={styles.statLabel}>{t('admin.stats.avgPrice')}</div>
        <div className={styles.statValue}>{formatCurrency(stats.avgPrice)}</div>
      </div>
    </div>
  );
}
