import Link from 'next/link';
import { LogIn } from 'lucide-react';
import { HeaderActions } from '@/app/components/ui/header-actions';
import { ArrowIcon } from '@/app/components/ui/arrow-icon';
import { getTranslations } from '@/i18n/server';
import styles from './page.module.css';

export default async function HomePage() {
  const t = await getTranslations();

  return (
    <div className={styles.homePage}>
      <div className={styles.themeToggleWrapper}>
        <HeaderActions />
      </div>

      <div className={styles.content}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>{t('brand.initial')}</div>
          <span className={styles.logoText}>{t('brand.name')}</span>
        </div>

        <p className={styles.tagline}>
          <span className={styles.highlight}>{t('homepage.taglineHighlight')}</span> {t('homepage.taglineText')}
        </p>

        <div className={styles.actions}>
          <Link href="/dashboard" className={styles.primaryButton}>
            {t('nav.dashboard')}
            <ArrowIcon className={styles.buttonIcon} />
          </Link>

          <Link href="/auth/login" className={styles.secondaryButton}>
            <LogIn className={styles.buttonIcon} />
            {t('auth.login')}
          </Link>
        </div>
      </div>

      <footer className={styles.footer}>
        {t('homepage.copyright')} <Link href="#" className={styles.footerLink}>{t('auth.privacyPolicy')}</Link> · <Link href="#" className={styles.footerLink}>{t('auth.termsOfService')}</Link>
      </footer>
    </div>
  );
}
