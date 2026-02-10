'use client';

import styles from '../../admin.module.css';

export default function InterviewFlowSkeleton() {
  return (
    <div className={styles.adminPage}>
      {/* Header Skeleton */}
      <div className={styles.adminHeader}>
        <div className={`${styles.skeleton} ${styles.skeletonTitle}`} />
        <div className={`${styles.skeleton} ${styles.skeletonSubtitle}`} />
      </div>

      {/* Stats Grid Skeleton */}
      <div className={styles.statsGrid}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={styles.statCard}>
            <div className={`${styles.skeleton} ${styles.skeletonStatLabel}`} />
            <div className={`${styles.skeleton} ${styles.skeletonStatValue}`} />
          </div>
        ))}
      </div>

      {/* Toolbar Skeleton */}
      <div className={styles.adminToolbar}>
        <div className={styles.toolbarLeft}>
          <div className={`${styles.skeleton} ${styles.skeletonSearchInput}`} />
          <div className={`${styles.skeleton} ${styles.skeletonFilterSelect}`} />
          <div className={`${styles.skeleton} ${styles.skeletonFilterSelect}`} />
        </div>
        <div className={styles.toolbarRight}>
          <div className={`${styles.skeleton} ${styles.skeletonButton}`} />
          <div className={`${styles.skeleton} ${styles.skeletonButton}`} />
        </div>
      </div>

      {/* Table Skeleton */}
      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead className={styles.tableHeader}>
            <tr>
              <th style={{ width: '40px' }}><div className={`${styles.skeleton} ${styles.skeletonHeaderCell}`} /></th>
              <th style={{ width: '40px' }}><div className={`${styles.skeleton} ${styles.skeletonHeaderCell}`} /></th>
              <th><div className={`${styles.skeleton} ${styles.skeletonHeaderCell}`} /></th>
              <th style={{ width: '150px' }}><div className={`${styles.skeleton} ${styles.skeletonHeaderCell}`} /></th>
              <th style={{ width: '120px' }}><div className={`${styles.skeleton} ${styles.skeletonHeaderCell}`} /></th>
              <th style={{ width: '100px' }}><div className={`${styles.skeleton} ${styles.skeletonHeaderCell}`} /></th>
              <th style={{ width: '140px' }}><div className={`${styles.skeleton} ${styles.skeletonHeaderCell}`} /></th>
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <tr key={i}>
                <td><div className={`${styles.skeleton} ${styles.skeletonMoveButtons}`} /></td>
                <td><div className={`${styles.skeleton} ${styles.skeletonOrder}`} /></td>
                <td>
                  <div className={`${styles.skeleton} ${styles.skeletonKeyName}`} />
                  <div className={`${styles.skeleton} ${styles.skeletonKeySubtext}`} style={{ marginTop: '4px' }} />
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div className={`${styles.skeleton} ${styles.skeletonTypeIcon}`} />
                    <div className={`${styles.skeleton} ${styles.skeletonTypeLabel}`} />
                  </div>
                </td>
                <td><div className={`${styles.skeleton} ${styles.skeletonBadge}`} /></td>
                <td><div className={`${styles.skeleton} ${styles.skeletonStatusButton}`} /></td>
                <td>
                  <div className={styles.actionButtons}>
                    <div className={`${styles.skeleton} ${styles.skeletonActionButton}`} />
                    <div className={`${styles.skeleton} ${styles.skeletonActionButton}`} />
                    <div className={`${styles.skeleton} ${styles.skeletonActionButton}`} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
