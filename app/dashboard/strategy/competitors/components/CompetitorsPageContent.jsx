'use client';

import { Loader2, Sparkles } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import {
  PageHeader,
  StatsGrid,
  EmptyState,
  PrimaryActionButton,
  Skeleton,
} from '../../../components';
import { useCompetitors } from './useCompetitors';
import { CompetitorCard, CompetitorCardSkeleton } from './CompetitorCard';
import { CompetitorTable, CompetitorTableSkeleton } from './CompetitorTable';
import { AddCompetitorForm } from './AddCompetitorForm';
import { ViewToggle } from './ViewToggle';
import { DiscoveryConfirmModal } from './DiscoveryConfirmModal';
import { DiscoveryModal } from './DiscoveryModal';
import { ComparisonPanel } from './ComparisonPanel';
import styles from '../competitors.module.css';

export function CompetitorsPageContent() {
  const { t } = useLocale();
  const {
    // Site
    selectedSite,
    isSiteLoading,
    // Competitors
    competitors,
    loading,
    limit,
    error,
    setError,
    scanningIds,
    selectedCompetitor,
    setSelectedCompetitor,
    statsData,
    // Add form
    showAddForm,
    setShowAddForm,
    newUrl,
    setNewUrl,
    addingUrl,
    handleAddCompetitor,
    // Actions
    handleRemoveCompetitor,
    handleScanCompetitor,
    // Comparison
    comparisonData,
    comparing,
    userPageUrl,
    setUserPageUrl,
    handleCompare,
    // Discovery
    showDiscoveryModal,
    setShowDiscoveryModal,
    showDiscoveryConfirm,
    setShowDiscoveryConfirm,
    discovering,
    discoveredCompetitors,
    selectedDiscovered,
    addingDiscovered,
    discoveryInfo,
    handleDiscoverCompetitors,
    toggleDiscoveredSelection,
    handleAddDiscovered,
    // View
    viewMode,
    handleViewModeChange,
  } = useCompetitors();

  // Translate stats labels
  const translatedStats = statsData.map(stat => ({
    ...stat,
    label: t(stat.label),
  }));

  // Loading skeleton while site context loads
  if (!selectedSite) {
    if (isSiteLoading) {
      return (
        <div className={styles.skeletonPage}>
          <div className={styles.skeletonHeader}>
            <div className={styles.skeletonHeaderLeft}>
              <Skeleton width="220px" height="24px" borderRadius="md" />
              <Skeleton width="320px" height="14px" borderRadius="md" />
            </div>
            <div className={styles.skeletonHeaderActions}>
              <Skeleton width="160px" height="40px" borderRadius="md" />
              <Skeleton width="140px" height="40px" borderRadius="md" />
            </div>
          </div>
          <StatsGrid stats={[]} columns={3} loading={true} />
          <div className={styles.skeletonViewToggle}>
            <Skeleton width="36px" height="36px" borderRadius="md" />
            <Skeleton width="36px" height="36px" borderRadius="md" />
          </div>
          <CompetitorTableSkeleton t={t} />
        </div>
      );
    }

    return (
      <>
        <PageHeader
          title={t('competitorAnalysis.title')}
          subtitle={t('competitorAnalysis.subtitle')}
        />
        <EmptyState iconName="Users" title={t('competitorAnalysis.selectSite')} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t('competitorAnalysis.title')}
        subtitle={t('competitorAnalysis.subtitle')}
      >
        <div className={styles.headerActions}>
          <button
            className={styles.aiDiscoverButton}
            onClick={() => setShowDiscoveryConfirm(true)}
            disabled={discovering}
          >
            {discovering ? (
              <Loader2 className={styles.spinIcon} size={16} />
            ) : (
              <Sparkles size={16} />
            )}
            {t('competitorAnalysis.findWithAI')}
          </button>
          <PrimaryActionButton
            iconName="Plus"
            onClick={() => setShowAddForm(true)}
            disabled={competitors.length >= limit}
          >
            {t('competitorAnalysis.addCompetitor')}
          </PrimaryActionButton>
        </div>
      </PageHeader>

      <StatsGrid stats={translatedStats} columns={3} loading={loading || isSiteLoading} />

      {/* Modals */}
      {showDiscoveryConfirm && (
        <DiscoveryConfirmModal
          onClose={() => setShowDiscoveryConfirm(false)}
          onConfirm={() => {
            setShowDiscoveryConfirm(false);
            setShowDiscoveryModal(true);
            handleDiscoverCompetitors();
          }}
        />
      )}

      {showDiscoveryModal && (
        <DiscoveryModal
          discovering={discovering}
          discoveredCompetitors={discoveredCompetitors}
          selectedDiscovered={selectedDiscovered}
          addingDiscovered={addingDiscovered}
          discoveryInfo={discoveryInfo}
          onToggleSelection={toggleDiscoveredSelection}
          onAddSelected={handleAddDiscovered}
          onClose={() => setShowDiscoveryModal(false)}
        />
      )}

      {/* Add Competitor Form */}
      {showAddForm && (
        <AddCompetitorForm
          newUrl={newUrl}
          setNewUrl={setNewUrl}
          addingUrl={addingUrl}
          error={error}
          limit={limit}
          competitorCount={competitors.length}
          onSubmit={handleAddCompetitor}
          onClose={() => {
            setShowAddForm(false);
            setNewUrl('');
            setError('');
          }}
        />
      )}

      {/* Competitor List */}
      {loading ? (
        <div className={styles.skeletonWrapper}>
          <div className={styles.skeletonViewToggle}>
            <Skeleton width="36px" height="36px" borderRadius="md" />
            <Skeleton width="36px" height="36px" borderRadius="md" />
          </div>
          <CompetitorTableSkeleton t={t} />
        </div>
      ) : competitors.length === 0 ? (
        <EmptyState
          iconName="Users"
          title={t('competitorAnalysis.noCompetitors')}
          description={t('competitorAnalysis.noCompetitorsDescription')}
        >
          <PrimaryActionButton iconName="Plus" onClick={() => setShowAddForm(true)}>
            {t('competitorAnalysis.addFirstCompetitor')}
          </PrimaryActionButton>
        </EmptyState>
      ) : (
        <>
          <ViewToggle viewMode={viewMode} onChange={handleViewModeChange} />

          {viewMode === 'list' && (
            <div className={styles.competitorList}>
              {competitors.map((competitor) => (
                <CompetitorCard
                  key={competitor.id}
                  competitor={competitor}
                  isSelected={selectedCompetitor?.id === competitor.id}
                  isScanning={scanningIds.has(competitor.id)}
                  onSelect={setSelectedCompetitor}
                  onScan={handleScanCompetitor}
                  onRemove={handleRemoveCompetitor}
                />
              ))}
            </div>
          )}

          {viewMode === 'table' && (
            <CompetitorTable
              competitors={competitors}
              selectedCompetitor={selectedCompetitor}
              scanningIds={scanningIds}
              onSelect={setSelectedCompetitor}
              onScan={handleScanCompetitor}
              onRemove={handleRemoveCompetitor}
            />
          )}
        </>
      )}

      {/* Head-to-Head Comparison Panel */}
      <ComparisonPanel
        selectedCompetitor={selectedCompetitor}
        comparisonData={comparisonData}
        comparing={comparing}
        userPageUrl={userPageUrl}
        setUserPageUrl={setUserPageUrl}
        onCompare={handleCompare}
      />
    </>
  );
}
