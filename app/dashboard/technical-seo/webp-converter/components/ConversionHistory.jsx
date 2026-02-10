'use client';

import { Image as ImageIcon, Undo2, Info, ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from '../../technical-seo.module.css';

export default function ConversionHistory({
  conversionHistory,
  showHistory,
  onToggleHistory,
  reverting,
  onRevert,
}) {
  const { t } = useLocale();
  
  if (conversionHistory.length === 0) {
    return null;
  }
  
  return (
    <div className={styles.historySection}>
      <button 
        className={styles.historyToggle}
        onClick={onToggleHistory}
      >
        <Undo2 />
        {t('tools.webp.conversionHistory')} ({conversionHistory.length})
        {showHistory ? <ChevronUp /> : <ChevronDown />}
      </button>
      
      {showHistory && (
        <div className={styles.historyList}>
          <div className={styles.historyInfo}>
            <Info className={styles.historyInfoIcon} />
            <span>{t('tools.webp.historyInfo')}</span>
          </div>
          {conversionHistory.map((item) => (
            <div key={item.id} className={styles.historyItem}>
              <div className={styles.historyItemImage}>
                {item.thumbnail ? (
                  <img src={item.thumbnail} alt={item.title} />
                ) : (
                  <ImageIcon />
                )}
              </div>
              <div className={styles.historyItemInfo}>
                <span className={styles.historyItemTitle}>{item.title}</span>
                <span className={styles.historyItemMeta}>
                  {item.originalMimeType} → WebP • {item.convertedAt}
                </span>
              </div>
              <button
                className={styles.revertButton}
                onClick={() => onRevert(item)}
                disabled={reverting === item.id}
              >
                {reverting === item.id ? (
                  <Loader2 className={styles.spinning} />
                ) : (
                  <Undo2 />
                )}
                {t('tools.webp.revert')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
