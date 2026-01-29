'use client';

import { useEffect } from 'react';
import styles from './dashboard.module.css';

export default function DashboardError({ error, reset }) {
  useEffect(() => {
    console.error('Dashboard error:', error);
  }, [error]);

  return (
    <div className={styles.errorContainer} style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '50vh',
      gap: '1rem',
      padding: '2rem',
    }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Something went wrong!</h2>
      <p style={{ color: 'var(--muted-foreground)' }}>
        {error?.message || 'An unexpected error occurred'}
      </p>
      <button
        onClick={() => reset()}
        style={{
          padding: '0.75rem 1.5rem',
          background: 'var(--gradient-primary)',
          color: 'white',
          border: 'none',
          borderRadius: 'var(--radius-lg)',
          cursor: 'pointer',
          fontSize: '1rem',
          fontWeight: 500,
        }}
      >
        Try again
      </button>
    </div>
  );
}
