import { Monitor } from 'lucide-react';
import { getTranslations } from '@/i18n/server';
import styles from '../page.module.css';

export default async function SEOFrontendPage() {
  const t = await getTranslations();
  
  return (
    <>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t('seoFrontend.title')}</h1>
      </div>

      <div className={styles.pagePlaceholder}>
        <Monitor className={styles.placeholderIcon} />
        <h2 className={styles.placeholderTitle}>{t('seoFrontend.title')}</h2>
        <p className={styles.placeholderText}>
          {t('seoFrontend.subtitle')}
        </p>
      </div>
    </>
  );
}
