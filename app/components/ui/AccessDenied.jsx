'use client';

import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from './AccessDenied.module.css';

/**
 * AccessDenied component - displays when user doesn't have permission to view a page
 */
export function AccessDenied({ 
  message,
  description,
  showBackButton = true,
}) {
  const router = useRouter();
  const { t } = useLocale();

  const displayMessage = message || t('errors.permissionDenied');
  const displayDescription = description || t('errors.permissionDeniedDescription');

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.iconWrapper}>
          <Lock className={styles.icon} />
        </div>
        <h1 className={styles.title}>{displayMessage}</h1>
        <p className={styles.description}>{displayDescription}</p>
        {showBackButton && (
          <button
            className={styles.button}
            onClick={() => router.push('/dashboard')}
          >
            {t('errors.goToDashboard')}
          </button>
        )}
      </div>
    </div>
  );
}

export default AccessDenied;
