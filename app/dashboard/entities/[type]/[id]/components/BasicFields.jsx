'use client';

import { useLocale } from '@/app/context/locale-context';
import styles from '../edit.module.css';

export function BasicFields({ formData, onChange }) {
  const { t } = useLocale();

  const statusOptions = [
    { value: 'PUBLISHED', label: t('entities.published') },
    { value: 'DRAFT', label: t('entities.draft') },
    { value: 'ARCHIVED', label: t('entities.archived') },
  ];

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>{t('entities.edit.basicInfo')}</h3>
      </div>
      <div className={styles.cardContent}>
        <div className={styles.cardGrid}>
          {/* Title */}
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>
              {t('common.title')}
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => onChange('title', e.target.value)}
              className={styles.textInput}
              placeholder={t('entities.edit.titlePlaceholder')}
            />
          </div>

          {/* Slug */}
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>
              {t('entities.edit.slug')}
            </label>
            <input
              type="text"
              value={formData.slug}
              onChange={(e) => onChange('slug', e.target.value)}
              className={styles.textInput}
              placeholder={t('entities.edit.slugPlaceholder')}
            />
          </div>

          {/* Status */}
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>
              {t('entities.status')}
            </label>
            <select
              value={formData.status}
              onChange={(e) => onChange('status', e.target.value)}
              className={styles.selectInput}
            >
              {statusOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Excerpt - Full Width */}
          <div className={`${styles.fieldGroup}`} style={{ gridColumn: '1 / -1' }}>
            <label className={styles.fieldLabel}>
              {t('entities.edit.excerpt')}
            </label>
            <textarea
              value={formData.excerpt || ''}
              onChange={(e) => onChange('excerpt', e.target.value)}
              className={styles.textareaInput}
              placeholder={t('entities.edit.excerptPlaceholder')}
              rows={3}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
