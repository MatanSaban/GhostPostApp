'use client';

import { useLocale } from '@/app/context/locale-context';
import styles from '../edit.module.css';

export function BasicFields({ formData, onChange }) {
  const { t } = useLocale();

  const statusOptions = [
    { value: 'PUBLISHED', label: t('entities.published') },
    { value: 'DRAFT', label: t('entities.draft') },
    { value: 'PENDING', label: t('entities.pending') },
    { value: 'SCHEDULED', label: t('entities.scheduled') },
    { value: 'PRIVATE', label: t('entities.private') },
    { value: 'ARCHIVED', label: t('entities.archived') },
  ];

  // Format date for datetime-local input
  const formatDateForInput = (date) => {
    if (!date) return '';
    const d = new Date(date);
    // Format as YYYY-MM-DDTHH:MM for datetime-local input
    return d.toISOString().slice(0, 16);
  };

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
              onChange={(e) => {
                const newStatus = e.target.value;
                onChange('status', newStatus);
                // Auto-set scheduledAt to future date if switching to SCHEDULED
                if (newStatus === 'SCHEDULED' && !formData.scheduledAt) {
                  const futureDate = new Date();
                  futureDate.setDate(futureDate.getDate() + 1); // Default to tomorrow
                  futureDate.setHours(9, 0, 0, 0); // 9:00 AM
                  onChange('scheduledAt', futureDate.toISOString());
                }
              }}
              className={styles.selectInput}
            >
              {statusOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Scheduled Date - Only show when status is SCHEDULED */}
          {formData.status === 'SCHEDULED' && (
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>
                {t('entities.scheduledDate')}
              </label>
              <input
                type="datetime-local"
                value={formatDateForInput(formData.scheduledAt)}
                onChange={(e) => {
                  const date = e.target.value ? new Date(e.target.value).toISOString() : null;
                  onChange('scheduledAt', date);
                }}
                className={styles.textInput}
                min={new Date().toISOString().slice(0, 16)} // Can't schedule in the past
              />
            </div>
          )}

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
