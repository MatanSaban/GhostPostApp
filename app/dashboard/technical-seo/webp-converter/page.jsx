'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  ImageIcon, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  Settings2,
  Play,
  Pause,
  X,
  Check,
  Undo2,
  Info,
  ChevronDown,
  ChevronUp,
  Clock,
  Trash2,
  Sparkles,
  FileText,
  ExternalLink,
  Wand2,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useSite } from '@/app/context/site-context';
import styles from '../technical-seo.module.css';

export default function ToolsPage() {
  const { t } = useLocale();
  const { selectedSite } = useSite();
  
  // WebP Tool State
  const [autoConvert, setAutoConvert] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    webp: 0,
    nonWebp: 0,
    loading: true,
  });
  const [converting, setConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState({
    current: 0,
    total: 0,
    converted: 0,
    failed: 0,
  });
  const [conversionError, setConversionError] = useState(null);
  const [conversionSuccess, setConversionSuccess] = useState(false);
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [nonWebpImages, setNonWebpImages] = useState([]);
  const [selectedImages, setSelectedImages] = useState(new Set());
  const [loadingImages, setLoadingImages] = useState(false);
  const [keepBackups, setKeepBackups] = useState(true);
  const [flushCache, setFlushCache] = useState(true);
  const [replaceUrls, setReplaceUrls] = useState(true);
  
  // Queue state
  const [queueStatus, setQueueStatus] = useState(null);
  const [useQueueMode, setUseQueueMode] = useState(true); // Default to queue mode for safety
  
  // Conversion history (images that can be reverted)
  const [showHistory, setShowHistory] = useState(false);
  const [conversionHistory, setConversionHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [reverting, setReverting] = useState(null);
  
  // AI Optimization State
  const [aiSettings, setAiSettings] = useState({
    enabled: false,
    auto_alt_text: false,
    auto_filename: false,
    language: 'en',
  });
  const [isLoadingAiSettings, setIsLoadingAiSettings] = useState(true);
  const [isSavingAiSettings, setIsSavingAiSettings] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiImages, setAiImages] = useState([]);
  const [loadingAiImages, setLoadingAiImages] = useState(false);
  const [selectedAiImages, setSelectedAiImages] = useState(new Set());
  const [aiOptimizing, setAiOptimizing] = useState(false);
  const [aiProgress, setAiProgress] = useState({ current: 0, total: 0 });
  const [aiResults, setAiResults] = useState([]);
  const [aiError, setAiError] = useState(null);
  const [applyFilename, setApplyFilename] = useState(true);
  const [applyAltText, setApplyAltText] = useState(true);
  const [aiLanguage, setAiLanguage] = useState('en');
  const [imageRedirects, setImageRedirects] = useState([]);
  const [showRedirects, setShowRedirects] = useState(false);
  
  // Fetch settings on mount
  useEffect(() => {
    if (selectedSite?.id) {
      fetchSettings();
      fetchStats();
      fetchConversionHistory();
      fetchQueueStatus();
      fetchAiSettings();
      fetchImageRedirects();
    }
  }, [selectedSite?.id]);
  
  // Poll queue status when processing
  useEffect(() => {
    if (queueStatus?.is_processing || queueStatus?.pending > 0) {
      const interval = setInterval(() => {
        fetchQueueStatus();
        fetchStats();
      }, 5000); // Poll every 5 seconds
      return () => clearInterval(interval);
    }
  }, [queueStatus?.is_processing, queueStatus?.pending, selectedSite?.id]);
  
  const fetchSettings = async () => {
    if (!selectedSite?.id) return;
    
    setIsLoadingSettings(true);
    try {
      const response = await fetch(`/api/sites/${selectedSite.id}/tools/settings`);
      if (response.ok) {
        const data = await response.json();
        setAutoConvert(data.autoConvertToWebp ?? false);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setIsLoadingSettings(false);
    }
  };
  
  const fetchStats = async () => {
    if (!selectedSite?.id) return;
    
    setStats(prev => ({ ...prev, loading: true }));
    try {
      const response = await fetch(`/api/sites/${selectedSite.id}/tools/media-stats`);
      if (response.ok) {
        const data = await response.json();
        setStats({
          total: data.total ?? 0,
          webp: data.webp ?? 0,
          nonWebp: data.nonWebp ?? 0,
          loading: false,
        });
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
      setStats(prev => ({ ...prev, loading: false }));
    }
  };
  
  const fetchNonWebpImages = async () => {
    if (!selectedSite?.id) return;
    
    setLoadingImages(true);
    try {
      const response = await fetch(`/api/sites/${selectedSite.id}/tools/non-webp-images`);
      if (response.ok) {
        const data = await response.json();
        setNonWebpImages(data.images ?? []);
        setSelectedImages(new Set()); // Clear selection
      }
    } catch (error) {
      console.error('Error fetching non-webp images:', error);
    } finally {
      setLoadingImages(false);
    }
  };
  
  const fetchConversionHistory = async () => {
    if (!selectedSite?.id) return;
    
    setLoadingHistory(true);
    try {
      const response = await fetch(`/api/sites/${selectedSite.id}/tools/conversion-history`);
      if (response.ok) {
        const data = await response.json();
        setConversionHistory(data.items ?? []);
      }
    } catch (error) {
      console.error('Error fetching conversion history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };
  
  const fetchQueueStatus = async () => {
    if (!selectedSite?.id) return;
    
    try {
      const response = await fetch(`/api/sites/${selectedSite.id}/tools/queue-status`);
      if (response.ok) {
        const data = await response.json();
        setQueueStatus(data);
      }
    } catch (error) {
      console.error('Error fetching queue status:', error);
    }
  };
  
  const handleClearQueue = async () => {
    if (!selectedSite?.id) return;
    
    try {
      await fetch(`/api/sites/${selectedSite.id}/tools/clear-queue`, {
        method: 'POST',
      });
      await fetchQueueStatus();
    } catch (error) {
      console.error('Error clearing queue:', error);
    }
  };
  
  const handleToggleAutoConvert = async () => {
    if (!selectedSite?.id) return;
    
    const newValue = !autoConvert;
    setIsSavingSettings(true);
    
    try {
      const response = await fetch(`/api/sites/${selectedSite.id}/tools/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoConvertToWebp: newValue }),
      });
      
      if (response.ok) {
        setAutoConvert(newValue);
      }
    } catch (error) {
      console.error('Error saving settings:', error);
    } finally {
      setIsSavingSettings(false);
    }
  };
  
  const openConvertModal = async () => {
    setShowModal(true);
    await fetchNonWebpImages();
  };
  
  const toggleImageSelection = (id) => {
    const newSelected = new Set(selectedImages);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedImages(newSelected);
  };
  
  const selectAllImages = () => {
    if (selectedImages.size === nonWebpImages.length) {
      setSelectedImages(new Set());
    } else {
      setSelectedImages(new Set(nonWebpImages.map(img => img.id)));
    }
  };
  
  const handleConvertSelected = async () => {
    if (!selectedSite?.id || converting || selectedImages.size === 0) return;
    
    setConverting(true);
    setConversionError(null);
    setConversionSuccess(false);
    setConversionProgress({ current: 0, total: selectedImages.size, converted: 0, failed: 0 });
    
    try {
      if (useQueueMode) {
        // Use queue mode (safer for shared hosting)
        const response = await fetch(`/api/sites/${selectedSite.id}/tools/queue-webp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            ids: Array.from(selectedImages),
            keepBackups,
            flushCache,
            replaceUrls,
          }),
        });
        
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to queue images');
        }
        
        const result = await response.json();
        setConversionSuccess(true);
        
        // Refresh queue status
        await fetchQueueStatus();
        
        // Close modal after success
        setTimeout(() => {
          setShowModal(false);
          setConversionSuccess(false);
        }, 2000);
      } else {
        // Direct conversion mode (faster but may overload server)
        const response = await fetch(`/api/sites/${selectedSite.id}/tools/convert-to-webp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            ids: Array.from(selectedImages),
            keepBackups,
          }),
        });
        
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Conversion failed');
        }
        
        const result = await response.json();
        setConversionProgress({
          current: result.total,
          total: result.total,
          converted: result.converted,
          failed: result.failed,
        });
        setConversionSuccess(true);
        
        // Refresh stats and history
        await fetchStats();
        await fetchConversionHistory();
        
        // Close modal after success
        setTimeout(() => {
          setShowModal(false);
          setConversionSuccess(false);
        }, 2000);
      }
    } catch (error) {
      console.error('Conversion error:', error);
      setConversionError(error.message);
    } finally {
      setConverting(false);
    }
  };
  
  const handleRevert = async (historyItem) => {
    if (!selectedSite?.id || reverting) return;
    
    setReverting(historyItem.id);
    
    try {
      const response = await fetch(`/api/sites/${selectedSite.id}/tools/revert-webp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId: historyItem.id }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Revert failed');
      }
      
      // Refresh stats and history
      await fetchStats();
      await fetchConversionHistory();
    } catch (error) {
      console.error('Revert error:', error);
      setConversionError(error.message);
    } finally {
      setReverting(null);
    }
  };
  
  // ==========================================
  // AI Optimization Functions
  // ==========================================
  
  const fetchAiSettings = async () => {
    if (!selectedSite?.id) return;
    
    setIsLoadingAiSettings(true);
    try {
      const response = await fetch(`/api/sites/${selectedSite.id}/tools/ai-settings`);
      if (response.ok) {
        const data = await response.json();
        setAiSettings(data);
        setAiLanguage(data.language || 'en');
      }
    } catch (error) {
      console.error('Error fetching AI settings:', error);
    } finally {
      setIsLoadingAiSettings(false);
    }
  };
  
  const handleUpdateAiSettings = async (newSettings) => {
    if (!selectedSite?.id) return;
    
    setIsSavingAiSettings(true);
    try {
      const response = await fetch(`/api/sites/${selectedSite.id}/tools/ai-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
      });
      
      if (response.ok) {
        const data = await response.json();
        setAiSettings(data);
      }
    } catch (error) {
      console.error('Error updating AI settings:', error);
    } finally {
      setIsSavingAiSettings(false);
    }
  };
  
  const fetchImageRedirects = async () => {
    if (!selectedSite?.id) return;
    
    try {
      const response = await fetch(`/api/sites/${selectedSite.id}/tools/image-redirects`);
      if (response.ok) {
        const data = await response.json();
        setImageRedirects(data.redirects ? Object.entries(data.redirects) : []);
      }
    } catch (error) {
      console.error('Error fetching image redirects:', error);
    }
  };
  
  const handleClearRedirects = async () => {
    if (!selectedSite?.id) return;
    
    try {
      await fetch(`/api/sites/${selectedSite.id}/tools/image-redirects`, {
        method: 'DELETE',
      });
      setImageRedirects([]);
    } catch (error) {
      console.error('Error clearing redirects:', error);
    }
  };
  
  const openAiModal = async () => {
    setShowAiModal(true);
    setAiResults([]);
    setAiError(null);
    setSelectedAiImages(new Set());
    await fetchAiImages();
  };
  
  const fetchAiImages = async () => {
    if (!selectedSite?.id) return;
    
    setLoadingAiImages(true);
    try {
      // Get all images (not just non-webp) for AI optimization
      const response = await fetch(`/api/sites/${selectedSite.id}/tools/media-list?limit=50`);
      if (response.ok) {
        const data = await response.json();
        setAiImages(data.items ?? data.images ?? []);
      }
    } catch (error) {
      console.error('Error fetching images for AI:', error);
    } finally {
      setLoadingAiImages(false);
    }
  };
  
  const toggleAiImageSelection = (imageId) => {
    setSelectedAiImages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(imageId)) {
        newSet.delete(imageId);
      } else {
        newSet.add(imageId);
      }
      return newSet;
    });
  };
  
  const selectAllAiImages = () => {
    if (selectedAiImages.size === aiImages.length) {
      setSelectedAiImages(new Set());
    } else {
      setSelectedAiImages(new Set(aiImages.map(img => img.id)));
    }
  };
  
  const handleAiOptimize = async () => {
    if (!selectedSite?.id || selectedAiImages.size === 0) return;
    
    setAiOptimizing(true);
    setAiError(null);
    setAiResults([]);
    
    const imageIds = Array.from(selectedAiImages);
    setAiProgress({ current: 0, total: imageIds.length });
    
    const results = [];
    
    // Process one image at a time to show progress
    for (let i = 0; i < imageIds.length; i++) {
      setAiProgress({ current: i + 1, total: imageIds.length });
      
      try {
        const response = await fetch(`/api/sites/${selectedSite.id}/tools/ai-optimize-image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageId: imageIds[i],
            applyFilename,
            applyAltText,
            language: aiLanguage,
          }),
        });
        
        if (response.ok) {
          const data = await response.json();
          results.push({
            imageId: imageIds[i],
            success: true,
            ...data,
          });
        } else {
          const data = await response.json();
          results.push({
            imageId: imageIds[i],
            success: false,
            error: data.error || 'Failed',
          });
        }
      } catch (error) {
        results.push({
          imageId: imageIds[i],
          success: false,
          error: error.message,
        });
      }
    }
    
    setAiResults(results);
    setAiOptimizing(false);
    
    // Refresh redirects if any filenames were changed
    if (applyFilename) {
      await fetchImageRedirects();
    }
  };
  
  if (!selectedSite) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>{t('tools.title')}</h1>
          <p className={styles.subtitle}>{t('tools.subtitle')}</p>
        </div>
        <div className={styles.noSite}>
          <AlertCircle className={styles.noSiteIcon} />
          <p>{t('tools.selectSite')}</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t('tools.title')}</h1>
        <p className={styles.subtitle}>{t('tools.subtitle')}</p>
      </div>
      
      {/* WebP Conversion Tool */}
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
        
        {/* Auto Convert Toggle */}
        <div className={styles.settingRow}>
          <div className={styles.settingInfo}>
            <Settings2 className={styles.settingIcon} />
            <div>
              <h3 className={styles.settingTitle}>{t('tools.webp.autoConvert')}</h3>
              <p className={styles.settingDescription}>{t('tools.webp.autoConvertDesc')}</p>
            </div>
          </div>
          <button 
            className={`${styles.toggle} ${autoConvert ? styles.toggleActive : ''}`}
            onClick={handleToggleAutoConvert}
            disabled={isLoadingSettings || isSavingSettings}
          >
            <span className={styles.toggleThumb}>
              {isSavingSettings ? (
                <Loader2 className={styles.toggleLoader} />
              ) : autoConvert ? (
                <Play className={styles.toggleIcon} />
              ) : (
                <Pause className={styles.toggleIcon} />
              )}
            </span>
          </button>
        </div>
        
        {/* Stats */}
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <span className={styles.statValue}>
              {stats.loading ? <Loader2 className={styles.statLoader} /> : stats.total}
            </span>
            <span className={styles.statLabel}>{t('tools.webp.totalImages')}</span>
          </div>
          <div className={`${styles.statCard} ${styles.statSuccess}`}>
            <span className={styles.statValue}>
              {stats.loading ? <Loader2 className={styles.statLoader} /> : stats.webp}
            </span>
            <span className={styles.statLabel}>{t('tools.webp.webpImages')}</span>
          </div>
          <div className={`${styles.statCard} ${styles.statWarning}`}>
            <span className={styles.statValue}>
              {stats.loading ? <Loader2 className={styles.statLoader} /> : stats.nonWebp}
            </span>
            <span className={styles.statLabel}>{t('tools.webp.nonWebpImages')}</span>
          </div>
        </div>
        
        {/* Refresh Stats Button */}
        <button 
          className={styles.refreshButton}
          onClick={fetchStats}
          disabled={stats.loading}
        >
          <RefreshCw className={stats.loading ? styles.spinning : ''} />
          {t('tools.webp.refreshStats')}
        </button>
        
        {/* Queue Status Display */}
        {queueStatus && (queueStatus.pending > 0 || queueStatus.is_processing) && (
          <div className={styles.queueStatus}>
            <div className={styles.queueStatusHeader}>
              <Clock className={styles.queueStatusIcon} />
              <span className={styles.queueStatusTitle}>{t('tools.webp.queueStatus')}</span>
            </div>
            <div className={styles.queueStatusContent}>
              <div className={styles.queueStatusItem}>
                <span className={styles.queueStatusLabel}>{t('tools.webp.pending')}</span>
                <span className={styles.queueStatusValue}>{queueStatus.pending}</span>
              </div>
              <div className={styles.queueStatusItem}>
                <span className={styles.queueStatusLabel}>{t('tools.webp.completed')}</span>
                <span className={`${styles.queueStatusValue} ${styles.queueStatusSuccess}`}>{queueStatus.completed}</span>
              </div>
              {queueStatus.failed > 0 && (
                <div className={styles.queueStatusItem}>
                  <span className={styles.queueStatusLabel}>{t('tools.webp.failed')}</span>
                  <span className={`${styles.queueStatusValue} ${styles.queueStatusError}`}>{queueStatus.failed}</span>
                </div>
              )}
              {queueStatus.is_processing && (
                <div className={styles.queueStatusProcessing}>
                  <Loader2 className={styles.spinning} />
                  <span>{t('tools.webp.processing')}</span>
                </div>
              )}
            </div>
            {(queueStatus.completed > 0 || queueStatus.failed > 0) && !queueStatus.is_processing && queueStatus.pending === 0 && (
              <button 
                className={styles.clearQueueButton}
                onClick={handleClearQueue}
              >
                <Trash2 />
                {t('tools.webp.clearQueue')}
              </button>
            )}
          </div>
        )}
        
        {/* Convert Button - Opens Modal */}
        <div className={styles.actionSection}>
          <button 
            className={styles.convertButton}
            onClick={openConvertModal}
            disabled={stats.nonWebp === 0 || stats.loading}
          >
            <ImageIcon />
            {t('tools.webp.convertImages')} ({stats.nonWebp})
          </button>
          
          {conversionError && (
            <div className={styles.errorMessage}>
              <AlertCircle />
              {conversionError}
            </div>
          )}
        </div>
        
        {/* Conversion History */}
        {conversionHistory.length > 0 && (
          <div className={styles.historySection}>
            <button 
              className={styles.historyToggle}
              onClick={() => setShowHistory(!showHistory)}
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
                      onClick={() => handleRevert(item)}
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
        )}
      </div>
      
      {/* AI Image Optimization Tool */}
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
        
        {/* AI Settings */}
        <div className={styles.aiSettings}>
          <div className={styles.settingRow}>
            <div className={styles.settingInfo}>
              <Wand2 className={styles.settingIcon} />
              <div>
                <h3 className={styles.settingTitle}>{t('tools.ai.autoOptimize')}</h3>
                <p className={styles.settingDescription}>{t('tools.ai.autoOptimizeDesc')}</p>
              </div>
            </div>
            <button 
              className={`${styles.toggle} ${aiSettings.enabled ? styles.toggleActive : ''}`}
              onClick={() => handleUpdateAiSettings({ ...aiSettings, enabled: !aiSettings.enabled })}
              disabled={isLoadingAiSettings || isSavingAiSettings}
            >
              <span className={styles.toggleThumb}>
                {isSavingAiSettings ? (
                  <Loader2 className={styles.toggleLoader} />
                ) : aiSettings.enabled ? (
                  <Sparkles className={styles.toggleIcon} />
                ) : (
                  <Pause className={styles.toggleIcon} />
                )}
              </span>
            </button>
          </div>
          
          {aiSettings.enabled && (
            <div className={styles.aiSubSettings}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={aiSettings.auto_filename}
                  onChange={(e) => handleUpdateAiSettings({ ...aiSettings, auto_filename: e.target.checked })}
                  disabled={isSavingAiSettings}
                />
                <span>{t('tools.ai.autoFilename')}</span>
              </label>
              
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={aiSettings.auto_alt_text}
                  onChange={(e) => handleUpdateAiSettings({ ...aiSettings, auto_alt_text: e.target.checked })}
                  disabled={isSavingAiSettings}
                />
                <span>{t('tools.ai.autoAltText')}</span>
              </label>
              
              <div className={styles.languageSelect}>
                <label>{t('tools.ai.language')}</label>
                <select 
                  value={aiSettings.language}
                  onChange={(e) => handleUpdateAiSettings({ ...aiSettings, language: e.target.value })}
                  disabled={isSavingAiSettings}
                >
                  <option value="en">English</option>
                  <option value="he">עברית</option>
                  <option value="es">Español</option>
                  <option value="fr">Français</option>
                  <option value="de">Deutsch</option>
                </select>
              </div>
            </div>
          )}
        </div>
        
        {/* Redirects Display */}
        {imageRedirects.length > 0 && (
          <div className={styles.redirectsSection}>
            <button 
              className={styles.historyToggle}
              onClick={() => setShowRedirects(!showRedirects)}
            >
              <ExternalLink />
              {t('tools.ai.imageRedirects')} ({imageRedirects.length})
              {showRedirects ? <ChevronUp /> : <ChevronDown />}
            </button>
            
            {showRedirects && (
              <div className={styles.redirectsList}>
                <div className={styles.historyInfo}>
                  <Info className={styles.historyInfoIcon} />
                  <span>{t('tools.ai.redirectsInfo')}</span>
                </div>
                {imageRedirects.slice(0, 10).map(([oldPath, redirect]) => (
                  <div key={oldPath} className={styles.redirectItem}>
                    <span className={styles.redirectOld}>{oldPath}</span>
                    <span className={styles.redirectArrow}>→</span>
                    <span className={styles.redirectNew}>{redirect.target}</span>
                  </div>
                ))}
                {imageRedirects.length > 10 && (
                  <div className={styles.redirectsMore}>
                    +{imageRedirects.length - 10} {t('tools.ai.moreRedirects')}
                  </div>
                )}
                <button 
                  className={styles.clearQueueButton}
                  onClick={handleClearRedirects}
                >
                  <Trash2 />
                  {t('tools.ai.clearRedirects')}
                </button>
              </div>
            )}
          </div>
        )}
        
        {/* Optimize Button */}
        <div className={styles.actionSection}>
          <button 
            className={`${styles.convertButton} ${styles.aiButton}`}
            onClick={openAiModal}
            disabled={stats.loading}
          >
            <Sparkles />
            {t('tools.ai.optimizeImages')}
          </button>
        </div>
      </div>
      
      {/* Conversion Modal */}
      {showModal && (
        <div className={styles.modalOverlay} onClick={() => !converting && setShowModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{t('tools.webp.selectImages')}</h2>
              <button 
                className={styles.modalClose}
                onClick={() => !converting && setShowModal(false)}
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
                        onChange={selectAllImages}
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
                        onClick={() => !converting && toggleImageSelection(image.id)}
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
                    onClick={() => setShowModal(false)}
                    disabled={converting}
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    className={styles.modalConfirm}
                    onClick={handleConvertSelected}
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
        </div>
      )}
      
      {/* AI Optimization Modal */}
      {showAiModal && (
        <div className={styles.modalOverlay} onClick={() => !aiOptimizing && setShowAiModal(false)}>
          <div className={`${styles.modal} ${styles.modalLarge}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>
                <Sparkles />
                {t('tools.ai.selectImages')}
              </h2>
              <button 
                className={styles.modalClose}
                onClick={() => !aiOptimizing && setShowAiModal(false)}
                disabled={aiOptimizing}
              >
                <X />
              </button>
            </div>
            
            <div className={styles.modalContent}>
              {loadingAiImages ? (
                <div className={styles.modalLoading}>
                  <Loader2 className={styles.spinning} />
                  <span>{t('tools.ai.loadingImages')}</span>
                </div>
              ) : aiResults.length > 0 ? (
                // Show results
                <div className={styles.aiResultsList}>
                  <h3>{t('tools.ai.optimizationResults')}</h3>
                  {aiResults.map((result, index) => {
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
                        checked={selectedAiImages.size === aiImages.length}
                        onChange={selectAllAiImages}
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
                        className={`${styles.imageItem} ${selectedAiImages.has(image.id) ? styles.imageItemSelected : ''}`}
                        onClick={() => !aiOptimizing && toggleAiImageSelection(image.id)}
                      >
                        <div className={styles.imageCheckbox}>
                          {selectedAiImages.has(image.id) && <Check />}
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
                  onClick={() => {
                    setShowAiModal(false);
                    setAiResults([]);
                  }}
                >
                  <Check />
                  {t('common.done')}
                </button>
              ) : (
                <>
                  <button
                    className={styles.modalCancel}
                    onClick={() => setShowAiModal(false)}
                    disabled={aiOptimizing}
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    className={`${styles.modalConfirm} ${styles.aiModalConfirm}`}
                    onClick={handleAiOptimize}
                    disabled={aiOptimizing || selectedAiImages.size === 0 || (!applyFilename && !applyAltText)}
                  >
                    {aiOptimizing ? (
                      <>
                        <Loader2 className={styles.spinning} />
                        {t('tools.ai.optimizing')} ({aiProgress.current}/{aiProgress.total})
                      </>
                    ) : (
                      <>
                        <Sparkles />
                        {t('tools.ai.optimizeSelected')} ({selectedAiImages.size})
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
