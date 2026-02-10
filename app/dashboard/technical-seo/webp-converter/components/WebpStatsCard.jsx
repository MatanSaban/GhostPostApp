'use client';

import { Settings2, Loader2, Play, Pause, RefreshCw } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from '../../technical-seo.module.css';

export default function WebpStatsCard({
  autoConvert,
  isLoadingSettings,
  isSavingSettings,
  onToggleAutoConvert,
  stats,
  onRefresh,
}) {
  const { t } = useLocale();
  
  return (
    <>
      {/* Auto Convert Setting */}
      <div className={styles.settingsCard}>
        <div className={styles.settingRow}>
          <div className={styles.settingInfo}>
            <Settings2 className={styles.settingIcon} />
            <div>
              <h3 className={styles.settingTitle}>{t('tools.webp.autoConvert')}</h3>
              <p className={styles.settingDescription}>{t('tools.webp.autoConvertDesc')}</p>
            </div>
          </div>
          <button 
            className={`${styles.toggle} ${autoConvert ? styles.toggleActive : ''}`}
            onClick={onToggleAutoConvert}
            disabled={isLoadingSettings || isSavingSettings}
          >
            <span className={styles.toggleThumb}>
              {isSavingSettings ? (
                <Loader2 className={styles.toggleLoader} />
              ) : autoConvert ? (
                <Play className={styles.toggleIcon} />
              ) : (
                <Pause className={styles.toggleIcon} />
              )}
            </span>
          </button>
        </div>
      </div>
      
      {/* Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statValue}>
            {stats.loading ? <Loader2 className={styles.statLoader} /> : stats.total}
          </span>
          <span className={styles.statLabel}>{t('tools.webp.totalImages')}</span>
        </div>
        <div className={`${styles.statCard} ${styles.statSuccess}`}>
          <span className={styles.statValue}>
            {stats.loading ? <Loader2 className={styles.statLoader} /> : stats.webp}
          </span>
          <span className={styles.statLabel}>{t('tools.webp.webpImages')}</span>
        </div>
        <div className={`${styles.statCard} ${styles.statWarning}`}>
          <span className={styles.statValue}>
            {stats.loading ? <Loader2 className={styles.statLoader} /> : stats.nonWebp}
          </span>
          <span className={styles.statLabel}>{t('tools.webp.nonWebpImages')}</span>
        </div>
      </div>
      
      {/* Refresh Stats Button */}
      <button 
        className={styles.refreshButton}
        onClick={onRefresh}
        disabled={stats.loading}
      >
        <RefreshCw className={stats.loading ? styles.spinning : ''} />
        {t('tools.webp.refreshStats')}
      </button>
    </>
  );
}
