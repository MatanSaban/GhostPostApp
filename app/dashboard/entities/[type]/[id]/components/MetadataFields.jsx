'use client';

import { useLocale } from '@/app/context/locale-context';
import styles from '../edit.module.css';

export function MetadataFields({ metadata, entity }) {
  const { t } = useLocale();

  // Parse metadata if it's a string
  let parsedMetadata = {};
  if (typeof metadata === 'string') {
    try {
      parsedMetadata = JSON.parse(metadata);
    } catch {
      parsedMetadata = {};
    }
  } else if (typeof metadata === 'object' && metadata !== null) {
    parsedMetadata = metadata;
  }

  // Entity info to display
  const entityInfo = [
    { key: 'id', label: t('entities.edit.metadata.id'), value: entity?.id },
    { key: 'externalId', label: t('entities.edit.metadata.externalId'), value: entity?.externalId },
    { key: 'createdAt', label: t('entities.edit.metadata.createdAt'), value: entity?.createdAt ? new Date(entity.createdAt).toLocaleString() : null },
    { key: 'updatedAt', label: t('entities.edit.metadata.updatedAt'), value: entity?.updatedAt ? new Date(entity.updatedAt).toLocaleString() : null },
    { key: 'publishedAt', label: t('entities.edit.metadata.publishedAt'), value: entity?.publishedAt ? new Date(entity.publishedAt).toLocaleString() : null },
  ].filter(item => item.value);

  // Convert metadata object to displayable format
  const metadataEntries = Object.entries(parsedMetadata).filter(([key, value]) => {
    // Filter out internal WordPress meta keys
    if (key.startsWith('_')) return false;
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Entity Information */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>{t('entities.edit.metadata.entityInfo')}</h3>
        </div>
        <div className={styles.cardContent}>
          <div className={styles.metadataSection}>
            {entityInfo.map(item => (
              <div key={item.key} className={styles.metadataItem}>
                <span className={styles.metadataKey}>{item.label}</span>
                <span className={styles.metadataValue}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Raw Metadata */}
      {metadataEntries.length > 0 && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>{t('entities.edit.metadata.rawMeta')}</h3>
          </div>
          <div className={styles.cardContent}>
            <div className={styles.metadataSection}>
              {metadataEntries.map(([key, value]) => (
                <div key={key} className={styles.metadataItem}>
                  <span className={styles.metadataKey}>{key}</span>
                  <span className={styles.metadataValue}>
                    {Array.isArray(value) 
                      ? value.join(', ') 
                      : typeof value === 'object' 
                        ? JSON.stringify(value) 
                        : String(value)
                    }
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {metadataEntries.length === 0 && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>{t('entities.edit.metadata.rawMeta')}</h3>
          </div>
          <div className={styles.cardContent}>
            <p style={{ color: 'var(--muted-foreground)' }}>
              {t('entities.edit.metadata.noMeta')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
