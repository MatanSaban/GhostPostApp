'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Languages, Check, Plus } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from './LanguagesModal.module.css';

const AVAILABLE_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'he', label: 'עברית' },
];

/**
 * LanguagesModal — view + add languages for a report group.
 *
 * Shows the locales the report has already been generated in (read-only)
 * and lets the user check additional locales to generate. Clicking Save
 * fires one `/api/reports/generate` per newly-checked locale, all sharing
 * the same `reportGroupId` so they collapse into the same row in the
 * table.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {() => void} props.onClose
 * @param {Object} props.report - The row clicked, with `reportGroupId`,
 *                                `siteId`, `metadata`, `languages` (array
 *                                of { locale }), `sectionsConfig`,
 *                                `recipients`.
 * @param {() => void} [props.onSaved] - Called after at least one new
 *                                       generation has been queued.
 */
export function LanguagesModal({ isOpen, onClose, report, onSaved }) {
  const { t } = useLocale();
  const [picked, setPicked] = useState(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setPicked(new Set());
    setError('');
    setIsSaving(false);
  }, [isOpen, report?.reportGroupId]);

  if (!isOpen || !report) return null;
  if (typeof document === 'undefined') return null;

  const existingLocales = new Set(
    Array.isArray(report.languages) ? report.languages.map((l) => l.locale).filter(Boolean) : []
  );

  const togglePick = (code) => {
    if (existingLocales.has(code)) return;
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const handleSave = async () => {
    if (picked.size === 0 || !report?.reportGroupId) return;
    setIsSaving(true);
    setError('');
    try {
      const sectionsList = Array.isArray(report.sectionsConfig?.sections)
        ? report.sectionsConfig.sections.filter((s) => s?.enabled !== false).map((s) => s.id)
        : undefined;
      const recipients = Array.isArray(report.recipients) ? report.recipients : [];
      const currentMonth = report.metadata?.currentMonth || undefined;
      const previousMonth = report.metadata?.previousMonth || undefined;

      // Fire one POST per new locale. They run in parallel server-side
      // (each spawns its own runReportGeneration fire-and-forget) and
      // share `reportGroupId` so the table groups them together.
      const requests = [...picked].map((locale) => fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: report.siteId,
          reportGroupId: report.reportGroupId,
          locale,
          sections: sectionsList,
          currentMonth,
          previousMonth,
          recipients,
        }),
      }));
      const results = await Promise.all(requests);
      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        const first = await failed[0].json().catch(() => ({}));
        throw new Error(first.error || 'Failed to start generation for one or more languages');
      }
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setIsSaving(false);
    }
  };

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <h3 className={styles.title}>
            <Languages size={16} />
            {t('settings.clientReportingSection.languagesModal.title') || 'Report languages'}
          </h3>
          <button className={styles.closeBtn} onClick={onClose} aria-label={t('common.close') || 'Close'}>
            <X size={18} />
          </button>
        </div>

        <div className={styles.body}>
          <p className={styles.description}>
            {t('settings.clientReportingSection.languagesModal.description') || 'Pick the languages this report should be generated in. Already-generated languages are checked.'}
          </p>

          <ul className={styles.list}>
            {AVAILABLE_LANGUAGES.map((lang) => {
              const exists = existingLocales.has(lang.code);
              const isPicked = picked.has(lang.code);
              const checked = exists || isPicked;
              return (
                <li
                  key={lang.code}
                  className={`${styles.item} ${exists ? styles.itemExisting : ''}`}
                >
                  <label className={styles.itemLabel}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={exists || isSaving}
                      onChange={() => togglePick(lang.code)}
                    />
                    <span className={styles.itemText}>{lang.label}</span>
                    {exists && (
                      <span className={styles.itemTag}>
                        <Check size={11} />
                        {t('settings.clientReportingSection.languagesModal.alreadyGenerated') || 'Already generated'}
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>

          {error && <p className={styles.formError}>{error}</p>}
        </div>

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={onClose}
            disabled={isSaving}
          >
            {t('common.cancel') || 'Cancel'}
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={handleSave}
            disabled={isSaving || picked.size === 0}
          >
            {isSaving ? <Loader2 size={14} className={styles.spinningIcon} /> : <Plus size={14} />}
            {t('settings.clientReportingSection.languagesModal.generate') || 'Generate selected'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
