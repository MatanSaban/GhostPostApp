'use client';

import { Search, RefreshCw, Plus } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { questionTypes, getTypeLabel } from './useInterviewFlow';
import styles from '../../admin.module.css';

export default function InterviewFlowToolbar({
  searchQuery,
  onSearchChange,
  filterType,
  onFilterTypeChange,
  filterStatus,
  onFilterStatusChange,
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
            placeholder={t('admin.interviewFlow.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        <select
          className={styles.filterSelect}
          value={filterType}
          onChange={(e) => onFilterTypeChange(e.target.value)}
        >
          <option value="all">{t('admin.common.allTypes')}</option>
          {questionTypes.map(type => (
            <option key={type} value={type}>{getTypeLabel(t, type)}</option>
          ))}
        </select>
        <select
          className={styles.filterSelect}
          value={filterStatus}
          onChange={(e) => onFilterStatusChange(e.target.value)}
        >
          <option value="all">{t('admin.common.allStatus')}</option>
          <option value="active">{t('admin.common.active')}</option>
          <option value="inactive">{t('admin.common.inactive')}</option>
        </select>
      </div>
      <div className={styles.toolbarRight}>
        <button className={styles.refreshButton} onClick={onRefresh}>
          <RefreshCw size={16} />
        </button>
        <button className={styles.addButton} onClick={onAdd}>
          <Plus size={16} />
          <span>{t('admin.interviewFlow.addQuestion')}</span>
        </button>
      </div>
    </div>
  );
}
