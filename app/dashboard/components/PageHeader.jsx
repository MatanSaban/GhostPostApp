'use client';

import styles from './shared.module.css';

/**
 * Reusable page header component for dashboard pages
 * 
 * @param {string} title - The main page title
 * @param {string} subtitle - Optional subtitle/description
 * @param {React.ReactNode} children - Optional action buttons or other elements
 */
export function PageHeader({ title, subtitle, children, dataOnboarding }) {
  return (
    <div className={styles.pageHeader} data-onboarding={dataOnboarding}>
      <div className={styles.headerContent}>
        <h1 className={styles.pageTitle}>{title}</h1>
        {subtitle && <p className={styles.pageSubtitle}>{subtitle}</p>}
      </div>
      {children && <div className={styles.headerActions}>{children}</div>}
    </div>
  );
}
