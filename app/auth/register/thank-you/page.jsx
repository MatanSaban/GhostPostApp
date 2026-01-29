import Link from 'next/link';
import { CheckCircle } from 'lucide-react';
import { HeaderActions } from '@/app/components/ui/header-actions';
import { ArrowIcon } from '@/app/components/ui/arrow-icon';
import { getTranslations } from '@/i18n/server';
import styles from '../../auth.module.css';

export default async function ThankYouPage() {
  const t = await getTranslations();

  return (
    <div className={styles.authContainer}>
      <div className={styles.themeToggleWrapper}>
        <HeaderActions />
      </div>
      
      <div className={`${styles.authCard} ${styles.thankYouCard}`}>
        <div className={styles.authGlow}></div>
        
        <div className={styles.successIcon}>
          <CheckCircle size={40} />
        </div>
        
        <h1 className={styles.thankYouTitle}>{t('auth.welcomeGhostPost')}</h1>
        
        <p className={styles.thankYouText}>
          {t('auth.accountCreatedSuccess')}
        </p>
        
        <Link href="/dashboard" className={styles.dashboardButton}>
          {t('nav.dashboard')}
          <ArrowIcon size={20} />
        </Link>
      </div>
    </div>
  );
}
