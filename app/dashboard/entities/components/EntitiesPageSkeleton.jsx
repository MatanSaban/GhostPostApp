'use client';

import styles from '../entities.module.css';
import { Skeleton } from '../../components/Skeleton';

export function EntitiesPageSkeleton() {
  return (
    <div className={styles.entitiesContainer}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <Skeleton width="180px" height="28px" style={{ marginBottom: '0.5rem' }} />
        <Skeleton width="300px" height="16px" />
      </div>

      {/* Integration Setup Card Skeleton */}
      <div className={styles.setupCard} style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <Skeleton width="150px" height="20px" />
          <Skeleton width="80px" height="24px" style={{ borderRadius: '12px' }} />
        </div>
        <Skeleton width="100%" height="14px" style={{ marginBottom: '0.5rem' }} />
        <Skeleton width="80%" height="14px" style={{ marginBottom: '1rem' }} />
        <Skeleton width="140px" height="36px" style={{ borderRadius: '6px' }} />
      </div>

      {/* Entity Types Discovery Skeleton */}
      <div className={styles.discoveryCard} style={{ marginBottom: '1.5rem' }}>
        <Skeleton width="180px" height="20px" style={{ marginBottom: '1rem' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div 
              key={i} 
              style={{ 
                padding: '1rem', 
                background: 'var(--muted)', 
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              <Skeleton width="100px" height="18px" />
              <Skeleton width="60px" height="14px" />
            </div>
          ))}
        </div>
        <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
          <Skeleton width="160px" height="36px" style={{ borderRadius: '6px' }} />
        </div>
      </div>

      {/* Sync Status Skeleton */}
      <div className={styles.syncCard} style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <Skeleton width="120px" height="18px" />
          <Skeleton width="80px" height="24px" style={{ borderRadius: '12px' }} />
        </div>
        <Skeleton width="100%" height="8px" style={{ borderRadius: '4px', marginBottom: '0.5rem' }} />
        <Skeleton width="200px" height="14px" />
      </div>

      {/* Enabled Types Skeleton */}
      <div className={styles.typesCard}>
        <Skeleton width="160px" height="20px" style={{ marginBottom: '1rem' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {[1, 2, 3].map(i => (
            <div 
              key={i} 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                padding: '0.75rem',
                background: 'var(--muted)',
                borderRadius: '8px',
              }}
            >
              <Skeleton width="120px" height="16px" />
              <Skeleton width="40px" height="20px" style={{ borderRadius: '10px' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
