'use client';

import { RefreshCw, Loader2 } from 'lucide-react';
import styles from './actions.module.css';

/**
 * Reusable scan/refresh button component
 * @param {Object} props
 * @param {string} props.id - The ID of the item to scan
 * @param {boolean} props.isScanning - Whether the item is currently being scanned
 * @param {Function} props.onScan - Callback when scan is triggered
 * @param {string} props.label - Button label text
 * @param {string} props.size - Button size: 'sm' | 'md' (default: 'md')
 * @param {string} props.className - Additional CSS class
 */
export function ScanButton({ 
  id, 
  isScanning, 
  onScan, 
  label,
  size = 'md',
  className = '' 
}) {
  const handleClick = (e) => {
    e.stopPropagation();
    onScan(id);
  };

  const iconSize = size === 'sm' ? 12 : 14;

  return (
    <button
      className={`${styles.actionButton} ${styles[size]} ${className}`}
      onClick={handleClick}
      disabled={isScanning}
      type="button"
    >
      {isScanning ? (
        <Loader2 size={iconSize} className={styles.spinIcon} />
      ) : (
        <RefreshCw size={iconSize} />
      )}
      {label}
    </button>
  );
}
