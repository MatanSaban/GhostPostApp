import { Skeleton } from '@/app/dashboard/components';
import styles from '../page.module.css';

export default function Loading() {
  return (
    <>
      <div className={styles.pageHeader}>
        <Skeleton width="200px" height="1.75rem" borderRadius="md" />
      </div>
      <div className={styles.pagePlaceholder}>
        <Skeleton width="48px" height="48px" borderRadius="md" />
        <Skeleton width="180px" height="1.25rem" borderRadius="md" />
        <Skeleton width="300px" height="1rem" borderRadius="md" />
      </div>
    </>
  );
}
