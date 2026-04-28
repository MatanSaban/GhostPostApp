'use client';

import { createPortal } from 'react-dom';
import { X, Languages, Eye, Download } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { languageNameFromCode } from '@/lib/reports/language-names';
import styles from './LanguagePickerModal.module.css';

/**
 * Lightweight picker shown when a row has multiple languages and the
 * user clicks Preview or Download - they need to choose which locale's
 * report to open. For single-language rows the parent skips this modal
 * and routes directly to the only available report.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {() => void} props.onClose
 * @param {'preview'|'download'} props.intent
 * @param {Array<{ locale, reportId, status, pdfUrl }>} props.languages
 * @param {(picked: { reportId, locale }) => void} props.onPick
 */
export function LanguagePickerModal({ isOpen, onClose, intent = 'preview', languages = [], onPick }) {
  const { t, locale } = useLocale();

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  const intentIcon = intent === 'download' ? <Download size={14} /> : <Eye size={14} />;
  const titleKey = intent === 'download'
    ? 'settings.clientReportingSection.languagePicker.titleDownload'
    : 'settings.clientReportingSection.languagePicker.titlePreview';

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <h3 className={styles.title}>
            <Languages size={16} />
            {t(titleKey) || (intent === 'download' ? 'Pick language to download' : 'Pick language to preview')}
          </h3>
          <button className={styles.closeBtn} onClick={onClose} aria-label={t('common.close') || 'Close'}>
            <X size={18} />
          </button>
        </div>
        <div className={styles.body}>
          <p className={styles.description}>
            {t('settings.clientReportingSection.languagePicker.description') || 'This report exists in multiple languages. Pick which one to open:'}
          </p>
          <ul className={styles.list}>
            {languages.map((lang) => {
              // Disable any locale that isn't ready yet - PENDING means
              // the pipeline hasn't finished, no PDF means download is
              // unavailable (preview can still work off the snapshot).
              const isPending = lang.status === 'PENDING';
              const isDownloadable = !!lang.pdfUrl;
              const disabled = isPending || (intent === 'download' && !isDownloadable);
              return (
                <li key={lang.locale + (lang.reportId || '')}>
                  <button
                    type="button"
                    className={styles.item}
                    onClick={() => !disabled && onPick({ reportId: lang.reportId, locale: lang.locale })}
                    disabled={disabled}
                  >
                    <span className={styles.itemIcon}>{intentIcon}</span>
                    <span className={styles.itemLabel}>{languageNameFromCode(lang.locale, locale) || lang.locale.toUpperCase()}</span>
                    {isPending && (
                      <span className={styles.itemTag}>
                        {t('settings.clientReportingSection.statuses.pending') || 'Generating'}
                      </span>
                    )}
                    {!isPending && intent === 'download' && !isDownloadable && (
                      <span className={styles.itemTag}>
                        {t('settings.clientReportingSection.languagePicker.noPdf') || 'No PDF yet'}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>,
    document.body
  );
}
