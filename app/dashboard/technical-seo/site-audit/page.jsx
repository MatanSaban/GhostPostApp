'use client';

import { useState } from 'react';
import { 
  Activity, 
  CheckCircle2, 
  AlertTriangle,
  XCircle,
  RefreshCw,
  FileText,
  Loader2,
  Globe,
  Zap,
  Shield,
  Smartphone,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useSite } from '@/app/context/site-context';
import styles from './site-audit.module.css';

export default function SiteAuditPage() {
  const { t } = useLocale();
  const { selectedSite } = useSite();
  const [isScanning, setIsScanning] = useState(false);
  const [lastScan, setLastScan] = useState(null);

  if (!selectedSite) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <Activity className={styles.emptyIcon} />
          <p>{t('siteAudit.selectSite')}</p>
        </div>
      </div>
    );
  }

  const handleStartScan = () => {
    setIsScanning(true);
    // Simulate scan
    setTimeout(() => {
      setIsScanning(false);
      setLastScan(new Date().toISOString());
    }, 3000);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>{t('siteAudit.title')}</h1>
          <p className={styles.subtitle}>{t('siteAudit.subtitle')}</p>
        </div>
        <button 
          className={styles.scanButton}
          onClick={handleStartScan}
          disabled={isScanning}
        >
          {isScanning ? (
            <Loader2 className={`${styles.buttonIcon} ${styles.spinning}`} />
          ) : (
            <RefreshCw className={styles.buttonIcon} />
          )}
          {isScanning ? t('siteAudit.scanning') : t('siteAudit.startScan')}
        </button>
      </div>

      {/* Health Score */}
      <div className={styles.scoreCard}>
        <div className={styles.scoreCircle}>
          <span className={styles.scoreValue}>--</span>
          <span className={styles.scoreLabel}>{t('siteAudit.healthScore')}</span>
        </div>
        <div className={styles.scoreDetails}>
          <div className={styles.scoreItem}>
            <CheckCircle2 className={styles.scoreIconSuccess} />
            <span>0 {t('siteAudit.passed')}</span>
          </div>
          <div className={styles.scoreItem}>
            <AlertTriangle className={styles.scoreIconWarning} />
            <span>0 {t('siteAudit.warnings')}</span>
          </div>
          <div className={styles.scoreItem}>
            <XCircle className={styles.scoreIconError} />
            <span>0 {t('siteAudit.errors')}</span>
          </div>
        </div>
      </div>

      {/* Categories Grid */}
      <div className={styles.categoriesGrid}>
        <div className={styles.categoryCard}>
          <div className={styles.categoryHeader}>
            <div className={`${styles.categoryIcon} ${styles.performance}`}>
              <Zap />
            </div>
            <div className={styles.categoryInfo}>
              <h3 className={styles.categoryTitle}>{t('siteAudit.performance')}</h3>
              <span className={styles.categoryScore}>-- / 100</span>
            </div>
          </div>
          <p className={styles.categoryDescription}>{t('siteAudit.performanceDescription')}</p>
        </div>

        <div className={styles.categoryCard}>
          <div className={styles.categoryHeader}>
            <div className={`${styles.categoryIcon} ${styles.seo}`}>
              <Globe />
            </div>
            <div className={styles.categoryInfo}>
              <h3 className={styles.categoryTitle}>{t('siteAudit.seoHealth')}</h3>
              <span className={styles.categoryScore}>-- / 100</span>
            </div>
          </div>
          <p className={styles.categoryDescription}>{t('siteAudit.seoHealthDescription')}</p>
        </div>

        <div className={styles.categoryCard}>
          <div className={styles.categoryHeader}>
            <div className={`${styles.categoryIcon} ${styles.security}`}>
              <Shield />
            </div>
            <div className={styles.categoryInfo}>
              <h3 className={styles.categoryTitle}>{t('siteAudit.security')}</h3>
              <span className={styles.categoryScore}>-- / 100</span>
            </div>
          </div>
          <p className={styles.categoryDescription}>{t('siteAudit.securityDescription')}</p>
        </div>

        <div className={styles.categoryCard}>
          <div className={styles.categoryHeader}>
            <div className={`${styles.categoryIcon} ${styles.mobile}`}>
              <Smartphone />
            </div>
            <div className={styles.categoryInfo}>
              <h3 className={styles.categoryTitle}>{t('siteAudit.mobileFriendly')}</h3>
              <span className={styles.categoryScore}>-- / 100</span>
            </div>
          </div>
          <p className={styles.categoryDescription}>{t('siteAudit.mobileFriendlyDescription')}</p>
        </div>
      </div>

      {/* Empty State - No scans yet */}
      {!lastScan && !isScanning && (
        <div className={styles.emptyState}>
          <Activity className={styles.emptyIcon} />
          <h3 className={styles.emptyTitle}>{t('siteAudit.noScans')}</h3>
          <p className={styles.emptyDescription}>{t('siteAudit.noScansDescription')}</p>
          <button className={styles.scanButton} onClick={handleStartScan}>
            <RefreshCw className={styles.buttonIcon} />
            {t('siteAudit.runFirstScan')}
          </button>
        </div>
      )}
    </div>
  );
}
