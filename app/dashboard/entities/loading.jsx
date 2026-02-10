'use client';

import { Skeleton } from '@/app/dashboard/components';
import styles from './entities.module.css';

export default function Loading() {
  return (
    <div className={styles.container}>
      {/* Header skeleton */}
      <div className={styles.pageHeader}>
        <div className={styles.headerContent}>
          <Skeleton width="200px" height="1.75rem" borderRadius="md" />
          <Skeleton width="300px" height="1rem" borderRadius="md" />
        </div>
      </div>

      {/* Setup Card skeleton */}
      <div className={styles.setupCard}>
        <div className={styles.setupHeader}>
          <Skeleton width="24px" height="24px" borderRadius="md" />
          <div style={{ flex: 1 }}>
            <Skeleton width="180px" height="1.125rem" borderRadius="md" />
            <Skeleton width="280px" height="0.875rem" borderRadius="md" />
          </div>
        </div>
        <div className={styles.siteInfo}>
          <Skeleton width="36px" height="36px" borderRadius="md" />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <Skeleton width="140px" height="1rem" borderRadius="md" />
            <Skeleton width="200px" height="0.75rem" borderRadius="md" />
          </div>
          <Skeleton width="80px" height="1.5rem" borderRadius="full" />
        </div>
        <Skeleton width="100%" height="2.5rem" borderRadius="md" />
      </div>

      {/* Plugin Card skeleton */}
      <div className={styles.setupCard}>
        <div className={styles.setupHeader}>
          <Skeleton width="24px" height="24px" borderRadius="md" />
          <div style={{ flex: 1 }}>
            <Skeleton width="160px" height="1.125rem" borderRadius="md" />
            <Skeleton width="260px" height="0.875rem" borderRadius="md" />
          </div>
        </div>
        <Skeleton width="100%" height="4rem" borderRadius="lg" />
      </div>

      {/* Entity Types List skeleton */}
      <div className={styles.enabledTypesCard}>
        <Skeleton width="200px" height="1.125rem" borderRadius="md" />
        <div className={styles.enabledTypesList}>
          {[1, 2, 3].map((i) => (
            <div key={i} className={styles.enabledTypeItem} style={{ pointerEvents: 'none' }}>
              <Skeleton width="20px" height="20px" borderRadius="md" />
              <Skeleton width="100px" height="0.875rem" borderRadius="md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
