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

  const discoverEntityTypes = async () => {
    if (!selectedSite?.id) return;

    setIsDiscovering(true);
    setDiscoveryError(null);

    try {
      const response = await fetch('/api/entities/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: selectedSite.id }),
      });

      const data = await response.json();

      if (data.success && data.entityTypes) {
        setDiscoveredTypes(data.entityTypes);
        // Pre-select core types
        const coreTypes = data.entityTypes
          .filter(t => t.isCore)
          .map(t => t.slug);
        setSelectedTypes(coreTypes);
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
          ? { ...t, name: newLabel, nameHe: newLabel }
          : t
      )
    );
  };

  const handleSaveTypes = async () => {
    if (!selectedSite?.id || selectedTypes.length === 0) return;

    setIsSaving(true);

    try {
      const types = selectedTypes.map(slug => {
        const discovered = discoveredTypes.find(t => t.slug === slug);
        return {
          slug,
          name: discovered ? (locale === 'he' ? discovered.nameHe : discovered.name) : slug,
          apiEndpoint: discovered?.apiEndpoint || slug,
        };
      });

      const response = await fetch('/api/entities/types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: selectedSite.id, types }),
      });

      if (response.ok) {
        const data = await response.json();
        setEnabledTypes(data.types || []);
        setDiscoveredTypes([]);
        setSelectedTypes([]);
        // Trigger sidebar refresh
        router.refresh();
      }
    } catch (error) {
      console.error('Failed to save entity types:', error);
    } finally {
      setIsSaving(false);
    }
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

            {/* Discovered types */}
            {!isDiscovering && discoveredTypes.length > 0 && (
              <>
                <h3 className={styles.sectionTitle}>{t('entities.types.select')}</h3>
                <p className={styles.sectionDescription}>
                  {t('entities.discovery.found', { count: discoveredTypes.length })}
                </p>

                <div className={styles.entityTypeGrid}>
                  {discoveredTypes.map((entityType) => {
                    const Icon = getIconForType(entityType.slug);
                    const isSelected = selectedTypes.includes(entityType.slug);
                    const isEnabled = enabledTypes.some(t => t.slug === entityType.slug);
                    const isEditing = editingType === entityType.slug;
                    const displayName = locale === 'he' ? entityType.nameHe : entityType.name;

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
                    onClick={handleSaveTypes}
                    disabled={isSaving || selectedTypes.length === 0}
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className={styles.spinningIcon} />
                        {t('common.saving')}
                      </>
                    ) : (
                      <>
                        <Plus />
                        {t('entities.types.save')}
                      </>
                    )}
                  </button>
                </div>
              </>
            )}

            {/* No types discovered - Manual scan button */}
            {!isDiscovering && discoveredTypes.length === 0 && !discoveryError && (
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

      {/* WordPress Plugin Section */}
      {platform === 'wordpress' && enabledTypes.length > 0 && (
        <div className={styles.pluginCard}>
          <div className={styles.pluginHeader}>
            <Download className={styles.pluginIcon} />
            <h3 className={styles.sectionTitle}>{t('entities.plugin.title')}</h3>
          </div>
          <p className={styles.pluginDescription}>
            {t('entities.plugin.description')}
          </p>
          <div className={styles.pluginInstructions}>
            <h4 className={styles.pluginInstructionsTitle}>{t('entities.plugin.instructions.title')}</h4>
            <ol className={styles.pluginSteps}>
              <li>{t('entities.plugin.instructions.step1')}</li>
              <li>{t('entities.plugin.instructions.step2')}</li>
              <li>{t('entities.plugin.instructions.step3')}</li>
              <li>{t('entities.plugin.instructions.step4')}</li>
            </ol>
          </div>
          <button 
            className={styles.downloadButton}
            onClick={handleDownloadPlugin}
            disabled={isDownloadingPlugin}
          >
            <Download />
            {isDownloadingPlugin ? t('entities.plugin.downloading') : t('entities.plugin.download')}
          </button>
        </div>
      )}

      {/* Entity Sync Section - Shows when connected to WordPress */}
      {platform === 'wordpress' && selectedSite?.connectionStatus === 'CONNECTED' && (
        <div className={styles.syncCard}>
          <div className={styles.syncHeader}>
            <CloudDownload className={styles.syncIcon} />
            <div className={styles.syncHeaderContent}>
              <h3 className={styles.sectionTitle}>{t('entities.sync.title')}</h3>
              <p className={styles.syncDescription}>{t('entities.sync.description')}</p>
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
              <span>{t('entities.sync.completed')}</span>
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

          {/* Sync Button */}
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
                onClick={handlePopulateEntities}
              >
                {syncStatus === 'COMPLETED' || syncStatus === 'ERROR' || syncStatus === 'CANCELLED' ? (
                  <>
                    <RefreshCw />
                    {t('entities.sync.resync')}
                  </>
                ) : (
                  <>
                    <CloudDownload />
                    {t('entities.sync.populate')}
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
