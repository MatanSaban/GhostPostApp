import { PageHeaderSkeleton, StatsGridSkeleton, Skeleton } from '@/app/dashboard/components';
import styles from './site-audit.module.css';

export default function Loading() {
  return (
    <div className={styles.container}>
      <PageHeaderSkeleton hasActions />
      {/* Score card skeleton */}
      <Skeleton width="100%" height="120px" borderRadius="lg" />
      {/* Categories grid skeleton */}
      <div className={styles.categoriesGrid}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={styles.categoryCard}>
            <div className={styles.categoryHeader}>
              <Skeleton width="40px" height="40px" borderRadius="md" />
              <div style={{ flex: 1 }}>
                <Skeleton width="100px" height="1rem" borderRadius="md" />
                <Skeleton width="60px" height="0.875rem" borderRadius="md" />
              </div>
            </div>
            <Skeleton width="100%" height="2rem" borderRadius="md" />
          </div>
        ))}
      </div>
    </div>
  );
}
