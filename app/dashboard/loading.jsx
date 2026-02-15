import {
  PageHeaderSkeleton,
  StatsGridSkeleton,
  DashboardCardSkeleton,
  Skeleton,
} from './components';
import styles from './page.module.css';

export default function DashboardLoading() {
  return (
    <>
      <PageHeaderSkeleton />

      <StatsGridSkeleton count={4} />

      <div className={styles.mainGrid}>
        <div className={styles.startColumn}>
          <DashboardCardSkeleton hasTitle>
            <Skeleton width="100%" height="220px" borderRadius="lg" />
          </DashboardCardSkeleton>
        </div>

        <div className={styles.endColumn}>
          <DashboardCardSkeleton hasTitle>
            <Skeleton width="100%" height="220px" borderRadius="lg" />
          </DashboardCardSkeleton>
        </div>
      </div>
    </>
  );
}
