'use client';

import { Sparkles, Loader2 } from 'lucide-react';
import styles from './actions.module.css';

/**
 * Reusable AI discovery button component
 * @param {Object} props
 * @param {boolean} props.isDiscovering - Whether AI discovery is in progress
 * @param {Function} props.onClick - Callback when button is clicked
 * @param {string} props.label - Button label text
 * @param {boolean} props.disabled - Whether the button is disabled
 * @param {string} props.className - Additional CSS class
 */
export function AIDiscoverButton({ 
  isDiscovering, 
  onClick, 
  label,
  disabled = false,
  className = '' 
}) {
  return (
    <button
      className={`${styles.aiDiscoverButton} ${className}`}
      onClick={onClick}
      disabled={disabled || isDiscovering}
      type="button"
    >
      {isDiscovering ? (
        <Loader2 size={16} className={styles.spinIcon} />
      ) : (
        <Sparkles size={16} />
      )}
      {label}
    </button>
  );
}
