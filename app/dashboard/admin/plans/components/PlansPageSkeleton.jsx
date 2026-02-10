'use client';

import styles from '../../admin.module.css';

export default function PlansPageSkeleton() {
  return (
    <div className={styles.adminPage}>
      {/* Header Skeleton */}
      <div className={styles.adminHeader}>
        <div className={`${styles.skeleton} ${styles.skeletonTitle}`} />
        <div className={`${styles.skeleton} ${styles.skeletonSubtitle}`} />
      </div>

      {/* Stats Grid Skeleton */}
      <div className={styles.statsGrid}>
        {[1, 2, 3].map((i) => (
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
          <div className={`${styles.skeleton} ${styles.skeletonButton}`} style={{ width: '100px' }} />
        </div>
        <div className={styles.toolbarRight}>
          <div className={`${styles.skeleton} ${styles.skeletonButton}`} />
          <div className={`${styles.skeleton} ${styles.skeletonButton}`} style={{ width: '120px' }} />
        </div>
      </div>

      {/* Table Skeleton */}
      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead className={styles.tableHeader}>
            <tr>
              <th><div className={`${styles.skeleton} ${styles.skeletonHeaderCell}`} /></th>
              <th><div className={`${styles.skeleton} ${styles.skeletonHeaderCell}`} /></th>
              <th><div className={`${styles.skeleton} ${styles.skeletonHeaderCell}`} /></th>
              <th><div className={`${styles.skeleton} ${styles.skeletonHeaderCell}`} /></th>
              <th><div className={`${styles.skeleton} ${styles.skeletonHeaderCell}`} /></th>
              <th><div className={`${styles.skeleton} ${styles.skeletonHeaderCell}`} /></th>
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <tr key={i}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div className={`${styles.skeleton}`} style={{ width: '40px', height: '40px', borderRadius: '50%' }} />
                    <div>
                      <div className={`${styles.skeleton}`} style={{ width: '140px', height: '14px', marginBottom: '6px' }} />
                      <div className={`${styles.skeleton}`} style={{ width: '100px', height: '12px' }} />
                    </div>
                  </div>
                </td>
                <td>
                  <div className={`${styles.skeleton}`} style={{ width: '80px', height: '14px', marginBottom: '4px' }} />
                  <div className={`${styles.skeleton}`} style={{ width: '60px', height: '12px' }} />
                </td>
                <td>
                  <div className={`${styles.skeleton}`} style={{ width: '80px', height: '14px' }} />
                </td>
                <td>
                  <div className={`${styles.skeleton}`} style={{ width: '40px', height: '14px' }} />
                </td>
                <td>
                  <div className={`${styles.skeleton}`} style={{ width: '60px', height: '22px', borderRadius: '4px' }} />
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <div className={`${styles.skeleton} ${styles.skeletonActionButton}`} />
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
