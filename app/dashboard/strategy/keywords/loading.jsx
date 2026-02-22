import {
  PageHeaderSkeleton,
} from '../../components';
import { Skeleton } from '../../components/Skeleton';
import styles from './page.module.css';

export default function KeywordsLoading() {
  return (
    <>
      <PageHeaderSkeleton />

      {/* Stat Cards */}
      <div className={styles.statsRow}>
        {['purple', 'blue', 'green', 'orange'].map((color) => (
          <div key={color} className={styles.statCard}>
            <div className={styles.statCardGlow} />
            <div className={styles.statCardContent}>
              <div className={styles.statHeader}>
                <Skeleton width="2.25rem" height="2.25rem" borderRadius="lg" />
              </div>
              <Skeleton width="60%" height="0.75rem" borderRadius="sm" />
              <Skeleton width="3rem" height="1.4rem" borderRadius="sm" />
            </div>
          </div>
        ))}
      </div>

      {/* Add Button */}
      <Skeleton width="9rem" height="2.25rem" borderRadius="md" className={styles.skeletonAddBtn} />

      {/* Filter Tabs */}
      <div className={styles.filterTabs}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} width={`${60 + i * 8}px`} height="2rem" borderRadius="full" />
        ))}
      </div>

      {/* Table */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <Skeleton width="10rem" height="1.25rem" borderRadius="sm" />
            <Skeleton width="6rem" height="0.8rem" borderRadius="sm" className={styles.skeletonSubtitle} />
          </div>
        </div>
        <div className={styles.tableHeader}>
          <Skeleton width="4rem" height="0.75rem" borderRadius="sm" />
          <Skeleton width="3rem" height="0.75rem" borderRadius="sm" />
          <Skeleton width="3.5rem" height="0.75rem" borderRadius="sm" />
          <Skeleton width="3.5rem" height="0.75rem" borderRadius="sm" />
          <Skeleton width="3rem" height="0.75rem" borderRadius="sm" />
        </div>
        <div className={styles.tableBody}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={styles.tableRow}>
              <div className={styles.keywordCell}>
                <Skeleton width={`${55 + (i % 3) * 15}%`} height="0.875rem" borderRadius="sm" />
              </div>
              <div className={`${styles.cell} ${styles.positionCell}`}>
                <Skeleton width="2.5rem" height="1.5rem" borderRadius="full" />
              </div>
              <div className={`${styles.cell} ${styles.volumeCell}`}>
                <Skeleton width="3rem" height="0.875rem" borderRadius="sm" />
              </div>
              <div className={`${styles.cell} ${styles.difficultyCell}`}>
                <Skeleton width="4rem" height="1.4rem" borderRadius="full" />
              </div>
              <div className={`${styles.cell} ${styles.statusCell}`}>
                <Skeleton width="4.5rem" height="1.4rem" borderRadius="full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
