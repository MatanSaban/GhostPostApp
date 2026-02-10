'use client';

import * as LucideIcons from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from './shared.module.css';

/**
 * Reusable empty state component for when there's no data to display
 * 
 * @param {string} iconName - Name of the Lucide icon to display
 * @param {string} title - Main message
 * @param {string} description - Optional description text
 * @param {React.ReactNode} children - Optional action buttons
 */
export function EmptyState({ iconName = 'Inbox', title, description, children }) {
  const { t } = useLocale();
  const Icon = LucideIcons[iconName] || LucideIcons.Inbox;

  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyStateIcon}>
        <Icon size={48} />
      </div>
      <h3 className={styles.emptyStateTitle}>{title || t('common.noData')}</h3>
      {description && <p className={styles.emptyStateDescription}>{description}</p>}
      {children && <div className={styles.emptyStateActions}>{children}</div>}
    </div>
  );
}
