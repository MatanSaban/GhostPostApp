'use client';

import { LayoutGrid, List } from 'lucide-react';
import styles from '../competitors.module.css';

export function ViewToggle({ viewMode, onChange, translations }) {
  const t = translations;

  return (
    <div className={styles.viewToggle}>
      <button
        className={`${styles.viewToggleButton} ${viewMode === 'list' ? styles.active : ''}`}
        onClick={() => onChange('list')}
        title={t.listView}
      >
        <List size={18} />
      </button>
      <button
        className={`${styles.viewToggleButton} ${viewMode === 'table' ? styles.active : ''}`}
        onClick={() => onChange('table')}
        title={t.tableView}
      >
        <LayoutGrid size={18} />
      </button>
    </div>
  );
}
