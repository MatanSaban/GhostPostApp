import {
  PageHeaderSkeleton,
  Skeleton,
} from '../components';
import styles from './technical-seo.module.css';

export default function TechnicalSeoLoading() {
  return (
    <>
      <PageHeaderSkeleton />

      <div className={styles.toolsGrid}>
        {[1, 2, 3].map((i) => (
          <div key={i} className={styles.toolOverviewCard}>
            <div className={styles.toolOverviewHeader}>
              <Skeleton width="3rem" height="3rem" borderRadius="lg" />
              <Skeleton width="60%" height="1.25rem" borderRadius="md" />
            </div>
            <div style={{ marginTop: '0.5rem' }}>
              <Skeleton width="100%" height="0.875rem" borderRadius="md" />
              <Skeleton width="75%" height="0.875rem" borderRadius="md" />
            </div>
            <div style={{ marginTop: 'auto', paddingTop: '1.25rem' }}>
              <Skeleton width="8rem" height="2.25rem" borderRadius="md" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
