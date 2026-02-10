'use client';

import { 
  Image as ImageIcon, 
  X, 
  Loader2, 
  Sparkles, 
  Check,
  CheckCircle2,
  AlertCircle,
  FileText,
  Info,
  ExternalLink,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from '../../technical-seo.module.css';

export default function AiOptimizationModal({
  showModal,
  onClose,
  loadingImages,
  aiImages,
  selectedImages,
  onToggleImage,
  onSelectAll,
  aiOptimizing,
  aiProgress,
  aiResults,
  aiError,
  // Options
  applyFilename,
  setApplyFilename,
  applyAltText,
  setApplyAltText,
  aiLanguage,
  setAiLanguage,
  // Actions
  onOptimize,
}) {
  const { t } = useLocale();
  
  if (!showModal) return null;
  
  return (
    <div className={styles.modalOverlay} onClick={() => !aiOptimizing && onClose()}>
      <div className={`${styles.modal} ${styles.modalLarge}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>
            <Sparkles />
            {t('tools.ai.selectImages')}
          </h2>
          <button 
            className={styles.modalClose}
            onClick={() => !aiOptimizing && onClose()}
            disabled={aiOptimizing}
          >
            <X />
          </button>
        </div>
        
        <div className={styles.modalContent}>
          {loadingImages ? (
            <div className={styles.modalLoading}>
              <Loader2 className={styles.spinning} />
              <span>{t('tools.ai.loadingImages')}</span>
            </div>
          ) : aiResults.length > 0 ? (
            // Show results
            <div className={styles.aiResultsList}>
              <h3>{t('tools.ai.optimizationResults')}</h3>
              {aiResults.map((result) => {
                const image = aiImages.find(img => img.id === result.imageId);
                return (
                  <div key={result.imageId} className={`${styles.aiResultItem} ${result.success ? styles.aiResultSuccess : styles.aiResultError}`}>
                    <div className={styles.aiResultImage}>
                      {image?.thumbnail ? (
                        <img src={image.thumbnail} alt="" />
                      ) : (
                        <ImageIcon />
                      )}
                    </div>
                    <div className={styles.aiResultInfo}>
                      {result.success ? (
                        <>
                          <div className={styles.aiResultRow}>
                            <FileText className={styles.aiResultIcon} />
                            <span><strong>{t('tools.ai.filename')}:</strong> {result.suggested_filename}</span>
                            {result.applied?.filename && <CheckCircle2 className={styles.appliedIcon} />}
                          </div>
                          <div className={styles.aiResultRow}>
                            <Info className={styles.aiResultIcon} />
                            <span><strong>{t('tools.ai.altText')}:</strong> {result.suggested_alt_text}</span>
                            {result.applied?.alt_text && <CheckCircle2 className={styles.appliedIcon} />}
                          </div>
                          {result.redirect_created && (
                            <div className={styles.aiResultRedirect}>
                              <ExternalLink />
                              {t('tools.ai.redirectCreated')}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className={styles.aiResultError}>
                          <AlertCircle />
                          {result.error}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : aiImages.length === 0 ? (
            <div className={styles.modalEmpty}>
              <ImageIcon />
              <span>{t('tools.ai.noImagesFound')}</span>
            </div>
          ) : (
            <>
              {/* Options */}
              <div className={styles.modalOptions}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={selectedImages.size === aiImages.length}
                    onChange={onSelectAll}
                    disabled={aiOptimizing}
                  />
                  <span>{t('tools.ai.selectAll')} ({aiImages.length})</span>
                </label>
                
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={applyFilename}
                    onChange={(e) => setApplyFilename(e.target.checked)}
                    disabled={aiOptimizing}
                  />
                  <span>{t('tools.ai.applyFilename')}</span>
                </label>
                
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={applyAltText}
                    onChange={(e) => setApplyAltText(e.target.checked)}
                    disabled={aiOptimizing}
                  />
                  <span>{t('tools.ai.applyAltText')}</span>
                </label>
                
                <div className={styles.languageSelectInline}>
                  <label>{t('tools.ai.language')}:</label>
                  <select 
                    value={aiLanguage}
                    onChange={(e) => setAiLanguage(e.target.value)}
                    disabled={aiOptimizing}
                  >
                    <option value="en">English</option>
                    <option value="he">עברית</option>
                    <option value="es">Español</option>
                    <option value="fr">Français</option>
                    <option value="de">Deutsch</option>
                  </select>
                </div>
              </div>
              
              {aiError && (
                <div className={styles.errorMessage}>
                  <AlertCircle />
                  {aiError}
                </div>
              )}
              
              {/* Image Grid */}
              <div className={styles.imageGrid}>
                {aiImages.map((image) => (
                  <div 
                    key={image.id}
                    className={`${styles.imageItem} ${selectedImages.has(image.id) ? styles.imageItemSelected : ''}`}
                    onClick={() => !aiOptimizing && onToggleImage(image.id)}
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
                      <span className={styles.imageMeta}>
                        {image.alt ? `Alt: ${image.alt.substring(0, 20)}...` : t('tools.ai.noAlt')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        
        <div className={styles.modalFooter}>
          {aiResults.length > 0 ? (
            <button
              className={styles.modalConfirm}
              onClick={() => onClose()}
            >
              <Check />
              {t('common.done')}
            </button>
          ) : (
            <>
              <button
                className={styles.modalCancel}
                onClick={onClose}
                disabled={aiOptimizing}
              >
                {t('common.cancel')}
              </button>
              <button
                className={`${styles.modalConfirm} ${styles.aiModalConfirm}`}
                onClick={onOptimize}
                disabled={aiOptimizing || selectedImages.size === 0 || (!applyFilename && !applyAltText)}
              >
                {aiOptimizing ? (
                  <>
                    <Loader2 className={styles.spinning} />
                    {t('tools.ai.optimizing')} ({aiProgress.current}/{aiProgress.total})
                  </>
                ) : (
                  <>
                    <Sparkles />
                    {t('tools.ai.optimizeSelected')} ({selectedImages.size})
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
