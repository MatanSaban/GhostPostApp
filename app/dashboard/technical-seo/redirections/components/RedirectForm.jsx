'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import styles from '../page.module.css';

export function RedirectForm({ translations }) {
  const [fromUrl, setFromUrl] = useState('');
  const [toUrl, setToUrl] = useState('');
  const [redirectType, setRedirectType] = useState('301');

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log({ fromUrl, toUrl, redirectType });
    setFromUrl('');
    setToUrl('');
  };

  return (
    <div className={styles.formCard}>
      <h3 className={styles.cardTitle}>{translations.createNew}</h3>
      <form className={styles.formGrid} onSubmit={handleSubmit}>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>{translations.fromUrl}</label>
          <input
            type="text"
            className={styles.formInput}
            placeholder={translations.fromUrlPlaceholder}
            value={fromUrl}
            onChange={(e) => setFromUrl(e.target.value)}
          />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>{translations.toUrl}</label>
          <input
            type="text"
            className={styles.formInput}
            placeholder={translations.toUrlPlaceholder}
            value={toUrl}
            onChange={(e) => setToUrl(e.target.value)}
          />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>{translations.type}</label>
          <select 
            className={styles.formSelect}
            value={redirectType}
            onChange={(e) => setRedirectType(e.target.value)}
          >
            <option value="301">{translations.permanent}</option>
            <option value="302">{translations.temporary}</option>
            <option value="307">{translations.temporary}</option>
          </select>
        </div>
        <button type="submit" className={styles.addButton}>
          <Plus size={16} /> {translations.add}
        </button>
      </form>
    </div>
  );
}
