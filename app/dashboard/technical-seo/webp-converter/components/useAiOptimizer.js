'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSite } from '@/app/context/site-context';

export function useAiOptimizer() {
  const { selectedSite } = useSite();
  
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

  // Fetch AI images
  const fetchAiImages = useCallback(async () => {
    if (!selectedSite?.id) return;
    setLoadingAiImages(true);
    try {
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
  }, [selectedSite?.id]);

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

  // AI Optimize
  const handleAiOptimize = async () => {
    if (!selectedSite?.id || selectedAiImages.size === 0) return;
    
    setAiOptimizing(true);
    setAiError(null);
    setAiResults([]);
    
    const imageIds = Array.from(selectedAiImages);
    setAiProgress({ current: 0, total: imageIds.length });
    
    const results = [];
    
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
          results.push({ imageId: imageIds[i], success: true, ...data });
        } else {
          const data = await response.json();
          results.push({ imageId: imageIds[i], success: false, error: data.error || 'Failed' });
        }
      } catch (error) {
        results.push({ imageId: imageIds[i], success: false, error: error.message });
      }
    }
    
    setAiResults(results);
    setAiOptimizing(false);
    
    if (applyFilename) {
      await fetchImageRedirects();
    }
  };

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
