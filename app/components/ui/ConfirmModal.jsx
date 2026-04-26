'use client';

import { createPortal } from 'react-dom';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from './ConfirmModal.module.css';

/**
 * Reusable confirmation modal — drops in wherever we'd otherwise use
 * `window.confirm()`. Renders via createPortal so it floats above any
 * page chrome and can't be clipped by overflow:hidden ancestors.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {() => void} props.onClose
 * @param {() => void | Promise<void>} props.onConfirm
 * @param {string} props.title
 * @param {string} [props.description]
 * @param {string} [props.confirmLabel="Delete"]
 * @param {string} [props.cancelLabel="Cancel"]
 * @param {'danger'|'primary'} [props.variant="danger"] - Color of the
 *   confirm button. Use 'danger' for destructive operations.
 * @param {boolean} [props.isPending=false] - Disable + spinner while a
 *   parent-side async confirm is in flight.
 */
export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel,
  variant = 'danger',
  isPending = false,
}) {
  const { t } = useLocale();

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  const handleConfirm = async () => {
    try {
      await onConfirm?.();
    } catch {
      // Errors are surfaced by the caller; we don't double-handle here.
    }
  };

  return createPortal(
    <div className={styles.overlay} onClick={isPending ? undefined : onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true">
        <div className={styles.header}>
          <div className={`${styles.iconBadge} ${styles[`iconBadge_${variant}`]}`}>
            <AlertTriangle size={18} />
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            disabled={isPending}
            aria-label={t('common.close') || 'Close'}
          >
            <X size={16} />
          </button>
        </div>

        <div className={styles.body}>
          <h3 className={styles.title}>{title}</h3>
          {description && <p className={styles.description}>{description}</p>}
        </div>

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={onClose}
            disabled={isPending}
          >
            {cancelLabel || t('common.cancel') || 'Cancel'}
          </button>
          <button
            type="button"
            className={`${styles.primaryBtn} ${styles[`primaryBtn_${variant}`]}`}
            onClick={handleConfirm}
            disabled={isPending}
          >
            {isPending && <Loader2 size={14} className={styles.spinningIcon} />}
            {confirmLabel || t('common.confirm') || 'Confirm'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
