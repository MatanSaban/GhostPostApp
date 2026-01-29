import { Server } from 'lucide-react';
import { getTranslations } from '@/i18n/server';
import styles from '../page.module.css';

export default async function SEOBackendPage() {
  const t = await getTranslations();
  
  return (
    <>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t('seoBackend.title')}</h1>
      </div>

      <div className={styles.pagePlaceholder}>
        <Server className={styles.placeholderIcon} />
        <h2 className={styles.placeholderTitle}>{t('seoBackend.title')}</h2>
        <p className={styles.placeholderText}>
          {t('seoBackend.subtitle')}
        </p>
      </div>
    </>
  );
}
