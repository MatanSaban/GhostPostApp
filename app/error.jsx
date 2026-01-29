'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error('Global error:', error);
  }, [error]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      gap: '1rem',
      padding: '2rem',
      fontFamily: 'var(--font-primary)',
    }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Something went wrong!</h2>
      <p style={{ color: '#6b7280' }}>
        {error?.message || 'An unexpected error occurred'}
      </p>
      <button
        onClick={() => reset()}
        style={{
          padding: '0.75rem 1.5rem',
          background: 'linear-gradient(135deg, #7B2CBF 0%, #4361EE 100%)',
          color: 'white',
          border: 'none',
          borderRadius: '0.75rem',
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
