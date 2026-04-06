'use client';

import { createPortal } from 'react-dom';
import {
  X,
  Database,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';
import { useLocale } from '@/app/context/locale-context';
import styles from './EntitiesRequiredModal.module.css';

/**
 * EntitiesRequiredModal - Shown when user tries to run AI Agent analysis
 * but has no entities synced for the selected site.
 */
export default function EntitiesRequiredModal({ open, onClose }) {
  const { t, direction } = useLocale();
  const ArrowIcon = direction === 'rtl' ? ArrowLeft : ArrowRight;

  if (!open) return null;

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}>
          <X size={18} />
        </button>

        <div className={styles.header}>
          <div className={styles.iconWrap}>
            <Database size={28} />
          </div>
          <h3 className={styles.title}>
            {t('agent.entitiesRequired.title') || 'Entities Required'}
          </h3>
          <p className={styles.description}>
            {t('agent.entitiesRequired.description') || 'The AI Agent needs your website content to analyze. Please add your site entities (pages, posts) first.'}
          </p>
        </div>

        <ol className={styles.steps}>
          <li>
            <span className={styles.stepNum}>1</span>
            <span>{t('agent.entitiesRequired.step1') || 'Go to the Entities page'}</span>
          </li>
          <li>
            <span className={styles.stepNum}>2</span>
            <span>{t('agent.entitiesRequired.step2') || 'Discover your content types and click "Save & Populate"'}</span>
          </li>
          <li>
            <span className={styles.stepNum}>3</span>
            <span>{t('agent.entitiesRequired.step3') || 'Come back here and run the AI Agent analysis'}</span>
          </li>
        </ol>

        <Link
          href="/dashboard/entities"
          className={styles.goBtn}
          onClick={onClose}
        >
          {t('agent.entitiesRequired.goToEntities') || 'Go to Entities'}
          <ArrowIcon size={14} />
        </Link>
      </div>
    </div>,
    document.body
  );
}
