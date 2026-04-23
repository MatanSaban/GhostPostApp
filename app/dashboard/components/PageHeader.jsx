'use client';

import { isValidElement } from 'react';
import styles from './shared.module.css';

/**
 * Reusable page header component for dashboard pages
 *
 * @param {string} title - The main page title
 * @param {string} subtitle - Optional subtitle/description
 * @param {React.ComponentType | React.ReactElement} icon - Optional lucide icon
 * @param {React.ReactNode} children - Optional action buttons
 */
export function PageHeader({ title, subtitle, icon, children, dataOnboarding }) {
  const IconNode = (() => {
    if (!icon) return null;
    if (isValidElement(icon)) return icon;
    const Icon = icon;
    return <Icon size={24} />;
  })();

  return (
    <div className={styles.pageHeader} data-onboarding={dataOnboarding}>
      <div className={styles.headerLeft}>
        {IconNode && <div className={styles.headerIcon}>{IconNode}</div>}
        <div className={styles.headerContent}>
          <h1 className={styles.pageTitle}>{title}</h1>
          {subtitle && <p className={styles.pageSubtitle}>{subtitle}</p>}
        </div>
      </div>
      {children && <div className={styles.headerActions}>{children}</div>}
    </div>
  );
}
