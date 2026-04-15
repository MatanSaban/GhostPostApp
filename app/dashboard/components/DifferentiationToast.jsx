'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, X } from 'lucide-react';
import styles from './DifferentiationToast.module.css';

/**
 * Global toast notification for Content Differentiation completion.
 * Auto-shows when a background job reaches COMPLETED status.
 * Clicking opens the modal; auto-dismisses after 10 seconds.
 * 
 * @param {{ show, message, onClick, onDismiss }} props
 */
export default function DifferentiationToast({ show, message, onClick, onDismiss }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (show) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        onDismiss?.();
      }, 10000);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [show, onDismiss]);

  if (!visible) return null;

  return createPortal(
    <div className={styles.toast} onClick={onClick} role="button" tabIndex={0}>
      <CheckCircle size={18} className={styles.icon} />
      <span className={styles.message}>
        {message || '✅ Content Differentiation strategy is ready for review!'}
      </span>
      <button
        className={styles.dismiss}
        onClick={(e) => {
          e.stopPropagation();
          setVisible(false);
          onDismiss?.();
        }}
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>,
    document.body
  );
}
