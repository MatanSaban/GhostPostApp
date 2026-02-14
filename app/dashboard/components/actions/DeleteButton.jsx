'use client';

import { Trash2 } from 'lucide-react';
import styles from './actions.module.css';

/**
 * Reusable delete button component
 * @param {Object} props
 * @param {string} props.id - The ID of the item to delete
 * @param {Function} props.onDelete - Callback when delete is triggered
 * @param {string} props.label - Button label text
 * @param {string} props.size - Button size: 'sm' | 'md' (default: 'md')
 * @param {boolean} props.disabled - Whether the button is disabled
 * @param {string} props.className - Additional CSS class
 */
export function DeleteButton({ 
  id, 
  onDelete, 
  label,
  size = 'md',
  disabled = false,
  className = '' 
}) {
  const handleClick = (e) => {
    e.stopPropagation();
    onDelete(id);
  };

  const iconSize = size === 'sm' ? 12 : 14;

  return (
    <button
      className={`${styles.actionButton} ${styles.danger} ${styles[size]} ${className}`}
      onClick={handleClick}
      disabled={disabled}
      type="button"
    >
      <Trash2 size={iconSize} />
      {label}
    </button>
  );
}
