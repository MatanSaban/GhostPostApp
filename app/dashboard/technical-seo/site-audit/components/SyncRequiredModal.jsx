'use client';

import { createPortal } from 'react-dom';
import {
  X,
  Database,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from './SyncRequiredModal.module.css';

/**
 * SyncRequiredModal — Shown when AI Fix requires synced entities
 *
 * Props:
 * - open: boolean
 * - onClose: () => void
 */
export default function SyncRequiredModal({ open, onClose }) {
  const { t } = useLocale();

  if (!open) return null;

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}>
          <X size={18} />
        </button>

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.iconWrap}>
            <Database size={28} />
          </div>
          <h3 className={styles.title}>{t('siteAudit.syncRequired.title')}</h3>
          <p className={styles.description}>{t('siteAudit.syncRequired.description')}</p>
        </div>

        {/* Steps */}
        <ol className={styles.steps}>
          <li>
            <span className={styles.stepNum}>1</span>
            <span>{t('siteAudit.syncRequired.step1')}</span>
          </li>
          <li>
            <span className={styles.stepNum}>2</span>
            <span>{t('siteAudit.syncRequired.step2')}</span>
          </li>
          <li>
            <span className={styles.stepNum}>3</span>
            <span>{t('siteAudit.syncRequired.step3')}</span>
          </li>
        </ol>

        {/* Go to Entities button */}
        <a
          href="/dashboard/entities"
          className={styles.goBtn}
          onClick={onClose}
        >
          <RefreshCw size={16} />
          {t('siteAudit.syncRequired.goToEntities')}
          <ArrowRight size={14} />
        </a>
      </div>
    </div>,
    document.body
  );
}
