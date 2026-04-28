'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSite } from '@/app/context/site-context';
import { useBackgroundTasks } from '@/app/context/background-tasks-context';
import { useLocale } from '@/app/context/locale-context';
import { handleLimitError } from '@/app/context/limit-guard-context';

export function useEntities() {
  const router = useRouter();
  const { t, locale } = useLocale();
  const { selectedSite, isLoading: isSiteLoading, refreshSites } = useSite();
  const { addTask, updateTask, getTask, cancelTask } = useBackgroundTasks();

  // Core state
  const [platform, setPlatform] = useState('');
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionResult, setDetectionResult] = useState(null);
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [enabledTypes, setEnabledTypes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Discovery state
  const [discoveredTypes, setDiscoveredTypes] = useState([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryError, setDiscoveryError] = useState(null);
  const [editingType, setEditingType] = useState(null);
  const [populatedInfo, setPopulatedInfo] = useState(null);

  // Sitemap state
  const [sitemapNotFound, setSitemapNotFound] = useState(false);
  const [customSitemapUrl, setCustomSitemapUrl] = useState('');
  const [isCrawling, setIsCrawling] = useState(false);

  // Sync state
  const [syncStatus, setSyncStatus] = useState(null);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncMessage, setSyncMessage] = useState('');
  const [syncError, setSyncError] = useState(null);
  const syncPollingRef = useRef(null);

  // Plugin download state
  const [isDownloadingPlugin, setIsDownloadingPlugin] = useState(false);

  // Check sync status
  const checkSyncStatus = useCallback(async () => {
    if (!selectedSite?.id) return null;
    try {
      const response = await fetch(`/api/entities/populate?siteId=${selectedSite.id}`);
      if (response.ok) {
        const data = await response.json();
        setSyncStatus(data.status);
        setSyncProgress(data.progress || 0);
        setSyncMessage(data.message || '');
        setSyncError(data.error || null);
        return data.status;
      }
    } catch (error) {
      console.error('Failed to check sync status:', error);
    }
    return null;
  }, [selectedSite?.id]);

  // Load entity types on mount
  useEffect(() => {
    async function loadEntityTypes() {
      if (!selectedSite?.id) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/entities/types?siteId=${selectedSite.id}`);
        if (response.ok) {
          const data = await response.json();
          setEnabledTypes(data.types || []);
          setSelectedTypes((data.types || []).map(t => t.slug));
        }
        if (selectedSite.platform) {
          setPlatform(selectedSite.platform);
        }
        await checkSyncStatus();
      } catch (error) {
        console.error('Failed to load entity types:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadEntityTypes();
  }, [selectedSite?.id, selectedSite?.platform, checkSyncStatus]);

  // Poll sync status while syncing (covers: page load during active sync, or user-triggered sync)
  useEffect(() => {
    if (syncStatus === 'SYNCING') {
      syncPollingRef.current = setInterval(async () => {
        const status = await checkSyncStatus();
        if (status && status !== 'SYNCING') {
          clearInterval(syncPollingRef.current);
          syncPollingRef.current = null;
          const response = await fetch(`/api/entities/types?siteId=${selectedSite.id}`);
          if (response.ok) {
            const data = await response.json();
            setEnabledTypes(data.types || []);
          }
        }
      }, 1500);
    }
    return () => {
      if (syncPollingRef.current) {
        clearInterval(syncPollingRef.current);
        syncPollingRef.current = null;
      }
    };
  }, [syncStatus, checkSyncStatus, selectedSite?.id]);

  // Detect platform
  const handleDetectPlatform = async () => {
    if (!selectedSite?.url) return;
    setIsDetecting(true);
    setDetectionResult(null);
    setDiscoveredTypes([]);
    setDiscoveryError(null);

    try {
      const response = await fetch('/api/entities/detect-platform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: selectedSite.id }),
      });
      const data = await response.json();

      if (!response.ok && handleLimitError(data)) {
        setIsDetecting(false);
        return;
      }

      if (data.platform) {
        setPlatform(data.platform);
        setDetectionResult({ success: true, platform: data.platform });
        // Notify onboarding tour that platform detection finished.
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('ghostpost:onboarding:platform-detected'));
        }
        // Refresh site context so other pages see the updated platform
        refreshSites();
        if (data.platform === 'wordpress') {
          await discoverEntityTypes();
        }
      } else {
        setDetectionResult({ success: false, error: data.error || t('entities.detection.failed') });
      }
    } catch (error) {
      setDetectionResult({ success: false, error: t('entities.detection.failed') });
    } finally {
      setIsDetecting(false);
    }
  };

  // Discover entity types
  const discoverEntityTypes = async (sitemapUrl = null) => {
    if (!selectedSite?.id) return;
    setIsDiscovering(true);
    setDiscoveryError(null);
    setPopulatedInfo(null);
    setSitemapNotFound(false);

    try {
      let url = `/api/entities/scan?siteId=${selectedSite.id}`;
      if (sitemapUrl) url += `&sitemapUrl=${encodeURIComponent(sitemapUrl)}`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (data.success && data.postTypes) {
        setDiscoveredTypes(data.postTypes);
        const autoSelect = data.postTypes
          .filter(t => t.isCore || t.entityCount > 0)
          .map(t => t.slug);
        setSelectedTypes(autoSelect);
        if (data.source?.sitemapNotFound) setSitemapNotFound(true);
        if (typeof window !== 'undefined' && data.postTypes.length > 0) {
          window.dispatchEvent(new CustomEvent('ghostpost:onboarding:entities-discovered'));
        }
      } else if (data.source?.sitemapNotFound) {
        setSitemapNotFound(true);
      } else {
        setDiscoveryError(data.error || t('entities.discovery.failed'));
      }
    } catch (error) {
      setDiscoveryError(t('entities.discovery.failed'));
    } finally {
      setIsDiscovering(false);
    }
  };

  // Discover by crawling
  const discoverByCrawling = async () => {
    if (!selectedSite?.id) return;
    setIsCrawling(true);
    setDiscoveryError(null);
    setPopulatedInfo(null);
    setSitemapNotFound(false);

    try {
      const response = await fetch('/api/entities/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          siteId: selectedSite.id, 
          phase: 'discover-crawl',
          options: { maxPages: 100 },
        }),
      });
      const data = await response.json();

      if (!response.ok && handleLimitError(data)) {
        setIsCrawling(false);
        return;
      }

      if (data.success && data.postTypes) {
        setDiscoveredTypes(data.postTypes);
        const autoSelect = data.postTypes
          .filter(t => t.isCore || t.entityCount > 0)
          .map(t => t.slug);
        setSelectedTypes(autoSelect);
        if (typeof window !== 'undefined' && data.postTypes.length > 0) {
          window.dispatchEvent(new CustomEvent('ghostpost:onboarding:entities-discovered'));
        }
      } else {
        setDiscoveryError(data.error || t('entities.discovery.crawlFailed'));
      }
    } catch (error) {
      setDiscoveryError(t('entities.discovery.crawlFailed'));
    } finally {
      setIsCrawling(false);
    }
  };

  // Handle custom sitemap submit
  const handleCustomSitemapSubmit = async () => {
    if (!customSitemapUrl.trim()) return;
    await discoverEntityTypes(customSitemapUrl.trim());
  };

  // Toggle entity type selection
  const toggleEntityType = (slug) => {
    setSelectedTypes(prev =>
      prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]
    );
  };

  // Update type label
  const updateTypeLabel = (slug, newLabel) => {
    setDiscoveredTypes(prev =>
      prev.map(t => t.slug === slug ? { ...t, name: newLabel } : t)
    );
  };

  // Save and populate
  const handleSaveAndPopulate = async () => {
    if (!selectedSite?.id || selectedTypes.length === 0) return;
    setIsSaving(true);

    try {
      const types = selectedTypes.map(slug => {
        const discovered = discoveredTypes.find(t => t.slug === slug);
        let displayName = discovered?.name || slug;
        if (locale === 'he' && discovered?.nameHe) displayName = discovered.nameHe;
        return {
          slug,
          name: discovered?.name || displayName,
          nameHe: discovered?.nameHe || null,
          labels: discovered?.labels || null,
          apiEndpoint: discovered?.restEndpoint || discovered?.apiEndpoint || slug,
          sitemaps: discovered?.sitemaps || [],
          isEnabled: true,
        };
      });

      const saveResponse = await fetch('/api/entities/types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: selectedSite.id, types }),
      });

      if (!saveResponse.ok) throw new Error('Failed to save entity types');

      const saveData = await saveResponse.json();
      setEnabledTypes(saveData.types || []);
      setDiscoveredTypes([]);
      setSelectedTypes([]);

      // Notify onboarding tour that populate kicked off - the background task
      // runs independently; the tour should advance without waiting for sync.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ghostpost:onboarding:entities-populate-started'));
      }

      const isPluginConnected = selectedSite?.connectionStatus === 'CONNECTED';
      if (isPluginConnected) {
        const taskId = `entity-populate-${selectedSite.id}`;
        addTask({
          id: taskId,
          type: 'entity-populate',
          title: t('backgroundTasks.entityPopulate.title') || 'Syncing WordPress Content',
          message: t('backgroundTasks.entityPopulate.starting') || 'Starting WordPress sync...',
          status: 'running',
          progress: 0,
          metadata: { siteId: selectedSite.id, siteName: selectedSite.name },
        });
        setSyncStatus('SYNCING');
        setSyncProgress(0);
        setSyncMessage(t('entities.sync.starting') || 'Starting sync...');
        setIsSaving(false);
        runBackgroundPopulate(taskId, selectedSite.id);
      } else {
        const taskId = `entity-population-${selectedSite.id}`;
        addTask({
          id: taskId,
          type: 'entity-population',
          title: t('backgroundTasks.entityPopulation.title') || 'Populating Entities',
          message: t('backgroundTasks.entityPopulation.starting') || 'Starting entity population...',
          status: 'running',
          progress: 0,
          metadata: { siteId: selectedSite.id, siteName: selectedSite.name },
        });
        setSyncStatus('SYNCING');
        setSyncProgress(0);
        setSyncMessage(t('entities.sync.starting') || 'Starting sync...');
        setIsSaving(false);
        runBackgroundPopulation(taskId, selectedSite.id);
      }
      router.refresh();
    } catch (error) {
      console.error('Failed to save and populate:', error);
      setSyncStatus('ERROR');
      setSyncError(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Background populate (connected WordPress)
  const runBackgroundPopulate = async (taskId, siteId) => {
    try {
      updateTask(taskId, { 
        message: t('backgroundTasks.entityPopulate.syncing') || 'Syncing content from WordPress...',
        progress: 5,
      });
      setSyncProgress(5);
      setSyncMessage(t('backgroundTasks.entityPopulate.syncing') || 'Syncing content from WordPress...');

      const pollInterval = setInterval(async () => {
        try {
          const statusResponse = await fetch(`/api/entities/populate?siteId=${siteId}`);
          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            if (statusData.status === 'SYNCING' && statusData.progress > 0) {
              updateTask(taskId, { progress: statusData.progress, message: statusData.message });
              setSyncProgress(statusData.progress);
              setSyncMessage(statusData.message || '');
            }
          }
        } catch (e) {}
      }, 1000);

      const response = await fetch('/api/entities/populate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId }),
      });
      clearInterval(pollInterval);
      const data = await response.json();

      if (!response.ok) {
        updateTask(taskId, { status: 'error', message: data.error || 'Sync failed' });
        setSyncStatus('ERROR');
        setSyncError(data.error || t('entities.sync.failed'));
        return;
      }

      const created = data.stats?.created || 0;
      const updated = data.stats?.updated || 0;
      updateTask(taskId, { 
        status: 'completed',
        message: t('entities.sync.completedWithCount').replace('{count}', created + updated),
        progress: 100,
      });
      setSyncStatus('COMPLETED');
      setSyncProgress(100);
      setSyncMessage(null);
      setPopulatedInfo({ created, updated, totalEntities: created + updated });

      const typesResponse = await fetch(`/api/entities/types?siteId=${siteId}`);
      if (typesResponse.ok) {
        const typesData = await typesResponse.json();
        setEnabledTypes(typesData.types || []);
      }
      router.refresh();
    } catch (error) {
      updateTask(taskId, { status: 'error', message: error.message });
      setSyncStatus('ERROR');
      setSyncError(t('entities.sync.failed'));
    }
  };

  // Background population (sitemap/crawl)
  const runBackgroundPopulation = async (taskId, siteId) => {
    try {
      updateTask(taskId, { 
        message: t('backgroundTasks.entityPopulation.deepCrawling') || 'Crawling pages and extracting content...',
        progress: 10,
      });

      // Poll sync progress from the server while the crawl runs
      const pollInterval = setInterval(async () => {
        try {
          const statusResponse = await fetch(`/api/entities/populate?siteId=${siteId}`);
          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            if (statusData.status === 'SYNCING' && statusData.progress > 0) {
              updateTask(taskId, { progress: statusData.progress, message: statusData.message });
              setSyncProgress(statusData.progress);
              setSyncMessage(statusData.message || '');
            }
          }
        } catch (e) {}
      }, 1000);

      const crawlResponse = await fetch('/api/entities/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          siteId, 
          phase: 'crawl',
          options: { batchSize: 100, forceRescan: true, createFromSitemap: true },
        }),
      });
      clearInterval(pollInterval);
      const crawlData = await crawlResponse.json();

      if (!crawlResponse.ok && handleLimitError(crawlData)) {
        updateTask(taskId, { status: 'error', message: crawlData.error || 'Ai-GCoin limit reached' });
        setSyncStatus('ERROR');
        setSyncError(crawlData.error || 'Ai-GCoin limit reached');
        return;
      }

      if (crawlData.success) {
        updateTask(taskId, { status: 'completed', progress: 100, message: 'Complete!' });
        setSyncStatus('COMPLETED');
        setSyncProgress(100);
        setSyncMessage(null);
        setPopulatedInfo({
          created: crawlData.stats?.created || 0,
          updated: crawlData.stats?.updated || 0,
          totalEntities: crawlData.stats?.crawled || 0,
        });

        const typesResponse = await fetch(`/api/entities/types?siteId=${siteId}`);
        if (typesResponse.ok) {
          const typesData = await typesResponse.json();
          setEnabledTypes(typesData.types || []);
        }
        router.refresh();
      } else {
        updateTask(taskId, { status: 'error', message: crawlData.error || 'Crawl failed' });
        setSyncStatus('ERROR');
        setSyncError(crawlData.error || 'Crawl failed');
      }
    } catch (error) {
      updateTask(taskId, { status: 'error', message: error.message });
      setSyncStatus('ERROR');
      setSyncError(error.message);
    }
  };

  // Populate entities (connected sites)
  const handlePopulateEntities = async () => {
    if (!selectedSite?.id || syncStatus === 'SYNCING') return;
    const existingTask = getTask(`entity-populate-${selectedSite.id}`);
    if (existingTask?.status === 'running') return;

    const taskId = `entity-populate-${selectedSite.id}`;
    addTask({
      id: taskId,
      type: 'entity-populate',
      title: t('backgroundTasks.entityPopulate.title') || 'Syncing WordPress Content',
      message: t('backgroundTasks.entityPopulate.starting') || 'Starting WordPress sync...',
      status: 'running',
      progress: 0,
      metadata: { siteId: selectedSite.id, siteName: selectedSite.name },
    });
    setSyncStatus('SYNCING');
    setSyncProgress(0);
    setSyncMessage(t('entities.sync.starting'));
    setSyncError(null);
    runBackgroundPopulate(taskId, selectedSite.id);
  };

  // Crawl entities (non-connected sites)
  const handleCrawlEntities = async () => {
    if (!selectedSite?.id) return;
    const existingTask = getTask(`entity-crawl-${selectedSite.id}`);
    if (existingTask?.status === 'running') return;

    const taskId = `entity-crawl-${selectedSite.id}`;
    addTask({
      id: taskId,
      type: 'entity-crawl',
      title: t('backgroundTasks.entityCrawl.title') || 'Crawling Website',
      message: t('backgroundTasks.entityCrawl.starting') || 'Starting website crawl...',
      status: 'running',
      progress: 0,
      metadata: { siteId: selectedSite.id, siteName: selectedSite.name },
    });
    setSyncStatus('SYNCING');
    setSyncProgress(0);
    setSyncMessage(t('entities.sync.starting') || 'Starting sync...');
    setSyncError(null);
    runBackgroundCrawl(taskId, selectedSite.id);
  };

  // Background crawl runner
  const runBackgroundCrawl = async (taskId, siteId) => {
    try {
      updateTask(taskId, { message: 'Fetching content...', progress: 10 });

      // Poll sync progress from the server
      const pollInterval = setInterval(async () => {
        try {
          const statusResponse = await fetch(`/api/entities/populate?siteId=${siteId}`);
          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            if (statusData.status === 'SYNCING' && statusData.progress > 0) {
              updateTask(taskId, { progress: statusData.progress, message: statusData.message });
              setSyncProgress(statusData.progress);
              setSyncMessage(statusData.message || '');
            }
          }
        } catch (e) {}
      }, 1000);

      const populateResponse = await fetch('/api/entities/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId, phase: 'populate' }),
      });
      clearInterval(pollInterval);
      const populateData = await populateResponse.json();

      if (!populateResponse.ok && handleLimitError(populateData)) {
        updateTask(taskId, { status: 'error', message: populateData.error || 'Ai-GCoin limit reached' });
        setSyncStatus('ERROR');
        setSyncError(populateData.error || 'Ai-GCoin limit reached');
        return;
      }

      if (!populateData.success) {
        updateTask(taskId, { status: 'error', message: populateData.error || 'Failed' });
        setSyncStatus('ERROR');
        setSyncError(populateData.error || 'Failed');
        return;
      }

      const total = (populateData.stats?.created || 0) + (populateData.stats?.updated || 0);

      setSyncStatus('COMPLETED');
      setSyncProgress(100);
      setSyncMessage(null);
      setPopulatedInfo({
        created: populateData.stats?.created || 0,
        updated: populateData.stats?.updated || 0,
        totalEntities: total,
      });
      updateTask(taskId, { status: 'completed', progress: 100, message: `Complete! ${total} items` });

      const typesResponse = await fetch(`/api/entities/types?siteId=${siteId}`);
      if (typesResponse.ok) {
        const typesData = await typesResponse.json();
        setEnabledTypes(typesData.types || []);
      }
      router.refresh();
    } catch (error) {
      updateTask(taskId, { status: 'error', message: error.message });
      setSyncStatus('ERROR');
      setSyncError(error.message);
    }
  };

  // Stop sync
  const handleStopSync = async () => {
    if (!selectedSite?.id || syncStatus !== 'SYNCING') return;
    try {
      const response = await fetch(`/api/entities/populate?siteId=${selectedSite.id}`, { method: 'DELETE' });
      if (response.ok) {
        setSyncStatus('CANCELLED');
        setSyncMessage(null);
        setSyncProgress(0);
        if (syncPollingRef.current) {
          clearInterval(syncPollingRef.current);
          syncPollingRef.current = null;
        }
      }
    } catch (error) {
      console.error('Failed to stop sync:', error);
    }
  };

  // Download plugin
  const handleDownloadPlugin = async () => {
    if (!selectedSite?.id) return;
    setIsDownloadingPlugin(true);
    try {
      const response = await fetch(`/api/sites/${selectedSite.id}/download-plugin`);
      if (!response.ok) throw new Error('Failed to download plugin');
      // Read filename from server's Content-Disposition (preferring the
      // RFC 5987 UTF-8 form) so Hebrew / non-Latin site names render
      // correctly instead of being replaced by the site id.
      const cd = response.headers.get('Content-Disposition') || '';
      const utf8Match = cd.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
      const legacyMatch = cd.match(/filename(?!\*)\s*=\s*"?([^";]+)"?/i);
      let downloadName = `ghostseo-${selectedSite.id}.zip`;
      if (utf8Match?.[1]) {
        try { downloadName = decodeURIComponent(utf8Match[1]); }
        catch { downloadName = utf8Match[1]; }
      } else if (legacyMatch?.[1]) {
        downloadName = legacyMatch[1];
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to download plugin:', error);
    } finally {
      setIsDownloadingPlugin(false);
    }
  };

  return {
    // Core
    selectedSite,
    isSiteLoading,
    isLoading,
    locale,
    router,
    // Platform
    platform,
    isDetecting,
    detectionResult,
    handleDetectPlatform,
    // Entity types
    enabledTypes,
    selectedTypes,
    discoveredTypes,
    isDiscovering,
    discoveryError,
    editingType,
    setEditingType,
    populatedInfo,
    toggleEntityType,
    updateTypeLabel,
    // Sitemap
    sitemapNotFound,
    customSitemapUrl,
    setCustomSitemapUrl,
    isCrawling,
    handleCustomSitemapSubmit,
    discoverByCrawling,
    discoverEntityTypes,
    // Save
    isSaving,
    handleSaveAndPopulate,
    // Sync
    syncStatus,
    syncProgress,
    syncMessage,
    syncError,
    handlePopulateEntities,
    handleCrawlEntities,
    handleStopSync,
    // Plugin
    isDownloadingPlugin,
    handleDownloadPlugin,
  };
}
