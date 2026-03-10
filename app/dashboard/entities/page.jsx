'use client';

import { Globe } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import {
  useEntities,
  EntitiesPageSkeleton,
  IntegrationSetupCard,
  EntityTypesDiscovery,
} from './components';
import styles from './entities.module.css';

export default function EntitiesPage() {
  const { t } = useLocale();
  const {
    // Core
    selectedSite,
    isSiteLoading,
    isLoading,
    locale,
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
  } = useEntities();

  // Loading state - no site selected yet
  if (isSiteLoading || !selectedSite) {
    if (isSiteLoading) {
      return <EntitiesPageSkeleton />;
    }
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

  // Loading entity types
  if (isLoading) {
    return <EntitiesPageSkeleton />;
  }

  const isConnected = selectedSite?.connectionStatus === 'CONNECTED';

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div className={styles.headerContent}>
          <h1 className={styles.pageTitle}>{t('entities.title')}</h1>
          <p className={styles.pageSubtitle}>{t('entities.subtitle')}</p>
        </div>
      </div>

      {/* Section 1: Connection Settings + Plugin */}
      <IntegrationSetupCard
        selectedSite={selectedSite}
        platform={platform}
        isDetecting={isDetecting}
        detectionResult={detectionResult}
        onDetectPlatform={handleDetectPlatform}
      />

      {/* Section 2: Enabled Types + Discovery */}
      {platform && (
        <EntityTypesDiscovery
          discoveredTypes={discoveredTypes}
          selectedTypes={selectedTypes}
          isDiscovering={isDiscovering}
          discoveryError={discoveryError}
          editingType={editingType}
          setEditingType={setEditingType}
          sitemapNotFound={sitemapNotFound}
          customSitemapUrl={customSitemapUrl}
          setCustomSitemapUrl={setCustomSitemapUrl}
          isCrawling={isCrawling}
          isSaving={isSaving}
          onToggleType={toggleEntityType}
          onUpdateLabel={updateTypeLabel}
          onCustomSitemapSubmit={handleCustomSitemapSubmit}
          onDiscoverByCrawling={discoverByCrawling}
          onSaveAndPopulate={handleSaveAndPopulate}
          onDiscoverEntityTypes={discoverEntityTypes}
          enabledTypes={enabledTypes}
          siteId={selectedSite?.id}
          isConnected={isConnected}
          onPopulateEntities={handlePopulateEntities}
          onCrawlEntities={handleCrawlEntities}
          syncStatus={syncStatus}
          syncProgress={syncProgress}
          syncMessage={syncMessage}
          syncError={syncError}
          populatedInfo={populatedInfo}
          onStopSync={handleStopSync}
        />
      )}

    </div>
  );
}

