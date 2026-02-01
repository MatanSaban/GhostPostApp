'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Database, 
  Link2, 
  RefreshCw, 
  Plus, 
  Check,
  AlertCircle,
  Loader2,
  Globe,
  FileText,
  Newspaper,
  FolderKanban,
  Briefcase,
  Package,
  MoreHorizontal,
  Search,
  Pencil,
  Download,
  CloudDownload,
  CheckCircle2,
  XCircle,
  StopCircle,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useSite } from '@/app/context/site-context';
import WordPressPluginSection from '@/app/dashboard/settings/components/WordPressPluginSection';
import styles from './entities.module.css';

// Icon mapping for entity types
const ENTITY_ICONS = {
  posts: Newspaper,
  pages: FileText,
  projects: FolderKanban,
  portfolio: FolderKanban,
  services: Briefcase,
  service: Briefcase,
  products: Package,
  product: Package,
  default: Database,
};

function getIconForType(slug) {
  return ENTITY_ICONS[slug] || ENTITY_ICONS.default;
}

export default function EntitiesPage() {
  const router = useRouter();
  const { t, locale } = useLocale();
  const { selectedSite } = useSite();
  
  const [platform, setPlatform] = useState('');
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionResult, setDetectionResult] = useState(null);
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [enabledTypes, setEnabledTypes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Discovered entity types from WordPress
  const [discoveredTypes, setDiscoveredTypes] = useState([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryError, setDiscoveryError] = useState(null);
  const [editingType, setEditingType] = useState(null);
  const [populatedInfo, setPopulatedInfo] = useState(null); // { created, updated, totalEntities }

  // Entity sync state
  const [syncStatus, setSyncStatus] = useState(null); // 'NEVER' | 'SYNCING' | 'COMPLETED' | 'ERROR'
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncMessage, setSyncMessage] = useState('');
  const [syncError, setSyncError] = useState(null);
  const syncPollingRef = useRef(null);
  const hasTriggeredAutoSync = useRef(false);

  // Plugin download state
  const [isDownloadingPlugin, setIsDownloadingPlugin] = useState(false);

  // Load existing entity types on mount
  useEffect(() => {
    async function loadEntityTypes() {
      if (!selectedSite?.id) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/entities/types?siteId=${selectedSite.id}`);
        let loadedTypes = [];
        if (response.ok) {
          const data = await response.json();
          loadedTypes = data.types || [];
          setEnabledTypes(loadedTypes);
          setSelectedTypes(loadedTypes.map(t => t.slug) || []);
        }

        // Also get site platform if set
        if (selectedSite.platform) {
          setPlatform(selectedSite.platform);
          
          // If platform is set but no entity types configured, trigger discovery
          if (selectedSite.platform === 'wordpress' && loadedTypes.length === 0) {
            setIsLoading(false);
            await discoverEntityTypes();
            return;
          }
        }

        // Load initial sync status
        await checkSyncStatus();
      } catch (error) {
        console.error('Failed to load entity types:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadEntityTypes();
  }, [selectedSite?.id]);

  // Check sync status from API
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

  // Poll sync status while syncing
  useEffect(() => {
    if (syncStatus === 'SYNCING') {
      syncPollingRef.current = setInterval(async () => {
        const status = await checkSyncStatus();
        if (status && status !== 'SYNCING') {
          // Sync finished, stop polling and reload entity types
          clearInterval(syncPollingRef.current);
          syncPollingRef.current = null;
          
          // Reload entity types after sync completes
          const response = await fetch(`/api/entities/types?siteId=${selectedSite.id}`);
          if (response.ok) {
            const data = await response.json();
            setEnabledTypes(data.types || []);
          }
        }
      }, 2000); // Poll every 2 seconds
    }

    return () => {
      if (syncPollingRef.current) {
        clearInterval(syncPollingRef.current);
        syncPollingRef.current = null;
      }
    };
  }, [syncStatus, checkSyncStatus, selectedSite?.id]);

  // Auto-trigger sync after WordPress plugin connection
  useEffect(() => {
    // Only auto-sync if:
    // 1. Site is connected to WordPress
    // 2. Sync status has been loaded AND is NEVER (never synced before)
    // 3. We haven't already triggered an auto-sync this session
    if (
      selectedSite?.connectionStatus === 'CONNECTED' &&
      selectedSite?.platform === 'wordpress' &&
      (syncStatus === 'NEVER' || selectedSite?.entitySyncStatus === 'NEVER') &&
      !hasTriggeredAutoSync.current
    ) {
      hasTriggeredAutoSync.current = true;
      handlePopulateEntities();
    }
  }, [selectedSite?.connectionStatus, selectedSite?.platform, syncStatus, selectedSite?.entitySyncStatus]);

  // Populate entities from WordPress
  const handlePopulateEntities = async () => {
    if (!selectedSite?.id || syncStatus === 'SYNCING') return;

    setSyncStatus('SYNCING');
    setSyncProgress(0);
    setSyncMessage(t('entities.sync.starting'));
    setSyncError(null);

    try {
      const response = await fetch('/api/entities/populate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: selectedSite.id }),
      });

      if (!response.ok) {
        const data = await response.json();
        setSyncStatus('ERROR');
        setSyncError(data.error || t('entities.sync.failed'));
        return;
      }

      // Response is OK, status will be updated via polling
    } catch (error) {
      console.error('Failed to populate entities:', error);
      setSyncStatus('ERROR');
      setSyncError(t('entities.sync.failed'));
    }
  };

  // Stop syncing
  const handleStopSync = async () => {
    if (!selectedSite?.id || syncStatus !== 'SYNCING') return;

    try {
      const response = await fetch(`/api/entities/populate?siteId=${selectedSite.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setSyncStatus('CANCELLED');
        setSyncMessage(null);
        setSyncProgress(0);
        // Clear polling
        if (syncPollingRef.current) {
          clearInterval(syncPollingRef.current);
          syncPollingRef.current = null;
        }
      }
    } catch (error) {
      console.error('Failed to stop sync:', error);
    }
  };

  // Download WordPress plugin
  const handleDownloadPlugin = async () => {
    if (!selectedSite?.id) return;

    setIsDownloadingPlugin(true);
    try {
      const response = await fetch(`/api/sites/${selectedSite.id}/download-plugin`);
      
      if (!response.ok) {
        throw new Error('Failed to download plugin');
      }

      // Get the blob and create download link
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ghost-post-${selectedSite.id}.zip`;
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
      
      if (data.platform) {
        setPlatform(data.platform);
        setDetectionResult({ success: true, platform: data.platform });
        
        // If WordPress, automatically discover entity types
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

  // PHASE 1: Quick discovery - just find post types
  const discoverEntityTypes = async () => {
    if (!selectedSite?.id) return;

    setIsDiscovering(true);
    setDiscoveryError(null);
    setPopulatedInfo(null);

    try {
      // Use new scan endpoint for phase 1 (GET request)
      const response = await fetch(`/api/entities/scan?siteId=${selectedSite.id}`);
      const data = await response.json();

      if (data.success && data.postTypes) {
        console.log('[Discovery] Discovered types:', data.postTypes);
        setDiscoveredTypes(data.postTypes);
        // Pre-select core types and types with content
        const autoSelect = data.postTypes
          .filter(t => t.isCore || t.entityCount > 0)
          .map(t => t.slug);
        setSelectedTypes(autoSelect);
      } else {
        setDiscoveryError(data.error || t('entities.discovery.failed'));
      }
    } catch (error) {
      console.error('Discovery error:', error);
      setDiscoveryError(t('entities.discovery.failed'));
    } finally {
      setIsDiscovering(false);
    }
  };

  // PHASE 2: Populate entities after user saves selected types
  const handleSaveAndPopulate = async () => {
    if (!selectedSite?.id || selectedTypes.length === 0) return;

    setIsSaving(true);

    try {
      // First, save the entity types
      const types = selectedTypes.map(slug => {
        const discovered = discoveredTypes.find(t => t.slug === slug);
        console.log('[SaveTypes] Discovered type:', slug, discovered);
        
        // Get the proper display name based on locale
        // Priority: locale-specific name > general name > slug
        let displayName = discovered?.name || slug;
        if (locale === 'he' && discovered?.nameHe) {
          displayName = discovered.nameHe;
        }
        
        return {
          slug,
          name: displayName,
          apiEndpoint: discovered?.restEndpoint || discovered?.apiEndpoint || slug,
          sitemaps: discovered?.sitemaps || [],
          isEnabled: true,
        };
      });

      console.log('[SaveTypes] Saving types:', types);

      const saveResponse = await fetch('/api/entities/types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: selectedSite.id, types }),
      });

      if (!saveResponse.ok) {
        throw new Error('Failed to save entity types');
      }

      const saveData = await saveResponse.json();
      setEnabledTypes(saveData.types || []);
      setDiscoveredTypes([]);
      setSelectedTypes([]);

      // Now trigger Phase 2: Populate entities
      setSyncStatus('SYNCING');
      setSyncProgress(0);

      // Check if plugin is connected - use plugin API, otherwise use scan/crawl
      const isPluginConnected = selectedSite?.connectionStatus === 'CONNECTED';

      if (isPluginConnected) {
        // Use plugin-based population
        setSyncMessage(t('entities.sync.starting') || 'Starting sync...');

        const populateResponse = await fetch('/api/entities/populate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteId: selectedSite.id }),
        });

        if (!populateResponse.ok) {
          const data = await populateResponse.json();
          setSyncStatus('ERROR');
          setSyncError(data.error || t('entities.sync.failed'));
          return;
        }

        // Plugin sync started - status will be updated via polling
        // The polling effect will handle the rest
      } else {
        // Use sitemap/crawl-based population
        setSyncMessage(t('entities.sync.populatingEntities') || 'Populating entities...');

        const populateResponse = await fetch('/api/entities/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            siteId: selectedSite.id, 
            phase: 'populate',
          }),
        });

        const populateData = await populateResponse.json();

        if (populateData.success) {
          setPopulatedInfo({
            created: populateData.stats?.created || 0,
            updated: populateData.stats?.updated || 0,
            totalEntities: (populateData.stats?.created || 0) + (populateData.stats?.updated || 0),
          });
          setSyncStatus('COMPLETED');
          setSyncMessage('');
        } else {
          setSyncStatus('ERROR');
          setSyncError(populateData.error || 'Population failed');
        }
      }

      // Refresh sidebar
      router.refresh();
    } catch (error) {
      console.error('Failed to save and populate:', error);
      setSyncStatus('ERROR');
      setSyncError(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  // FULL CRAWL: Populate entities + Deep crawl (for sites without plugin)
  const handleCrawlEntities = async () => {
    if (!selectedSite?.id || syncStatus === 'SYNCING') return;

    setSyncStatus('SYNCING');
    setSyncProgress(0);
    setSyncMessage(t('entities.crawl.populating') || 'Fetching content from website...');
    setSyncError(null);

    try {
      // Phase 2: Populate entities (creates/updates from sitemap/REST API)
      const populateResponse = await fetch('/api/entities/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          siteId: selectedSite.id, 
          phase: 'populate',
        }),
      });

      const populateData = await populateResponse.json();

      if (!populateData.success) {
        setSyncStatus('ERROR');
        setSyncError(populateData.error || 'Failed to fetch content');
        return;
      }

      const totalEntities = (populateData.stats?.created || 0) + (populateData.stats?.updated || 0);
      setSyncProgress(50);
      setSyncMessage(t('entities.crawl.deepCrawling') || `Found ${totalEntities} items. Deep crawling pages...`);

      // Phase 3: Deep crawl with forceRescan to update all entities
      const crawlResponse = await fetch('/api/entities/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          siteId: selectedSite.id, 
          phase: 'crawl',
          options: { 
            batchSize: 100,
            forceRescan: true, // Always rescan all entities when user initiates a crawl
          },
        }),
      });

      const crawlData = await crawlResponse.json();

      if (crawlData.success) {
        setPopulatedInfo({
          created: populateData.stats?.created || 0,
          updated: populateData.stats?.updated || 0,
          totalEntities,
          enriched: crawlData.stats?.enriched || 0,
        });
        setSyncStatus('COMPLETED');
        setSyncMessage(
          locale === 'he'
            ? `הסריקה הושלמה! נמצאו ${totalEntities} פריטים, הועשרו ${crawlData.stats?.enriched || 0}`
            : `Crawl complete! Found ${totalEntities} items, enriched ${crawlData.stats?.enriched || 0} with metadata`
        );
      } else {
        setSyncStatus('ERROR');
        setSyncError(crawlData.error || 'Deep crawl failed');
      }

      router.refresh();
    } catch (error) {
      console.error('Crawl error:', error);
      setSyncStatus('ERROR');
      setSyncError(error.message);
    }
  };

  // PHASE 3: Deep crawl to enrich entity data
  const handleDeepCrawl = async () => {
    if (!selectedSite?.id || syncStatus === 'SYNCING') return;

    setSyncStatus('SYNCING');
    setSyncProgress(0);
    setSyncMessage(t('entities.sync.deepCrawling') || 'Deep crawling pages...');
    setSyncError(null);

    try {
      const response = await fetch('/api/entities/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          siteId: selectedSite.id, 
          phase: 'crawl',
          options: { 
            batchSize: 100,
            forceRescan: true, // Rescan all entities
          },
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSyncStatus('COMPLETED');
        setSyncMessage(`Crawled ${data.stats?.crawled || 0} pages, enriched ${data.stats?.enriched || 0}`);
      } else {
        setSyncStatus('ERROR');
        setSyncError(data.error || 'Deep crawl failed');
      }
    } catch (error) {
      console.error('Deep crawl error:', error);
      setSyncStatus('ERROR');
      setSyncError(error.message);
    }
  };

  const toggleEntityType = (slug) => {
    setSelectedTypes(prev => 
      prev.includes(slug) 
        ? prev.filter(s => s !== slug)
        : [...prev, slug]
    );
  };

  const updateTypeLabel = (slug, newLabel) => {
    setDiscoveredTypes(prev => 
      prev.map(t => 
        t.slug === slug 
          ? { ...t, name: newLabel }
          : t
      )
    );
  };

  if (!selectedSite) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <Globe className={styles.emptyIcon} />
          <h3 className={styles.emptyTitle}>{t('entities.noSiteSelected')}</h3>
          <p className={styles.emptyDescription}>{t('entities.selectSiteFirst')}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingContainer}>
          <div className={styles.loadingSpinner}></div>
          <span className={styles.loadingText}>{t('common.loading')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div className={styles.headerContent}>
          <h1 className={styles.pageTitle}>{t('entities.title')}</h1>
          <p className={styles.pageSubtitle}>{t('entities.subtitle')}</p>
        </div>
      </div>

      {/* Integration Setup Card */}
      <div className={styles.setupCard}>
        <div className={styles.setupHeader}>
          <Link2 className={styles.setupIcon} />
          <div>
            <h2 className={styles.setupTitle}>{t('entities.integration.title')}</h2>
            <p className={styles.setupDescription}>{t('entities.integration.description')}</p>
          </div>
        </div>

        {/* Site Info */}
        <div className={styles.siteInfo}>
          <Globe className={styles.siteInfoIcon} />
          <div className={styles.siteInfoContent}>
            <span className={styles.siteInfoName}>{selectedSite.name}</span>
            <span className={styles.siteInfoUrl}>{selectedSite.url}</span>
          </div>
          {platform && (
            <span className={styles.platformBadge}>
              {platform === 'wordpress' ? 'WordPress' : platform}
            </span>
          )}
        </div>

        {/* Detect Platform Button */}
        {!platform && (
          <div className={styles.detectSection}>
            <button 
              className={styles.detectButton}
              onClick={handleDetectPlatform}
              disabled={isDetecting}
            >
              {isDetecting ? (
                <>
                  <Loader2 className={styles.spinningIcon} />
                  {t('entities.detection.detecting')}
                </>
              ) : (
                <>
                  <RefreshCw />
                  {t('entities.detection.detect')}
                </>
              )}
            </button>
            
            {detectionResult && !detectionResult.success && (
              <div className={styles.errorMessage}>
                <AlertCircle />
                <span>{detectionResult.error}</span>
              </div>
            )}
          </div>
        )}

        {/* Platform Detected - Show Entity Type Selection */}
        {platform && (
          <div className={styles.entityTypesSection}>
            {/* Discovering state */}
            {isDiscovering && (
              <div className={styles.discoveringState}>
                <Loader2 className={styles.spinningIcon} />
                <span>{t('entities.discovery.scanning')}</span>
              </div>
            )}

            {/* Discovery error */}
            {discoveryError && (
              <div className={styles.errorMessage}>
                <AlertCircle />
                <span>{discoveryError}</span>
                <button 
                  className={styles.retryButton}
                  onClick={discoverEntityTypes}
                >
                  {t('common.retry')}
                </button>
              </div>
            )}

            {/* Discovered types (during discovery flow) */}
            {!isDiscovering && discoveredTypes.length > 0 && (
              <>
                <h3 className={styles.sectionTitle}>{t('entities.types.select')}</h3>
                <p className={styles.sectionDescription}>
                  {t('entities.discovery.found', { count: discoveredTypes.length })}
                </p>

                {/* Show populated entities info */}
                {populatedInfo && populatedInfo.totalEntities > 0 && (
                  <div className={styles.populatedInfo}>
                    <CheckCircle2 className={styles.populatedIcon} />
                    <span>
                      {locale === 'he' 
                        ? `נמצאו ${populatedInfo.totalEntities} פריטי תוכן מהאתר`
                        : `Found ${populatedInfo.totalEntities} content items from sitemap`}
                    </span>
                  </div>
                )}

                <div className={styles.entityTypeGrid}>
                  {discoveredTypes.map((entityType) => {
                    const Icon = getIconForType(entityType.slug);
                    const isSelected = selectedTypes.includes(entityType.slug);
                    const isEnabled = enabledTypes.some(t => t.slug === entityType.slug);
                    const isEditing = editingType === entityType.slug;
                    // Always fallback to name, then slug as last resort
                    const displayName = (locale === 'he' ? entityType.nameHe : entityType.name) || entityType.name || entityType.slug;
                    const entityCount = entityType.entityCount || 0;

                    return (
                      <div
                        key={entityType.slug}
                        className={`${styles.entityTypeCard} ${isSelected ? styles.selected : ''} ${isEnabled ? styles.enabled : ''}`}
                        title={entityType.description}
                      >
                        <div 
                          className={styles.entityTypeContent}
                          onClick={() => !isEditing && toggleEntityType(entityType.slug)}
                        >
                          <Icon className={styles.entityTypeIcon} />
                          {isEditing ? (
                            <input
                              type="text"
                              className={styles.entityTypeInput}
                              value={displayName}
                              onChange={(e) => updateTypeLabel(entityType.slug, e.target.value)}
                              onBlur={() => setEditingType(null)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') setEditingType(null);
                                if (e.key === 'Escape') setEditingType(null);
                              }}
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <span className={styles.entityTypeName}>{displayName}</span>
                          )}
                          {entityCount > 0 && (
                            <span className={styles.entityCountBadge}>{entityCount}</span>
                          )}
                          {entityType.isCore && (
                            <span className={styles.coreTypeBadge}>Core</span>
                          )}
                          {isSelected && <Check className={styles.checkIcon} />}
                        </div>
                        <button
                          className={styles.editTypeButton}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingType(isEditing ? null : entityType.slug);
                          }}
                          title={t('common.edit')}
                        >
                          <Pencil />
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className={styles.saveSection}>
                  <button
                    className={styles.saveButton}
                    onClick={handleSaveAndPopulate}
                    disabled={isSaving || selectedTypes.length === 0}
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className={styles.spinningIcon} />
                        {syncMessage || t('entities.sync.populatingEntities') || 'Populating...'}
                      </>
                    ) : (
                      <>
                        <CloudDownload />
                        {t('entities.types.saveAndPopulate') || 'Save & Populate Entities'}
                      </>
                    )}
                  </button>
                  <p className={styles.saveHint}>
                    {locale === 'he' 
                      ? `${selectedTypes.length} סוגי תוכן נבחרו`
                      : `${selectedTypes.length} content types selected`}
                  </p>
                </div>
              </>
            )}

            {/* Show enabled types (after discovery is saved) */}
            {!isDiscovering && discoveredTypes.length === 0 && enabledTypes.length > 0 && !discoveryError && (
              <>
                <div className={styles.enabledTypesHeader}>
                  <div>
                    <h3 className={styles.sectionTitle}>{t('entities.types.configured') || 'Configured Content Types'}</h3>
                    <p className={styles.sectionDescription}>
                      {locale === 'he' 
                        ? `${enabledTypes.length} סוגי תוכן מוגדרים לסנכרון`
                        : `${enabledTypes.length} content types configured for sync`}
                    </p>
                  </div>
                  <button 
                    className={styles.rescanButton}
                    onClick={discoverEntityTypes}
                  >
                    <RefreshCw size={16} />
                    {t('entities.discovery.rescan') || 'Rescan'}
                  </button>
                </div>

                <div className={styles.entityTypeGrid}>
                  {enabledTypes.map((entityType) => {
                    const Icon = getIconForType(entityType.slug);
                    const displayName = entityType.name || entityType.slug;

                    return (
                      <Link
                        key={entityType.id}
                        href={`/dashboard/entities/${entityType.slug}`}
                        className={`${styles.entityTypeCard} ${styles.enabled}`}
                      >
                        <div className={styles.entityTypeContent}>
                          <Icon className={styles.entityTypeIcon} />
                          <span className={styles.entityTypeName}>{displayName}</span>
                          <CheckCircle2 className={styles.enabledIcon} />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </>
            )}

            {/* No types discovered AND no enabled types - Manual scan button */}
            {!isDiscovering && discoveredTypes.length === 0 && enabledTypes.length === 0 && !discoveryError && (
              <div className={styles.noTypesState}>
                <Search className={styles.noTypesIcon} />
                <h4>{t('entities.discovery.noTypes')}</h4>
                <p>{t('entities.discovery.noTypesDescription')}</p>
                <button 
                  className={styles.discoverButton}
                  onClick={discoverEntityTypes}
                >
                  <RefreshCw />
                  {t('entities.discovery.scan')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* WordPress Plugin Section - Shows when WordPress is detected */}
      {platform === 'wordpress' && (
        <div className={styles.pluginCard}>
          <div className={styles.pluginHeader}>
            <Link2 className={styles.pluginIcon} />
            <div>
              <h3 className={styles.sectionTitle}>{t('entities.plugin.title')}</h3>
              <p className={styles.pluginDescription}>
                {t('entities.plugin.description')}
              </p>
            </div>
          </div>
          
          {/* Show enabled post types */}
          {enabledTypes.length > 0 && (
            <div className={styles.enabledTypesPreview}>
              <span className={styles.enabledTypesLabel}>
                {locale === 'he' ? 'סוגי תוכן נבחרים:' : 'Selected content types:'}
              </span>
              <div className={styles.enabledTypesBadges}>
                {enabledTypes.map((type) => {
                  const Icon = getIconForType(type.slug);
                  return (
                    <span key={type.id} className={styles.typeBadgeSmall}>
                      <Icon size={14} />
                      {type.name}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
          
          <WordPressPluginSection
            translations={{
              wordpress: {
                title: t('entities.plugin.title'),
                connected: t('settings.wordpress.connected') || 'Connected',
                notConnected: t('settings.wordpress.notConnected') || 'Not Connected',
                connecting: t('settings.wordpress.connecting') || 'Connecting...',
                disconnected: t('settings.wordpress.disconnected') || 'Disconnected',
                error: t('settings.wordpress.error') || 'Error',
                connectedDesc: t('entities.plugin.connectedDesc') || 'Plugin is active and syncing content',
                notConnectedDesc: t('entities.plugin.notConnectedDesc') || 'Install the plugin for automatic content sync',
                downloadPlugin: t('entities.plugin.download') || 'Download Plugin',
                downloading: t('entities.plugin.downloading') || 'Downloading...',
                howToInstall: t('entities.plugin.instructions.title') || 'How to Install',
                step1: t('entities.plugin.instructions.step1') || 'Download the plugin ZIP file',
                step2: t('entities.plugin.instructions.step2') || 'Go to WordPress → Plugins → Add New → Upload',
                step3: t('entities.plugin.instructions.step3') || 'Upload the ZIP file and click Install',
                step4: t('entities.plugin.instructions.step4') || 'Activate the plugin',
                disconnect: t('settings.wordpress.disconnect') || 'Disconnect',
                disconnecting: t('settings.wordpress.disconnecting') || 'Disconnecting...',
                disconnectConfirm: t('settings.wordpress.disconnectConfirm'),
              },
            }}
            compact={true}
            showInstructions={true}
            onConnectionChange={() => {
              // Refresh to get new connection status
              router.refresh();
            }}
          />
        </div>
      )}

      {/* Entity Scan/Crawl Section - Shows after entity types are enabled */}
      {platform === 'wordpress' && enabledTypes.length > 0 && (
        <div className={styles.syncCard}>
          <div className={styles.syncHeader}>
            <CloudDownload className={styles.syncIcon} />
            <div className={styles.syncHeaderContent}>
              <h3 className={styles.sectionTitle}>
                {t('entities.crawl.title') || 'Crawl Website'}
              </h3>
              <p className={styles.syncDescription}>
                {selectedSite?.connectionStatus === 'CONNECTED'
                  ? (t('entities.crawl.descriptionConnected') || 'Sync content directly from your WordPress site using the plugin.')
                  : (t('entities.crawl.description') || 'Crawl your website to import content including titles, meta descriptions, and SEO data.')}
              </p>
            </div>
          </div>

          {/* Sync Status Indicator */}
          {syncStatus === 'SYNCING' && (
            <div className={styles.syncProgress}>
              <div className={styles.syncProgressHeader}>
                <Loader2 className={styles.spinningIcon} />
                <span className={styles.syncProgressText}>
                  {syncMessage || t('entities.sync.syncing')}
                </span>
                <span className={styles.syncProgressPercent}>{Math.round(syncProgress)}%</span>
              </div>
              <div className={styles.syncProgressBar}>
                <div 
                  className={styles.syncProgressFill} 
                  style={{ width: `${syncProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Sync Completed */}
          {syncStatus === 'COMPLETED' && (
            <div className={styles.syncSuccess}>
              <CheckCircle2 className={styles.syncSuccessIcon} />
              <span>{syncMessage || t('entities.sync.completed')}</span>
            </div>
          )}

          {/* Sync Cancelled */}
          {syncStatus === 'CANCELLED' && (
            <div className={styles.syncCancelled}>
              <AlertCircle className={styles.syncCancelledIcon} />
              <span>{t('entities.sync.cancelled')}</span>
            </div>
          )}

          {/* Sync Error */}
          {syncStatus === 'ERROR' && (
            <div className={styles.syncError}>
              <XCircle className={styles.syncErrorIcon} />
              <span>{syncError || t('entities.sync.failed')}</span>
            </div>
          )}

          {/* Crawl Button - Single unified button */}
          <div className={styles.syncActions}>
            {syncStatus === 'SYNCING' ? (
              <button
                className={`${styles.syncButton} ${styles.stopButton}`}
                onClick={handleStopSync}
              >
                <StopCircle />
                {t('entities.sync.stop')}
              </button>
            ) : (
              <button
                className={styles.syncButton}
                onClick={selectedSite?.connectionStatus === 'CONNECTED' ? handlePopulateEntities : handleCrawlEntities}
              >
                {syncStatus === 'COMPLETED' || syncStatus === 'ERROR' || syncStatus === 'CANCELLED' ? (
                  <>
                    <RefreshCw />
                    {t('entities.crawl.rescan') || 'Scan Again'}
                  </>
                ) : (
                  <>
                    <Search />
                    {t('entities.crawl.scan') || 'Scan Website'}
                  </>
                )}
              </button>
            )}
            {syncStatus === 'COMPLETED' && selectedSite?.lastEntitySyncAt && (
              <span className={styles.lastSyncTime}>
                {t('entities.sync.lastSync')}: {new Date(selectedSite.lastEntitySyncAt).toLocaleString(locale)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Enabled Entity Types List */}
      {enabledTypes.length > 0 && (
        <div className={styles.enabledTypesCard}>
          <h3 className={styles.sectionTitle}>{t('entities.types.enabled')}</h3>
          <div className={styles.enabledTypesList}>
            {enabledTypes.map((type) => (
              <Link
                key={type.id}
                href={`/dashboard/entities/${type.slug}`}
                className={styles.enabledTypeItem}
              >
                <Database className={styles.enabledTypeIcon} />
                <span className={styles.enabledTypeName}>{type.name}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
