'use client';

import { createPortal } from 'react-dom';
import { 
  Image as ImageIcon, 
  X, 
  Loader2, 
  CheckCircle2, 
  Check, 
  Clock, 
  Play 
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from '../../technical-seo.module.css';

export default function WebpConversionModal({
  showModal,
  onClose,
  loadingImages,
  nonWebpImages,
  selectedImages,
  onToggleImage,
  onSelectAll,
  converting,
  conversionProgress,
  conversionSuccess,
  // Options
  keepBackups,
  setKeepBackups,
  flushCache,
  setFlushCache,
  replaceUrls,
  setReplaceUrls,
  useQueueMode,
  setUseQueueMode,
  // Actions
  onConvert,
}) {
  const { t } = useLocale();
  
  if (!showModal) return null;
  
  return createPortal(
    <div className={styles.modalOverlay} onClick={() => !converting && onClose()}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>{t('tools.webp.selectImages')}</h2>
          <button 
            className={styles.modalClose}
            onClick={() => !converting && onClose()}
            disabled={converting}
          >
            <X />
          </button>
        </div>
        
        <div className={styles.modalContent}>
          {loadingImages ? (
            <div className={styles.modalLoading}>
              <Loader2 className={styles.spinning} />
              <span>{t('tools.webp.loadingImages')}</span>
            </div>
          ) : nonWebpImages.length === 0 ? (
            <div className={styles.modalEmpty}>
              <CheckCircle2 />
              <span>{t('tools.webp.noImagesFound')}</span>
            </div>
          ) : (
            <>
              {/* Select All / Options */}
              <div className={styles.modalOptions}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={selectedImages.size === nonWebpImages.length}
                    onChange={onSelectAll}
                    disabled={converting}
                  />
                  <span>{t('tools.webp.selectAll')} ({nonWebpImages.length})</span>
                </label>
                
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={keepBackups}
                    onChange={(e) => setKeepBackups(e.target.checked)}
                    disabled={converting}
                  />
                  <span>{t('tools.webp.keepBackups')}</span>
                </label>
                
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={flushCache}
                    onChange={(e) => setFlushCache(e.target.checked)}
                    disabled={converting || !useQueueMode}
                  />
                  <span>{t('tools.webp.flushCache')}</span>
                </label>
                
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={replaceUrls}
                    onChange={(e) => setReplaceUrls(e.target.checked)}
                    disabled={converting || !useQueueMode}
                  />
                  <span>{t('tools.webp.replaceUrls')}</span>
                </label>
              </div>
              
              <div className={styles.modeToggle}>
                <span className={styles.modeLabel}>{t('tools.webp.conversionMode')}</span>
                <div className={styles.modeButtons}>
                  <button
                    className={`${styles.modeButton} ${useQueueMode ? styles.modeButtonActive : ''}`}
                    onClick={() => setUseQueueMode(true)}
                    disabled={converting}
                  >
                    <Clock />
                    {t('tools.webp.queueMode')}
                  </button>
                  <button
                    className={`${styles.modeButton} ${!useQueueMode ? styles.modeButtonActive : ''}`}
                    onClick={() => setUseQueueMode(false)}
                    disabled={converting}
                  >
                    <Play />
                    {t('tools.webp.directMode')}
                  </button>
                </div>
                <p className={styles.modeDescription}>
                  {useQueueMode 
                    ? t('tools.webp.queueModeDesc') 
                    : t('tools.webp.directModeDesc')}
                </p>
              </div>
              
              {/* Image Grid */}
              <div className={styles.imageGrid}>
                {nonWebpImages.map((image) => (
                  <div 
                    key={image.id}
                    className={`${styles.imageItem} ${selectedImages.has(image.id) ? styles.imageItemSelected : ''}`}
                    onClick={() => !converting && onToggleImage(image.id)}
                  >
                    <div className={styles.imageCheckbox}>
                      {selectedImages.has(image.id) && <Check />}
                    </div>
                    <div className={styles.imageThumbnail}>
                      {image.thumbnail ? (
                        <img src={image.thumbnail} alt={image.title} />
                      ) : (
                        <ImageIcon />
                      )}
                    </div>
                    <div className={styles.imageInfo}>
                      <span className={styles.imageName}>{image.title}</span>
                      <span className={styles.imageMeta}>{image.mimeType} • {image.filesize}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        
        <div className={styles.modalFooter}>
          {conversionSuccess ? (
            <div className={styles.successMessage}>
              <CheckCircle2 />
              {useQueueMode 
                ? t('tools.webp.addedToQueue', { count: selectedImages.size })
                : t('tools.webp.conversionComplete', { 
                    converted: conversionProgress.converted,
                    failed: conversionProgress.failed 
                  })
              }
            </div>
          ) : (
            <>
              <button
                className={styles.modalCancel}
                onClick={onClose}
                disabled={converting}
              >
                {t('common.cancel')}
              </button>
              <button
                className={styles.modalConfirm}
                onClick={onConvert}
                disabled={converting || selectedImages.size === 0}
              >
                {converting ? (
                  <>
                    <Loader2 className={styles.spinning} />
                    {useQueueMode 
                      ? t('tools.webp.addingToQueue')
                      : t('tools.webp.converting') + ` (${conversionProgress.current}/${conversionProgress.total})`
                    }
                  </>
                ) : (
                  <>
                    {useQueueMode ? <Clock /> : <ImageIcon />}
                    {useQueueMode 
                      ? t('tools.webp.addToQueue', { count: selectedImages.size })
                      : t('tools.webp.convertSelected') + ` (${selectedImages.size})`
                    }
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
