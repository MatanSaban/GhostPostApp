'use client';

import { Skeleton } from '@/app/dashboard/components';
import styles from './media.module.css';

/**
 * Suspense fallback for /dashboard/entities/media that mirrors the full
 * layout the page component shows during its in-page loading state —
 * header, top pagination bar, and grid — so there is no visible "pop-in"
 * when the fallback is replaced by the real page. Without this file the
 * router falls back to /dashboard/entities/loading.jsx, whose layout is
 * for a different page entirely.
 */
export default function Loading() {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Skeleton width="160px" height="1.75rem" />
          <Skeleton width="80px" height="1.5rem" borderRadius="full" />
        </div>
        <div className={styles.headerActions}>
          <Skeleton width="240px" height="36px" />
          <Skeleton width="36px" height="36px" />
          <Skeleton width="160px" height="36px" />
          <Skeleton width="120px" height="36px" />
        </div>
      </div>

      <div className={styles.paginationTop}>
        <Skeleton width="120px" height="28px" />
      </div>

      <div className={styles.content}>
        <div className={styles.mediaGrid}>
          {Array.from({ length: 20 }).map((_, i) => (
            <Skeleton key={i} className={styles.skeletonItem} height="auto" />
          ))}
        </div>
      </div>
    </div>
  );
}
