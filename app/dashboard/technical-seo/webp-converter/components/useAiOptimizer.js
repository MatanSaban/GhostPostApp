'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSite } from '@/app/context/site-context';
import { useBackgroundTasks } from '@/app/context/background-tasks-context';
import { useLocale } from '@/app/context/locale-context';

export function useAiOptimizer() {
  const { selectedSite } = useSite();
  const { addTask, updateTask } = useBackgroundTasks();
  const { t } = useLocale();
  const processingRef = useRef(false);
  
  // AI Settings state
  const [aiSettings, setAiSettings] = useState({
    enabled: false,
    auto_alt_text: false,
    auto_filename: false,
    language: 'en',
  });
  const [isLoadingAiSettings, setIsLoadingAiSettings] = useState(true);
  const [isSavingAiSettings, setIsSavingAiSettings] = useState(false);
  
  // AI Modal state
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiImages, setAiImages] = useState([]);
  const [loadingAiImages, setLoadingAiImages] = useState(false);
  const [selectedAiImages, setSelectedAiImages] = useState(new Set());
  const [aiImagesPage, setAiImagesPage] = useState(1);
  const [aiImagesHasMore, setAiImagesHasMore] = useState(false);
  const [loadingMoreImages, setLoadingMoreImages] = useState(false);
  
  // AI Optimization state
  const [aiOptimizing, setAiOptimizing] = useState(false);
  const [aiProgress, setAiProgress] = useState({ current: 0, total: 0 });
  const [aiResults, setAiResults] = useState([]);
  const [aiError, setAiError] = useState(null);
  const [applyFilename, setApplyFilename] = useState(true);
  const [applyAltText, setApplyAltText] = useState(true);
  const [aiLanguage, setAiLanguage] = useState('en');
  
  // Image redirects
  const [imageRedirects, setImageRedirects] = useState([]);
  const [showRedirects, setShowRedirects] = useState(false);

  // Fetch AI settings
  const fetchAiSettings = useCallback(async () => {
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
  }, [selectedSite?.id]);

  // Fetch image redirects
  const fetchImageRedirects = useCallback(async () => {
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
  }, [selectedSite?.id]);

  // Initial fetch
  useEffect(() => {
    if (selectedSite?.id) {
      fetchAiSettings();
      fetchImageRedirects();
    }
  }, [selectedSite?.id, fetchAiSettings, fetchImageRedirects]);

  // Update AI settings
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

  // Clear redirects
  const handleClearRedirects = async () => {
    if (!selectedSite?.id) return;
    try {
      await fetch(`/api/sites/${selectedSite.id}/tools/image-redirects`, { method: 'DELETE' });
      setImageRedirects([]);
    } catch (error) {
      console.error('Error clearing redirects:', error);
    }
  };

  // Fetch AI images (first page)
  const fetchAiImages = useCallback(async () => {
    if (!selectedSite?.id) return;
    setLoadingAiImages(true);
    try {
      const response = await fetch(`/api/sites/${selectedSite.id}/tools/media-list?limit=50&page=1`);
      if (response.ok) {
        const data = await response.json();
        setAiImages(data.items ?? []);
        setAiImagesPage(1);
        setAiImagesHasMore((data.page || 1) < (data.pages || 1));
      }
    } catch (error) {
      console.error('Error fetching images for AI:', error);
    } finally {
      setLoadingAiImages(false);
    }
  }, [selectedSite?.id]);

  // Load more images (next page)
  const loadMoreAiImages = useCallback(async () => {
    if (!selectedSite?.id || loadingMoreImages) return;
    const nextPage = aiImagesPage + 1;
    setLoadingMoreImages(true);
    try {
      const response = await fetch(`/api/sites/${selectedSite.id}/tools/media-list?limit=50&page=${nextPage}`);
      if (response.ok) {
        const data = await response.json();
        const newItems = data.items ?? [];
        setAiImages(prev => [...prev, ...newItems]);
        setAiImagesPage(nextPage);
        setAiImagesHasMore(nextPage < (data.pages || 1));
      }
    } catch (error) {
      console.error('Error loading more images:', error);
    } finally {
      setLoadingMoreImages(false);
    }
  }, [selectedSite?.id, aiImagesPage, loadingMoreImages]);

  // Open AI modal
  const openAiModal = async () => {
    setShowAiModal(true);
    setAiResults([]);
    setAiError(null);
    setSelectedAiImages(new Set());
    await fetchAiImages();
  };

  // Toggle AI image selection
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

  // Select all AI images
  const selectAllAiImages = () => {
    if (selectedAiImages.size === aiImages.length) {
      setSelectedAiImages(new Set());
    } else {
      setSelectedAiImages(new Set(aiImages.map(img => img.id)));
    }
  };

  // AI Optimize — closes modal immediately, runs in background with progress bar
  const handleAiOptimize = async () => {
    if (!selectedSite?.id || selectedAiImages.size === 0 || processingRef.current) return;
    
    const imageIds = Array.from(selectedAiImages);
    // Build image data map for the background processing
    const imageDataMap = {};
    for (const id of imageIds) {
      const img = aiImages.find(i => i.id === id);
      if (img) imageDataMap[id] = { url: img.url, filename: img.filename || img.title };
    }
    
    // Close modal immediately
    setShowAiModal(false);
    setAiError(null);
    setAiResults([]);
    
    // Start background task
    const taskId = `ai-optimize-${selectedSite.id}-${Date.now()}`;
    addTask({
      id: taskId,
      type: 'ai-optimization',
      title: `${t('tools.ai.title') || 'AI Image Optimization'} — ${selectedSite.name}`,
      message: `0/${imageIds.length}`,
      status: 'running',
      progress: 0,
      cancelable: false,
      metadata: { siteId: selectedSite.id },
    });
    
    // Drive processing in the background
    driveAiProcessing(selectedSite.id, taskId, imageIds, imageDataMap);
  };

  /**
   * Drive AI optimization from the platform.
   * Processes images one by one: Gemini AI → WP plugin apply.
   */
  const driveAiProcessing = useCallback(async (siteId, taskId, imageIds, imageDataMap) => {
    if (processingRef.current) return;
    processingRef.current = true;
    
    let completed = 0;
    let failed = 0;
    const total = imageIds.length;
    
    try {
      for (let i = 0; i < imageIds.length; i++) {
        if (!processingRef.current) break;
        
        const imgId = imageIds[i];
        const imgData = imageDataMap[imgId] || {};
        
        try {
          const response = await fetch(`/api/sites/${siteId}/tools/ai-optimize-image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageId: imgId,
              imageUrl: imgData.url,
              currentFilename: imgData.filename,
              applyFilename,
              applyAltText,
              language: aiLanguage,
            }),
          });
          
          if (response.ok) {
            completed++;
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
        
        const processed = completed + failed;
        const progress = Math.round((processed / total) * 100);
        
        updateTask(taskId, {
          status: 'running',
          progress,
          message: `${processed}/${total} — ${completed} ${t('tools.ai.optimized') || 'optimized'}${failed ? `, ${failed} ${t('tools.webp.failed') || 'failed'}` : ''}`,
        });
      }
      
      updateTask(taskId, {
        status: failed === total ? 'error' : 'completed',
        progress: 100,
        message: `${t('tools.ai.optimizationComplete') || 'Optimization complete'} — ${completed} ${t('tools.ai.optimized') || 'optimized'}${failed ? `, ${failed} ${t('tools.webp.failed') || 'failed'}` : ''}`,
      });
    } catch (err) {
      console.error('AI processing error:', err);
      updateTask(taskId, {
        status: 'error',
        message: err.message || 'Processing failed',
      });
    } finally {
      processingRef.current = false;
      if (applyFilename) fetchImageRedirects();
    }
  }, [updateTask, applyFilename, applyAltText, aiLanguage, fetchImageRedirects, t]);

  return {
    // Settings
    aiSettings,
    isLoadingAiSettings,
    isSavingAiSettings,
    handleUpdateAiSettings,
    // Modal
    showAiModal,
    setShowAiModal,
    aiImages,
    loadingAiImages,
    loadingMoreImages,
    aiImagesHasMore,
    loadMoreAiImages,
    selectedAiImages,
    openAiModal,
    toggleAiImageSelection,
    selectAllAiImages,
    // Optimization
    aiOptimizing,
    aiProgress,
    aiResults,
    aiError,
    setAiError,
    applyFilename,
    setApplyFilename,
    applyAltText,
    setApplyAltText,
    aiLanguage,
    setAiLanguage,
    handleAiOptimize,
    // Redirects
    imageRedirects,
    showRedirects,
    setShowRedirects,
    handleClearRedirects,
  };
}
