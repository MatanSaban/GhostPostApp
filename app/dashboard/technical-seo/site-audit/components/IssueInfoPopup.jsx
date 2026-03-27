'use client';

import { createPortal } from 'react-dom';
import { X, Info, Wrench } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from './IssueInfoPopup.module.css';

/**
 * IssueInfoPopup - Reusable popup for "What is it?" and "How to fix?" explanations
 *
 * Props:
 * - type: 'whatIsIt' | 'howToFix'
 * - issueTitle: already-translated issue name (displayed as subtitle)
 * - content: the explanation text to show
 * - onClose: callback to close popup
 */
export default function IssueInfoPopup({ type, issueTitle, content, onClose }) {
  const { t } = useLocale();

  if (typeof document === 'undefined') return null;

  const popupTitle = type === 'whatIsIt'
    ? t('siteAudit.whatIsItTitle')
    : t('siteAudit.howToFixTitle');

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.popup} onClick={(e) => e.stopPropagation()}>
        <button className={styles.close} onClick={onClose}>
          <X size={18} />
        </button>
        <div className={styles.header}>
          <div className={`${styles.iconBadge} ${type === 'howToFix' ? styles.iconBadgeFix : ''}`}>
            {type === 'whatIsIt' ? <Info size={22} /> : <Wrench size={22} />}
          </div>
          <h3 className={styles.title}>{popupTitle}</h3>
        </div>
        {issueTitle && (
          <div className={styles.section}>
            <p className={styles.issueTitle}>{issueTitle}</p>
          </div>
        )}
        <div className={styles.section}>
          <p className={styles.description}>{content}</p>
        </div>
        <button className={styles.dismiss} onClick={onClose}>
          {t('siteAudit.pr.info.gotIt')}
        </button>
      </div>
    </div>,
    document.body
  );
}
