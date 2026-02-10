'use client';

import Link from 'next/link';
import { useLocale } from '@/app/context/locale-context';
import styles from '../entities.module.css';

export function EnabledTypesCard({ 
  enabledTypes, 
  siteId,
  isConnected,
  onPopulateEntities,
  onCrawlEntities,
  syncStatus,
}) {
  const { t, locale } = useLocale();

  if (enabledTypes.length === 0) {
    return null;
  }

  const isSyncing = syncStatus === 'SYNCING';

  return (
    <div className={styles.enabledTypesCard}>
      <div className={styles.enabledTypesHeader}>
        <h3>{t('entities.enabledTypes.title')}</h3>
        <button 
          onClick={isConnected ? onPopulateEntities : onCrawlEntities}
          disabled={isSyncing}
          className={styles.syncAllButton}
        >
          {isSyncing ? (
            <>
              <span className={styles.spinner} />
              {t('entities.sync.syncing')}
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
              {t('entities.enabledTypes.syncAll')}
            </>
          )}
        </button>
      </div>

      <div className={styles.enabledTypesList}>
        {enabledTypes.map((type) => {
          const displayName = locale === 'he' && type.nameHe ? type.nameHe : type.name;
          const entityCount = type.entityCount || type._count?.entities || 0;

          return (
            <Link
              key={type.id || type.slug}
              href={`/dashboard/entities/${type.slug}`}
              className={styles.enabledTypeItem}
            >
              <div className={styles.typeInfo}>
                <span className={styles.typeName}>{displayName}</span>
                <span className={styles.typeSlug}>{type.slug}</span>
              </div>
              <div className={styles.typeMeta}>
                <span className={styles.entityCount}>
                  {entityCount} {t('entities.items')}
                </span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function EnabledTypesCardSkeleton() {
  return (
    <div className={styles.enabledTypesCard}>
      <div className={styles.enabledTypesHeader}>
        <div className={styles.skeletonText} style={{ width: '160px', height: '20px' }} />
        <div className={styles.skeletonButton} style={{ width: '120px' }} />
      </div>
      <div className={styles.enabledTypesList}>
        {[1, 2, 3].map((i) => (
          <div key={i} className={styles.enabledTypeItemSkeleton}>
            <div className={styles.typeInfo}>
              <div className={styles.skeletonText} style={{ width: '100px', height: '16px' }} />
              <div className={styles.skeletonText} style={{ width: '60px', height: '12px', marginTop: '4px' }} />
            </div>
            <div className={styles.skeletonText} style={{ width: '50px', height: '14px' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
