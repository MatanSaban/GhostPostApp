'use client';

import { LayoutGrid, List } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from '../competitors.module.css';

export function ViewToggle({ viewMode, onChange }) {
  const { t } = useLocale();

  return (
    <div className={styles.viewToggle}>
      <button
        className={`${styles.viewToggleButton} ${viewMode === 'list' ? styles.active : ''}`}
        onClick={() => onChange('list')}
        title={t('competitorAnalysis.listView')}
      >
        <List size={18} />
      </button>
      <button
        className={`${styles.viewToggleButton} ${viewMode === 'table' ? styles.active : ''}`}
        onClick={() => onChange('table')}
        title={t('competitorAnalysis.tableView')}
      >
        <LayoutGrid size={18} />
      </button>
    </div>
  );
}
