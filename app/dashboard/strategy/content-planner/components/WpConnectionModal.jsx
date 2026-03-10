'use client';

import { createPortal } from 'react-dom';
import { X, AlertTriangle } from 'lucide-react';
import WordPressPluginSection from '@/app/dashboard/settings/components/WordPressPluginSection';
import styles from '../page.module.css';

export default function WpConnectionModal({ translations, onClose, onConnected }) {
  const t = translations;

  const handleConnectionChange = (status) => {
    if (status === 'CONNECTED') {
      onConnected?.();
    }
  };

  return createPortal(
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>
            <AlertTriangle size={18} className={styles.warningIcon} />
            {t.title}
          </h2>
          <button className={styles.modalClose} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className={styles.modalBody}>
          <p className={styles.wpModalText}>{t.description}</p>
          <WordPressPluginSection
            compact
            onConnectionChange={handleConnectionChange}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
