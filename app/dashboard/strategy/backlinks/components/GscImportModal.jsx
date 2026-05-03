'use client';

import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, FileSpreadsheet, Loader2, ExternalLink } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { Button } from '@/app/dashboard/components';
import styles from '../page.module.css';

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function GscImportModal({ isOpen, siteId, onClose, onComplete }) {
  const { t } = useLocale();
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  if (!isOpen || typeof document === 'undefined') return null;

  const reset = () => {
    setFile(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    if (isUploading) return;
    reset();
    onClose();
  };

  const handleFileSelect = (selected) => {
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith('.csv')) {
      setError(t('backlinkAudit.import.errorNotCsv'));
      return;
    }
    setError(null);
    setFile(selected);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) handleFileSelect(dropped);
  };

  const handleSubmit = async () => {
    if (!file || !siteId || isUploading) return;
    setIsUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('siteId', siteId);
      formData.append('file', file);

      const res = await fetch('/api/strategy/backlinks/import', {
        method: 'POST',
        body: formData,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || t('backlinkAudit.import.errorGeneric'));
        return;
      }
      const sync = body.sync || {};
      onComplete?.({
        totalFound: sync.totalFound || 0,
        newCount: sync.newCount || 0,
      });
      reset();
      onClose();
    } catch {
      setError(t('backlinkAudit.import.errorGeneric'));
    } finally {
      setIsUploading(false);
    }
  };

  return createPortal(
    <div className={styles.modalOverlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={styles.modalClose}
          onClick={handleClose}
          disabled={isUploading}
          aria-label={t('common.close') || 'Close'}
        >
          <X size={18} />
        </button>

        <div className={styles.modalHeader}>
          <div className={styles.modalIcon}>
            <FileSpreadsheet size={24} />
          </div>
          <h2 className={styles.modalTitle}>{t('backlinkAudit.import.title')}</h2>
          <p className={styles.modalSubtitle}>{t('backlinkAudit.import.subtitle')}</p>
        </div>

        <div className={styles.modalHelp}>
          <p>{t('backlinkAudit.import.helpIntro')}</p>
          <ol className={styles.modalSteps}>
            <li>{t('backlinkAudit.import.step1')}</li>
            <li>{t('backlinkAudit.import.step2')}</li>
            <li>{t('backlinkAudit.import.step3')}</li>
          </ol>
          <a
            href="https://search.google.com/search-console/links"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.modalGscLink}
          >
            {t('backlinkAudit.import.openGsc')}
            <ExternalLink size={12} />
          </a>
        </div>

        <div
          className={`${styles.dropzone} ${isDragging ? styles.dropzoneActive : ''} ${file ? styles.dropzoneFilled : ''}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className={styles.dropzoneInput}
            onChange={(e) => handleFileSelect(e.target.files?.[0])}
          />
          {file ? (
            <div className={styles.dropzoneFile}>
              <FileSpreadsheet size={20} />
              <div className={styles.dropzoneFileMeta}>
                <span className={styles.dropzoneFilename}>{file.name}</span>
                <span className={styles.dropzoneFilesize}>{formatBytes(file.size)}</span>
              </div>
              <button
                type="button"
                className={styles.dropzoneClear}
                onClick={(e) => { e.stopPropagation(); reset(); }}
                aria-label={t('common.remove') || 'Remove'}
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <>
              <Upload size={20} />
              <span>{t('backlinkAudit.import.dropzonePrompt')}</span>
              <span className={styles.dropzoneHint}>{t('backlinkAudit.import.dropzoneHint')}</span>
            </>
          )}
        </div>

        {error && <div className={`${styles.feedback} ${styles.feedbackError}`}>{error}</div>}

        <div className={styles.modalActions}>
          <Button variant="ghost" onClick={handleClose} disabled={isUploading}>
            {t('common.cancel') || 'Cancel'}
          </Button>
          <Button onClick={handleSubmit} disabled={!file || isUploading}>
            {isUploading ? (
              <><Loader2 size={16} className={styles.spinning} /> {t('backlinkAudit.import.importing')}</>
            ) : (
              <><Upload size={16} /> {t('backlinkAudit.import.confirm')}</>
            )}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
