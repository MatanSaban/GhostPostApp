'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSite } from '@/app/context/site-context';
import { useBackgroundTasks } from '@/app/context/background-tasks-context';
import { useLocale } from '@/app/context/locale-context';

export function useWebpConverter() {
  const { selectedSite, isLoading: isSiteLoading } = useSite();
  const { addTask, updateTask } = useBackgroundTasks();
  const { t } = useLocale();
  const processingRef = useRef(false);
  
  // Settings state
  const [autoConvert, setAutoConvert] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  
  // Stats state
  const [stats, setStats] = useState({
    total: 0,
    webp: 0,
    nonWebp: 0,
    loading: true,
  });
  
  // Conversion state
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
  
  // History state
  const [showHistory, setShowHistory] = useState(false);
  const [conversionHistory, setConversionHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [reverting, setReverting] = useState(null);

  // Fetch settings
  const fetchSettings = useCallback(async () => {
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
  }, [selectedSite?.id]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
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
  }, [selectedSite?.id]);

  // Fetch non-webp images
  const fetchNonWebpImages = useCallback(async () => {
    if (!selectedSite?.id) return;
    setLoadingImages(true);
    try {
      const response = await fetch(`/api/sites/${selectedSite.id}/tools/non-webp-images`);
      if (response.ok) {
        const data = await response.json();
        setNonWebpImages(data.images ?? []);
        setSelectedImages(new Set());
      }
    } catch (error) {
      console.error('Error fetching non-webp images:', error);
    } finally {
      setLoadingImages(false);
    }
  }, [selectedSite?.id]);

  // Fetch conversion history
  const fetchConversionHistory = useCallback(async () => {
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
  }, [selectedSite?.id]);

  // Fetch queue status
  const fetchQueueStatus = useCallback(async () => {
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
  }, [selectedSite?.id]);

  // Initial fetch
  useEffect(() => {
    if (selectedSite?.id) {
      fetchSettings();
      fetchStats();
      fetchConversionHistory();
      fetchQueueStatus();
    }
  }, [selectedSite?.id, fetchSettings, fetchStats, fetchConversionHistory, fetchQueueStatus]);

  // Poll queue status when processing
  useEffect(() => {
    if (queueStatus?.is_processing || queueStatus?.pending > 0) {
      const interval = setInterval(() => {
        fetchQueueStatus();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [queueStatus?.is_processing, queueStatus?.pending, fetchQueueStatus]);

  // Clear queue
  const handleClearQueue = async () => {
    if (!selectedSite?.id) return;
    try {
      await fetch(`/api/sites/${selectedSite.id}/tools/clear-queue`, { method: 'POST' });
      await fetchQueueStatus();
    } catch (error) {
      console.error('Error clearing queue:', error);
    }
  };

  // Toggle auto convert
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
      if (response.ok) setAutoConvert(newValue);
    } catch (error) {
      console.error('Error saving settings:', error);
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Open convert modal
  const openConvertModal = async () => {
    setShowModal(true);
    await fetchNonWebpImages();
  };

  // Toggle image selection
  const toggleImageSelection = (id) => {
    const newSelected = new Set(selectedImages);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedImages(newSelected);
  };

  // Select all images
  const selectAllImages = () => {
    if (selectedImages.size === nonWebpImages.length) {
      setSelectedImages(new Set());
    } else {
      setSelectedImages(new Set(nonWebpImages.map(img => img.id)));
    }
  };

  /**
   * Drive queue processing from the platform.
   * Calls process-queue-item sequentially until all items are done.
   */
  const driveQueueProcessing = useCallback(async (siteId, taskId, totalQueued) => {
    if (processingRef.current) return;
    processingRef.current = true;

    let consecutiveErrors = 0;
    const MAX_ERRORS = 5;

    try {
      while (processingRef.current) {
        const res = await fetch(`/api/sites/${siteId}/tools/process-queue-item`, { method: 'POST' });
        
        if (!res.ok) {
          consecutiveErrors++;
          if (consecutiveErrors >= MAX_ERRORS) {
            updateTask(taskId, {
              status: 'error',
              message: t('tools.webp.queueErrorTooMany') || 'Too many errors, stopping',
            });
            break;
          }
          // Brief pause before retry
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }

        consecutiveErrors = 0;
        const data = await res.json();

        const processed = (data.completed || 0) + (data.failed || 0);
        const total = data.total || totalQueued;
        const progress = total > 0 ? Math.round((processed / total) * 100) : 0;

        if (data.done) {
          updateTask(taskId, {
            status: 'completed',
            progress: 100,
            message: `${t('tools.webp.conversionComplete') || 'Conversion complete'} - ${data.completed || 0} ${t('tools.webp.converted') || 'converted'}${data.failed ? `, ${data.failed} ${t('tools.webp.failed') || 'failed'}` : ''}`,
          });
          setQueueStatus({ pending: 0, completed: data.completed || 0, failed: data.failed || 0, total, is_processing: false });
          break;
        }

        updateTask(taskId, {
          status: 'running',
          progress,
          message: `${processed}/${total} - ${data.completed || 0} ${t('tools.webp.converted') || 'converted'}${data.failed ? `, ${data.failed} ${t('tools.webp.failed') || 'failed'}` : ''}`,
        });

        setQueueStatus({ pending: data.pending || 0, completed: data.completed || 0, failed: data.failed || 0, total, is_processing: true });
      }
    } catch (err) {
      console.error('Queue processing error:', err);
      updateTask(taskId, {
        status: 'error',
        message: err.message || 'Processing failed',
      });
    } finally {
      processingRef.current = false;
      // Always refresh data when processing ends (success, error, or abort)
      fetchStats();
      fetchConversionHistory();
      fetchQueueStatus();
    }
  }, [updateTask, fetchStats, fetchConversionHistory, fetchQueueStatus, t]);

  // Convert selected images
  const handleConvertSelected = async ({ keepBackups: kb, flushCache: fc, replaceUrls: ru } = {}) => {
    if (!selectedSite?.id || converting || selectedImages.size === 0) return;
    
    const optKeepBackups = kb ?? keepBackups;
    const optFlushCache = fc ?? flushCache;
    const optReplaceUrls = ru ?? replaceUrls;
    
    setConverting(true);
    setConversionError(null);
    setConversionSuccess(false);
    setConversionProgress({ current: 0, total: selectedImages.size, converted: 0, failed: 0 });
    
    try {
      // Queue images on WordPress
      const response = await fetch(`/api/sites/${selectedSite.id}/tools/queue-webp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ids: Array.from(selectedImages),
          keepBackups: optKeepBackups,
          flushCache: optFlushCache,
          replaceUrls: optReplaceUrls,
        }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to queue images');
      }

      const totalQueued = selectedImages.size;
      
      // Close modal immediately
      setShowModal(false);
      setConversionSuccess(false);
      setConverting(false);

      // Start background task with progress bar
      const taskId = `webp-convert-${selectedSite.id}-${Date.now()}`;
      addTask({
        id: taskId,
        type: 'webp-conversion',
        title: `${t('tools.webp.title') || 'WebP Conversion'} - ${selectedSite.name}`,
        message: `0/${totalQueued}`,
        status: 'running',
        progress: 0,
        cancelable: false,
        metadata: { siteId: selectedSite.id },
      });

      // Drive processing from the platform (don't await - runs in background)
      driveQueueProcessing(selectedSite.id, taskId, totalQueued);

    } catch (error) {
      console.error('Conversion error:', error);
      setConversionError(error.message);
      setConverting(false);
    }
  };

  // Revert conversion
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
      
      await fetchStats();
      await fetchConversionHistory();
    } catch (error) {
      console.error('Revert error:', error);
      setConversionError(error.message);
    } finally {
      setReverting(null);
    }
  };

  return {
    // Site
    selectedSite,
    isSiteLoading,
    // Settings
    autoConvert,
    isLoadingSettings,
    isSavingSettings,
    handleToggleAutoConvert,
    // Stats
    stats,
    // Conversion
    converting,
    conversionProgress,
    conversionError,
    conversionSuccess,
    setConversionError,
    // Modal
    showModal,
    setShowModal,
    nonWebpImages,
    selectedImages,
    loadingImages,
    keepBackups,
    setKeepBackups,
    flushCache,
    setFlushCache,
    replaceUrls,
    setReplaceUrls,
    openConvertModal,
    toggleImageSelection,
    selectAllImages,
    handleConvertSelected,
    // Queue
    queueStatus,
    handleClearQueue,
    // History
    showHistory,
    setShowHistory,
    conversionHistory,
    loadingHistory,
    reverting,
    handleRevert,
    // Refresh
    fetchStats,
  };
}
