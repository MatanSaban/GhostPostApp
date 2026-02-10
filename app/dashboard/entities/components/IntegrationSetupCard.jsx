'use client';

import { useLocale } from '@/app/context/locale-context';
import styles from '../entities.module.css';

export function IntegrationSetupCard({
  selectedSite,
  platform,
  isDetecting,
  detectionResult,
  onDetectPlatform,
}) {
  const { t } = useLocale();

  const getPlatformBadge = () => {
    if (!platform) return null;
    const platformLabels = {
      wordpress: 'WordPress',
      wix: 'Wix',
      squarespace: 'Squarespace',
      shopify: 'Shopify',
      webflow: 'Webflow',
      other: t('entities.platforms.other'),
    };
    const label = platformLabels[platform] || platform;
    return (
      <span className={`${styles.platformBadge} ${styles[`platform_${platform}`] || ''}`}>
        {label}
      </span>
    );
  };

  const isWordPress = platform === 'wordpress';
  const isConnected = selectedSite?.connectionStatus === 'CONNECTED';

  return (
    <div className={styles.setupCard}>
      <div className={styles.setupHeader}>
        <h3 className={styles.setupTitle}>{t('entities.setup.title')}</h3>
        {getPlatformBadge()}
      </div>

      <div className={styles.siteInfo}>
        <div className={styles.siteUrl}>
          <span className={styles.siteLabel}>{t('entities.setup.site')}:</span>
          <a href={selectedSite?.url} target="_blank" rel="noopener noreferrer" className={styles.siteLink}>
            {selectedSite?.url}
          </a>
        </div>
        {isConnected && (
          <span className={styles.connectedBadge}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {t('entities.setup.connected')}
          </span>
        )}
      </div>

      {!platform && (
        <div className={styles.detectSection}>
          <p className={styles.detectHint}>{t('entities.setup.detectHint')}</p>
          <button
            className={styles.detectButton}
            onClick={onDetectPlatform}
            disabled={isDetecting}
          >
            {isDetecting ? (
              <>
                <span className={styles.spinner} />
                {t('entities.setup.detecting')}
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                {t('entities.setup.detectPlatform')}
              </>
            )}
          </button>
        </div>
      )}

      {detectionResult && !detectionResult.success && (
        <div className={styles.detectionError}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {detectionResult.error}
        </div>
      )}

      {platform && !isWordPress && (
        <div className={styles.nonWordPressNotice}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <div>
            <p className={styles.nonWordPressTitle}>{t('entities.setup.nonWordPressTitle')}</p>
            <p className={styles.nonWordPressDesc}>{t('entities.setup.nonWordPressDesc')}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function IntegrationSetupCardSkeleton() {
  return (
    <div className={styles.setupCard}>
      <div className={styles.setupHeader}>
        <div className={styles.skeletonText} style={{ width: '150px', height: '20px' }} />
        <div className={styles.skeletonBadge} />
      </div>
      <div className={styles.siteInfo}>
        <div className={styles.skeletonText} style={{ width: '200px', height: '16px' }} />
      </div>
      <div className={styles.detectSection}>
        <div className={styles.skeletonText} style={{ width: '100%', height: '14px', marginBottom: '1rem' }} />
        <div className={styles.skeletonButton} />
      </div>
    </div>
  );
}
