import { PageHeaderSkeleton, StatsGridSkeleton, ContentGridSkeleton } from '@/app/dashboard/components';
import styles from './sitemaps.module.css';

export default function Loading() {
  return (
    <div className={styles.container}>
      <PageHeaderSkeleton hasActions />
      <StatsGridSkeleton count={4} />
      <ContentGridSkeleton count={4} columns={2} />
    </div>
  );
}
