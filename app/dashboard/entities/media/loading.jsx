import { PageHeaderSkeleton, ContentGridSkeleton } from '@/app/dashboard/components';
import styles from './media.module.css';

export default function Loading() {
  return (
    <div className={styles.container}>
      <PageHeaderSkeleton />
      <ContentGridSkeleton count={12} columns={4} />
    </div>
  );
}
