'use client';

import { useState } from 'react';
import { 
  Image as ImageIcon, 
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useSite } from '@/app/context/site-context';
import styles from '../technical-seo.module.css';

import {
  useWebpConverter,
  useAiOptimizer,
  WebpConverterSkeleton,
  WebpStatsCard,
  QueueStatusCard,
  ConversionHistory,
  WebpConversionModal,
  AiSettingsCard,
  AiOptimizationModal,
} from './components';

export default function WebpConverterPage() {
  const { t } = useLocale();
  const { selectedSite, isLoading: isSiteLoading } = useSite();
  
  // WebP Conversion hook
  const webp = useWebpConverter();
  
  // AI Optimizer hook
  const ai = useAiOptimizer();
  
  // Modal option states (kept here as they're UI-only)
  const [keepBackups, setKeepBackups] = useState(true);
  const [flushCache, setFlushCache] = useState(true);
  const [replaceUrls, setReplaceUrls] = useState(true);
  
  // Loading state
  if (isSiteLoading || webp.isLoadingSettings) {
    return <WebpConverterSkeleton />;
  }
  
  // No site selected
  if (!selectedSite) {
    return (
      <div className={styles.noSite}>
        <ImageIcon className={styles.noSiteIcon} />
        <p>{t('tools.noSite')}</p>
      </div>
    );
  }
  
  return (
    <div className={styles.container}>
      {/* WebP Converter Card */}
      <div className={styles.toolCard}>
        <div className={styles.toolHeader}>
          <div className={styles.toolIcon}>
            <ImageIcon />
          </div>
          <div className={styles.toolInfo}>
            <h2 className={styles.toolTitle}>{t('tools.webp.title')}</h2>
            <p className={styles.toolDescription}>{t('tools.webp.description')}</p>
          </div>
        </div>
        
        <WebpStatsCard
          autoConvert={webp.autoConvert}
          isLoadingSettings={webp.isLoadingSettings}
          isSavingSettings={webp.isSavingSettings}
          onToggleAutoConvert={webp.handleToggleAutoConvert}
          stats={webp.stats}
          onRefresh={webp.fetchStats}
        />
        
        <QueueStatusCard
          queueStatus={webp.queueStatus}
          onClearQueue={webp.handleClearQueue}
        />
        
        {/* Convert Button */}
        <div className={styles.actionSection}>
          <button 
            className={styles.convertButton}
            onClick={webp.openConvertModal}
            disabled={webp.stats.nonWebp === 0 || webp.stats.loading}
          >
            <ImageIcon />
            {t('tools.webp.convertImages')} ({webp.stats.nonWebp})
          </button>
          
          {webp.conversionError && (
            <div className={styles.errorMessage}>
              <AlertCircle />
              {webp.conversionError}
            </div>
          )}
        </div>
        
        <ConversionHistory
          conversionHistory={webp.conversionHistory}
          showHistory={webp.showHistory}
          onToggleHistory={() => webp.setShowHistory(!webp.showHistory)}
          reverting={webp.reverting}
          onRevert={webp.handleRevert}
        />
      </div>
      
      {/* AI Image Optimization Card */}
      <div className={styles.toolCard}>
        <div className={styles.toolHeader}>
          <div className={`${styles.toolIcon} ${styles.toolIconAi}`}>
            <Sparkles />
          </div>
          <div className={styles.toolInfo}>
            <h2 className={styles.toolTitle}>{t('tools.ai.title')}</h2>
            <p className={styles.toolDescription}>{t('tools.ai.description')}</p>
          </div>
        </div>
        
        <AiSettingsCard
          aiSettings={ai.aiSettings}
          isLoadingAiSettings={ai.isLoadingAiSettings}
          isSavingAiSettings={ai.isSavingAiSettings}
          onUpdateAiSettings={ai.handleUpdateAiSettings}
          imageRedirects={ai.imageRedirects}
          showRedirects={ai.showRedirects}
          onToggleRedirects={() => ai.setShowRedirects(!ai.showRedirects)}
          onClearRedirects={ai.handleClearRedirects}
          onOpenModal={ai.openAiModal}
          statsLoading={webp.stats.loading}
        />
      </div>
      
      {/* WebP Conversion Modal */}
      <WebpConversionModal
        showModal={webp.showModal}
        onClose={() => webp.setShowModal(false)}
        loadingImages={webp.loadingImages}
        nonWebpImages={webp.nonWebpImages}
        selectedImages={webp.selectedImages}
        onToggleImage={webp.toggleImageSelection}
        onSelectAll={webp.selectAllImages}
        converting={webp.converting}
        conversionProgress={webp.conversionProgress}
        conversionSuccess={webp.conversionSuccess}
        keepBackups={keepBackups}
        setKeepBackups={setKeepBackups}
        flushCache={flushCache}
        setFlushCache={setFlushCache}
        replaceUrls={replaceUrls}
        setReplaceUrls={setReplaceUrls}
        useQueueMode={webp.useQueueMode}
        setUseQueueMode={webp.setUseQueueMode}
        onConvert={() => webp.handleConvertSelected({ keepBackups, flushCache, replaceUrls })}
      />
      
      {/* AI Optimization Modal */}
      <AiOptimizationModal
        showModal={ai.showAiModal}
        onClose={() => {
          ai.setShowAiModal(false);
          ai.setAiError(null);
        }}
        loadingImages={ai.loadingAiImages}
        aiImages={ai.aiImages}
        selectedImages={ai.selectedAiImages}
        onToggleImage={ai.toggleAiImageSelection}
        onSelectAll={ai.selectAllAiImages}
        aiOptimizing={ai.aiOptimizing}
        aiProgress={ai.aiProgress}
        aiResults={ai.aiResults}
        aiError={ai.aiError}
        applyFilename={ai.applyFilename}
        setApplyFilename={ai.setApplyFilename}
        applyAltText={ai.applyAltText}
        setApplyAltText={ai.setApplyAltText}
        aiLanguage={ai.aiLanguage}
        setAiLanguage={ai.setAiLanguage}
        onOptimize={ai.handleAiOptimize}
      />
    </div>
  );
}
