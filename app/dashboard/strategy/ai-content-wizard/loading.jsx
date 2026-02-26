import { Skeleton } from '../../components';
import styles from './page.module.css';

export default function AIContentWizardLoading() {
  return (
    <div className={styles.container}>
      {/* Page Header */}
      <div className={styles.pageHeader}>
        <div className={styles.headerContent}>
          <Skeleton width="14rem" height="1.8125rem" borderRadius="md" />
          <div style={{ marginTop: '0.25rem' }}>
            <Skeleton width="22rem" height="0.9rem" borderRadius="md" />
          </div>
        </div>
      </div>

      {/* Progress Steps */}
      <div className={styles.progressCard}>
        <div className={styles.stepsWrapper}>
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className={styles.stepGroup}>
              <div className={styles.stepItem}>
                <div className={`${styles.stepCircle} ${i === 0 ? styles.active : styles.pending}`}>
                  <Skeleton width="1rem" height="1rem" borderRadius="sm" />
                </div>
                <Skeleton width="3.5rem" height="0.6rem" borderRadius="md" />
              </div>
              {i < 8 && (
                <div className={styles.stepConnector} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Content Card */}
      <div className={styles.contentCard}>
        <div className={styles.stepContent}>
          {/* Step Header */}
          <div className={styles.stepHeader}>
            <div className={styles.stepIconWrapper}>
              <Skeleton width="1.25rem" height="1.25rem" borderRadius="sm" />
            </div>
            <div className={styles.stepInfo}>
              <Skeleton width="10rem" height="1.25rem" borderRadius="md" />
              <div style={{ marginTop: '0.25rem' }}>
                <Skeleton width="20rem" height="0.875rem" borderRadius="md" />
              </div>
            </div>
          </div>

          {/* Campaign Toggle */}
          <div className={styles.campaignToggle}>
            <Skeleton width="50%" height="2.25rem" borderRadius="sm" />
            <Skeleton width="50%" height="2.25rem" borderRadius="sm" />
          </div>

          {/* Campaign List (3 cards) */}
          <div className={styles.campaignList}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={styles.campaignCard} style={{ cursor: 'default' }}>
                <Skeleton width="0.75rem" height="0.75rem" borderRadius="full" />
                <div className={styles.campaignCardInfo}>
                  <Skeleton width="8rem" height="0.9rem" borderRadius="md" />
                  <div style={{ marginTop: '0.25rem' }}>
                    <Skeleton width="4rem" height="0.7rem" borderRadius="md" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className={styles.navigationButtons}>
        <Skeleton width="7.5rem" height="2.5rem" borderRadius="md" />
        <Skeleton width="7.5rem" height="2.5rem" borderRadius="md" />
      </div>
    </div>
  );
}
