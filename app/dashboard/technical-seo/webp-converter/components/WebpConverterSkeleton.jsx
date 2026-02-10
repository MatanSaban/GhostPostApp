'use client';

import styles from '../../technical-seo.module.css';

export default function WebpConverterSkeleton() {
  return (
    <div className={styles.container}>
      {/* WebP Converter Card Skeleton */}
      <div className={styles.toolCard}>
        <div className={styles.toolHeader}>
          <div className={`${styles.skeleton} ${styles.skeletonIcon}`} />
          <div className={styles.toolInfo}>
            <div className={`${styles.skeleton} ${styles.skeletonTitle}`} />
            <div className={`${styles.skeleton} ${styles.skeletonText}`} />
          </div>
        </div>
        
        {/* Settings Skeleton */}
        <div className={styles.settingsCard}>
          <div className={styles.settingRow}>
            <div className={styles.settingInfo}>
              <div className={`${styles.skeleton} ${styles.skeletonSettingIcon}`} />
              <div>
                <div className={`${styles.skeleton} ${styles.skeletonSettingTitle}`} />
                <div className={`${styles.skeleton} ${styles.skeletonSettingDesc}`} />
              </div>
            </div>
            <div className={`${styles.skeleton} ${styles.skeletonToggle}`} />
          </div>
        </div>
        
        {/* Stats Grid Skeleton */}
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={`${styles.skeleton} ${styles.skeletonStatValue}`} />
            <div className={`${styles.skeleton} ${styles.skeletonStatLabel}`} />
          </div>
          <div className={`${styles.statCard} ${styles.statSuccess}`}>
            <div className={`${styles.skeleton} ${styles.skeletonStatValue}`} />
            <div className={`${styles.skeleton} ${styles.skeletonStatLabel}`} />
          </div>
          <div className={`${styles.statCard} ${styles.statWarning}`}>
            <div className={`${styles.skeleton} ${styles.skeletonStatValue}`} />
            <div className={`${styles.skeleton} ${styles.skeletonStatLabel}`} />
          </div>
        </div>
        
        {/* Refresh Button Skeleton */}
        <div className={`${styles.skeleton} ${styles.skeletonRefreshButton}`} />
        
        {/* Action Button Skeleton */}
        <div className={styles.actionSection}>
          <div className={`${styles.skeleton} ${styles.skeletonConvertButton}`} />
        </div>
      </div>
      
      {/* AI Optimizer Card Skeleton */}
      <div className={styles.toolCard}>
        <div className={styles.toolHeader}>
          <div className={`${styles.skeleton} ${styles.skeletonIcon} ${styles.skeletonIconAi}`} />
          <div className={styles.toolInfo}>
            <div className={`${styles.skeleton} ${styles.skeletonTitle}`} />
            <div className={`${styles.skeleton} ${styles.skeletonText}`} />
          </div>
        </div>
        
        {/* AI Settings Skeleton */}
        <div className={styles.aiSettings}>
          <div className={styles.settingRow}>
            <div className={styles.settingInfo}>
              <div className={`${styles.skeleton} ${styles.skeletonSettingIcon}`} />
              <div>
                <div className={`${styles.skeleton} ${styles.skeletonSettingTitle}`} />
                <div className={`${styles.skeleton} ${styles.skeletonSettingDesc}`} />
              </div>
            </div>
            <div className={`${styles.skeleton} ${styles.skeletonToggle}`} />
          </div>
        </div>
        
        {/* Action Button Skeleton */}
        <div className={styles.actionSection}>
          <div className={`${styles.skeleton} ${styles.skeletonAiButton}`} />
        </div>
      </div>
    </div>
  );
}
