'use client';

import {
  PageHeader,
  StatsGrid,
  EmptyState,
  PrimaryActionButton,
  Skeleton,
  AIDiscoverButton,
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

export function CompetitorsPageContent({ translations }) {
  const t = translations;
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

  // Build stats with pre-translated labels
  const translatedStats = [
    { iconName: 'Users', value: String(competitors.length), label: t.trackedCompetitors, color: 'purple' },
    { iconName: 'Target', value: '0', label: t.sharedKeywords, color: 'blue' },
    { iconName: 'BarChart2', value: String(competitors.reduce((sum, c) => sum + (c.contentGaps?.length || 0), 0)), label: t.contentGaps, color: 'orange' },
  ];

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
          <CompetitorTableSkeleton translations={t} />
        </div>
      );
    }

    return (
      <>
        <PageHeader
          title={t.title}
          subtitle={t.subtitle}
        />
        <EmptyState iconName="Users" title={t.selectSite} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t.title}
        subtitle={t.subtitle}
      >
        <div className={styles.headerActions}>
          <AIDiscoverButton
            isDiscovering={discovering}
            onClick={() => setShowDiscoveryConfirm(true)}
            label={t.findWithAI}
          />
          <PrimaryActionButton
            iconName="Plus"
            onClick={() => setShowAddForm(true)}
            disabled={competitors.length >= limit}
          >
            {t.addCompetitor}
          </PrimaryActionButton>
        </div>
      </PageHeader>

      <StatsGrid stats={translatedStats} columns={3} loading={loading || isSiteLoading} />

      {/* Modals */}
      {showDiscoveryConfirm && (
        <DiscoveryConfirmModal
          translations={t}
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
          translations={t}
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
          translations={t}
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
          <CompetitorTableSkeleton translations={t} />
        </div>
      ) : competitors.length === 0 ? (
        <EmptyState
          iconName="Users"
          title={t.noCompetitors}
          description={t.noCompetitorsDescription}
        >
          <PrimaryActionButton iconName="Plus" onClick={() => setShowAddForm(true)}>
            {t.addFirstCompetitor}
          </PrimaryActionButton>
        </EmptyState>
      ) : (
        <>
          <ViewToggle 
            viewMode={viewMode} 
            onChange={handleViewModeChange}
            translations={t}
          />

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
                  translations={t}
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
              translations={t}
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
        translations={t}
      />
    </>
  );
}
