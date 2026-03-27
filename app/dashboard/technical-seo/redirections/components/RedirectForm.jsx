'use client';

import { useState, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import styles from '../page.module.css';

export function RedirectForm({ translations, onSubmit, editingRedirect, onCancel }) {
  const [fromUrl, setFromUrl] = useState('');
  const [toUrl, setToUrl] = useState('');
  const [redirectType, setRedirectType] = useState('301');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEditing = !!editingRedirect;

  // Populate form when editing
  useEffect(() => {
    if (editingRedirect) {
      setFromUrl(editingRedirect.sourceUrl || '');
      setToUrl(editingRedirect.targetUrl || '');
      const typeMap = { PERMANENT: '301', TEMPORARY: '302', FOUND: '307' };
      setRedirectType(typeMap[editingRedirect.type] || '301');
    } else {
      setFromUrl('');
      setToUrl('');
      setRedirectType('301');
    }
  }, [editingRedirect]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!fromUrl || !toUrl) return;

    setIsSubmitting(true);
    const success = await onSubmit({ sourceUrl: fromUrl, targetUrl: toUrl, type: redirectType });
    setIsSubmitting(false);

    if (success) {
      setFromUrl('');
      setToUrl('');
      setRedirectType('301');
    }
  };

  const handleCancel = () => {
    setFromUrl('');
    setToUrl('');
    setRedirectType('301');
    onCancel?.();
  };

  return (
    <div className={styles.formCard}>
      <h3 className={styles.cardTitle}>
        {isEditing ? (translations.editRedirect || translations.update) : translations.createNew}
        {isEditing && (
          <button className={styles.cancelEditButton} onClick={handleCancel}>
            <X size={16} />
          </button>
        )}
      </h3>
      <form className={styles.formGrid} onSubmit={handleSubmit}>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>{translations.fromUrl}</label>
          <input
            type="text"
            className={styles.formInput}
            placeholder={translations.fromUrlPlaceholder}
            value={fromUrl}
            onChange={(e) => setFromUrl(e.target.value)}
            dir="ltr"
            required
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
            dir="ltr"
            required
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
            <option value="307">{translations.temporaryRedirect}</option>
          </select>
        </div>
        <div className={styles.formActions}>
          <button type="submit" className={styles.addButton} disabled={isSubmitting}>
            {isSubmitting ? '...' : (
              <>
                <Plus size={16} /> {isEditing ? translations.update : translations.add}
              </>
            )}
          </button>
          {isEditing && (
            <button type="button" className={styles.cancelButton} onClick={handleCancel}>
              {translations.cancel}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
