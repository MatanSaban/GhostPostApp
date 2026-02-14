'use client';

import { Loader2 } from 'lucide-react';
import styles from '../competitors.module.css';

export function AddCompetitorForm({ translations, newUrl, setNewUrl, addingUrl, error, limit, competitorCount, onSubmit, onClose }) {
  const t = translations;

  return (
    <div className={styles.addFormCard}>
      <form onSubmit={onSubmit} className={styles.addForm}>
        <div className={styles.addFormHeader}>
          <h3>{t.enterUrl}</h3>
          <span className={styles.remaining}>
            {t.remaining?.replace('{count}', String(limit - competitorCount)) || `${limit - competitorCount} remaining`}
          </span>
        </div>
        <div className={styles.addFormInput}>
          <input
            type="url"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder={t.urlPlaceholder}
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
              t.addUrl || t.add
            )}
          </button>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onClose}
          >
            {t.cancel}
          </button>
        </div>
        {error && <p className={styles.errorText}>{error}</p>}
      </form>
    </div>
  );
}
