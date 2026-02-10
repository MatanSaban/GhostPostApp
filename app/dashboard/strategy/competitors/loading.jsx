import styles from './competitors.module.css';
import sharedStyles from '../../components/shared.module.css';

export default function CompetitorsLoading() {
  return (
    <div className={styles.skeletonPage}>
      {/* Skeleton Header */}
      <div className={styles.skeletonHeader}>
        <div className={styles.skeletonHeaderLeft}>
          <div className={styles.skeletonText} style={{ width: '220px', height: '24px' }} />
          <div className={styles.skeletonText} style={{ width: '320px', height: '14px' }} />
        </div>
        <div className={styles.skeletonHeaderActions}>
          <div className={styles.skeletonButton} style={{ width: '160px' }} />
          <div className={styles.skeletonButton} style={{ width: '140px' }} />
        </div>
      </div>

      {/* Skeleton Stats — uses the same StatsGrid skeleton styles */}
      <div className={`${sharedStyles.statsGrid} ${sharedStyles.statsGridCols3}`}>
        {[1, 2, 3].map((i) => (
          <div key={i} className={sharedStyles.statsCardSkeleton}>
            <div className={sharedStyles.skeletonHeader}>
              <div className={sharedStyles.skeletonIcon} />
            </div>
            <div className={sharedStyles.skeletonValue} />
            <div className={sharedStyles.skeletonLabel} />
          </div>
        ))}
      </div>

      {/* Skeleton View Toggle */}
      <div className={styles.skeletonViewToggle}>
        <div className={styles.skeletonPill} />
        <div className={styles.skeletonPill} />
      </div>

      {/* Skeleton Table */}
      <div className={styles.skeletonTableWrapper}>
        <table className={styles.skeletonTable}>
          <thead>
            <tr>
              {['35%', '12%', '12%', '12%', '10%', '10%', '9%'].map((w, i) => (
                <th key={i}><div className={styles.skeletonText} style={{ width: '60%', height: '12px' }} /></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3].map((i) => (
              <tr key={i}>
                <td>
                  <div className={styles.skeletonCompetitorInfo}>
                    <div className={styles.skeletonAvatar} />
                    <div className={styles.skeletonTextGroup}>
                      <div className={styles.skeletonText} style={{ width: '120px' }} />
                      <div className={styles.skeletonText} style={{ width: '160px', height: '10px' }} />
                    </div>
                  </div>
                </td>
                <td><div className={styles.skeletonBadge} /></td>
                <td><div className={styles.skeletonText} style={{ width: '50px' }} /></td>
                <td><div className={styles.skeletonText} style={{ width: '60px' }} /></td>
                <td><div className={styles.skeletonText} style={{ width: '30px' }} /></td>
                <td><div className={styles.skeletonText} style={{ width: '45px' }} /></td>
                <td>
                  <div className={styles.skeletonActions}>
                    <div className={styles.skeletonActionBtn} />
                    <div className={styles.skeletonActionBtn} />
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
