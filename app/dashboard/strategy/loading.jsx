'use client';

import { Skeleton } from '@/app/dashboard/components';
import styles from './strategy.module.css';

export default function Loading() {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Skeleton width="220px" height="1.75rem" borderRadius="md" />
        <Skeleton width="340px" height="1rem" borderRadius="md" />
      </div>
      
      <div className={styles.featuresGrid}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={styles.featureCard}>
            <div className={styles.featureHeader}>
              <Skeleton width="40px" height="40px" borderRadius="md" />
              <Skeleton width="120px" height="1.125rem" borderRadius="md" />
            </div>
            <Skeleton width="100%" height="2.5rem" borderRadius="md" />
            <Skeleton width="140px" height="2rem" borderRadius="md" />
          </div>
        ))}
      </div>
    </div>
  );
}
