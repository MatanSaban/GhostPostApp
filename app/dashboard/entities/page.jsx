'use client';

import { Globe } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import WordPressPluginSection from '@/app/dashboard/settings/components/WordPressPluginSection';
import {
  useEntities,
  EntitiesPageSkeleton,
  IntegrationSetupCard,
  EntityTypesDiscovery,
  SyncStatusCard,
  EnabledTypesCard,
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
  const isWordPress = platform === 'wordpress';

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
      <IntegrationSetupCard
        selectedSite={selectedSite}
        platform={platform}
        isDetecting={isDetecting}
        detectionResult={detectionResult}
        onDetectPlatform={handleDetectPlatform}
      />

      {/* Entity Types Discovery */}
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
        />
      )}

      {/* WordPress Plugin Section */}
      {isWordPress && enabledTypes.length > 0 && (
        <WordPressPluginSection
          translations={t}
          selectedSite={selectedSite}
          enabledTypes={enabledTypes}
          isDownloadingPlugin={isDownloadingPlugin}
          onDownloadPlugin={handleDownloadPlugin}
        />
      )}

      {/* Sync Status Card */}
      <SyncStatusCard
        syncStatus={syncStatus}
        syncProgress={syncProgress}
        syncMessage={syncMessage}
        syncError={syncError}
        populatedInfo={populatedInfo}
        isConnected={isConnected}
        onPopulateEntities={handlePopulateEntities}
        onCrawlEntities={handleCrawlEntities}
        onStopSync={handleStopSync}
      />

      {/* Enabled Entity Types */}
      <EnabledTypesCard
        enabledTypes={enabledTypes}
        siteId={selectedSite?.id}
        isConnected={isConnected}
        onPopulateEntities={handlePopulateEntities}
        onCrawlEntities={handleCrawlEntities}
        syncStatus={syncStatus}
      />
    </div>
  );
}

