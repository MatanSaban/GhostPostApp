'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from './AdminModal.module.css';

export function AdminModal({ isOpen, onClose, title, children, size = 'medium' }) {
  const { t } = useLocale();
  const modalRef = useRef(null);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return createPortal(
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={`${styles.modal} ${styles[size]}`} ref={modalRef}>
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button className={styles.closeButton} onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className={styles.content}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function ConfirmDialog({ isOpen, onClose, onConfirm, title, message, confirmText, cancelText, variant = 'danger', isLoading = false }) {
  const { t } = useLocale();

  if (!isOpen) return null;

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return createPortal(
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={`${styles.modal} ${styles.small}`}>
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button className={styles.closeButton} onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className={styles.content}>
          <p className={styles.message}>{message}</p>
          <div className={styles.actions}>
            <button 
              className={styles.cancelButton} 
              onClick={onClose}
              disabled={isLoading}
            >
              {cancelText || t('admin.common.cancel')}
            </button>
            <button 
              className={`${styles.confirmButton} ${styles[variant]}`} 
              onClick={onConfirm}
              disabled={isLoading}
            >
              {isLoading ? t('admin.common.loading') : (confirmText || t('admin.common.delete'))}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function FormField({ label, error, children }) {
  return (
    <div className={styles.formField}>
      {label && <label className={styles.label}>{label}</label>}
      {children}
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}

export function FormInput({ label, error, ...props }) {
  return (
    <FormField label={label} error={error}>
      <input className={styles.input} {...props} />
    </FormField>
  );
}

export function FormTextarea({ label, error, ...props }) {
  return (
    <FormField label={label} error={error}>
      <textarea className={styles.textarea} {...props} />
    </FormField>
  );
}

export function FormSelect({ label, error, options, ...props }) {
  return (
    <FormField label={label} error={error}>
      <select className={styles.select} {...props}>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </FormField>
  );
}

export function FormCheckbox({ label, ...props }) {
  return (
    <label className={styles.checkboxLabel}>
      <input type="checkbox" className={styles.checkbox} {...props} />
      <span>{label}</span>
    </label>
  );
}

export function FormActions({ children }) {
  return <div className={styles.formActions}>{children}</div>;
}

export function PrimaryButton({ children, isLoading, ...props }) {
  return (
    <button className={styles.primaryButton} disabled={isLoading} {...props}>
      {isLoading ? '...' : children}
    </button>
  );
}

export function SecondaryButton({ children, ...props }) {
  return (
    <button className={styles.secondaryButton} {...props}>
      {children}
    </button>
  );
}
