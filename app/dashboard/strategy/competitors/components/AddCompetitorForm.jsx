'use client';

import { Loader2 } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from '../competitors.module.css';

export function AddCompetitorForm({ newUrl, setNewUrl, addingUrl, error, limit, competitorCount, onSubmit, onClose }) {
  const { t } = useLocale();

  return (
    <div className={styles.addFormCard}>
      <form onSubmit={onSubmit} className={styles.addForm}>
        <div className={styles.addFormHeader}>
          <h3>{t('competitorAnalysis.enterUrl')}</h3>
          <span className={styles.remaining}>
            {t('competitorAnalysis.remaining').replace('{count}', String(limit - competitorCount))}
          </span>
        </div>
        <div className={styles.addFormInput}>
          <input
            type="url"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder={t('competitorAnalysis.urlPlaceholder')}
            className={styles.urlInput}
            required
            autoFocus
          />
          <button
            type="submit"
            className={styles.addButton}
            disabled={addingUrl || !newUrl.trim()}
          >
            {addingUrl ? (
              <Loader2 className={styles.spinIcon} size={16} />
            ) : (
              t('competitorAnalysis.addUrl')
            )}
          </button>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onClose}
          >
            {t('competitorAnalysis.cancel')}
          </button>
        </div>
        {error && <p className={styles.errorText}>{error}</p>}
      </form>
    </div>
  );
}
