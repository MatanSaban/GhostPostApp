'use client';

import { Search, Filter, RefreshCw, Plus } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from '../../admin.module.css';

export default function PlansToolbar({
  searchQuery,
  onSearchChange,
  onRefresh,
  onAdd,
}) {
  const { t } = useLocale();
  
  return (
    <div className={styles.adminToolbar}>
      <div className={styles.toolbarLeft}>
        <div className={styles.searchWrapper}>
          <Search className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder={t('admin.plans.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        <button className={styles.filterButton}>
          <Filter size={16} />
          <span>{t('admin.common.filter')}</span>
        </button>
      </div>
      <div className={styles.toolbarRight}>
        <button className={styles.refreshButton} onClick={onRefresh}>
          <RefreshCw size={16} />
        </button>
        <button className={styles.addButton} onClick={onAdd}>
          <Plus size={16} />
          <span>{t('admin.plans.addPlan')}</span>
        </button>
      </div>
    </div>
  );
}
