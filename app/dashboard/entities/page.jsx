'use client';

import { useState, useEffect } from 'react';
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
      } catch (error) {
        console.error('Failed to load entity types:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadEntityTypes();
  }, [selectedSite?.id]);

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
          <button className={styles.downloadButton}>
            <Download />
            {t('entities.plugin.download')}
          </button>
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
