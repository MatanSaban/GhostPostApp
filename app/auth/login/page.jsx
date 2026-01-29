import Link from 'next/link';
import Image from 'next/image';
import { HeaderActions } from '@/app/components/ui/header-actions';
import { LoginForm } from '../components';
import { getTranslations } from '@/i18n/server';
import styles from '../auth.module.css';

export default async function LoginPage() {
  const t = await getTranslations();

  const translations = {
    email: t('auth.email'),
    emailPlaceholder: t('auth.emailPlaceholder'),
    password: t('auth.password'),
    passwordPlaceholder: t('auth.passwordPlaceholder'),
    forgotPassword: t('auth.forgotPassword'),
    connect: t('auth.connect'),
    orContinueWith: t('auth.orContinueWith'),
    google: t('auth.google'),
    github: t('auth.github'),
  };

  return (
    <div className={styles.authContainer}>
      <div className={styles.themeToggleWrapper}>
        <HeaderActions />
      </div>
      
      <div className={styles.authCard}>
        <div className={styles.authGlow}></div>
        
        <div className={styles.authHeader}>
          <div className={styles.authLogo}>
            <Image src="/ghostpost_logo.png" alt="Ghost Post" width={48} height={48} className={styles.logoImage} />
            <span className={styles.logoText}>{t('brand.name')}</span>
          </div>
          <h1 className={styles.authTitle}>{t('auth.systemAccess')}</h1>
          <p className={styles.authSubtitle}>{t('auth.connectWorkspace')}</p>
        </div>

        <div className={styles.modeToggle}>
          <button className={`${styles.modeButton} ${styles.active}`}>
            {t('auth.login')}
          </button>
          <Link href="/auth/register" className={styles.modeButton}>
            {t('auth.register')}
          </Link>
        </div>

        <LoginForm translations={translations} />

        <div className={styles.authFooter}>
          {t('auth.noAccount')} <Link href="/auth/register">{t('auth.createOne')}</Link>
        </div>
      </div>
    </div>
  );
}
