'use client';

import { StatsCard } from './StatsCard';
import styles from './shared.module.css';

/**
 * Reusable stats grid component for displaying multiple StatsCards
 * 
 * @param {Array} stats - Array of stat objects with iconName, value, label, trend, trendValue, color
 * @param {number} columns - Number of columns (2, 3, or 4, default: 4)
 * @param {boolean} loading - Show skeleton placeholders instead of real data
 */
export function StatsGrid({ stats, columns = 4, loading = false }) {
  const columnClass = columns === 2 ? styles.statsGridCols2 
    : columns === 3 ? styles.statsGridCols3 
    : styles.statsGridCols4;

  if (loading) {
    return (
      <div className={`${styles.statsGrid} ${columnClass}`}>
        {Array.from({ length: stats?.length || columns }).map((_, index) => (
          <div key={index} className={styles.statsCardSkeleton}>
            <div className={styles.skeletonHeader}>
              <div className={styles.skeletonIcon} />
            </div>
            <div className={styles.skeletonValue} />
            <div className={styles.skeletonLabel} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`${styles.statsGrid} ${columnClass}`}>
      {stats.map((stat, index) => (
        <StatsCard
          key={index}
          iconName={stat.iconName}
          value={stat.value}
          label={stat.label}
          trend={stat.trend}
          trendValue={stat.trendValue}
          color={stat.color}
        />
      ))}
    </div>
  );
}
