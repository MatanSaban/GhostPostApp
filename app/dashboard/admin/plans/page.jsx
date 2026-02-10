'use client';

import { useUser } from '@/app/context/user-context';
import { ConfirmDialog } from '../components/AdminModal';
import { AdminPageSkeleton } from '@/app/dashboard/components/Skeleton';
import styles from '../admin.module.css';
import {
  usePlans,
  PlansStats,
  PlansToolbar,
  PlansTable,
  PlanEditModal,
  PlanTranslateModal,
} from './components';

export default function PlansPage() {
  const { isSuperAdmin, isLoading: isUserLoading } = useUser();
  
  const {
    // Data
    plans,
    stats,
    filteredPlans,
    isLoading,
    isSubmitting,
    
    // Search & Filter
    searchQuery,
    setSearchQuery,
    
    // Expanded plan
    expandedPlan,
    setExpandedPlan,
    
    // Edit modal
    editModalOpen,
    selectedPlan,
    formData,
    setFormData,
    features,
    limitations,
    predefinedLimitations,
    
    // Translation modal
    translateModalOpen,
    selectedLanguage,
    availableLanguages,
    existingTranslations,
    translationData,
    setTranslationData,
    
    // Delete dialog
    deleteDialogOpen,
    setDeleteDialogOpen,
    
    // Actions
    loadPlans,
    handleAdd,
    handleEdit,
    handleSubmit,
    closeEditModal,
    handleDuplicate,
    handleDeleteClick,
    handleDeleteConfirm,
    handleToggleActive,
    handleTranslate,
    handleLanguageChange,
    handleTranslationSubmit,
    handleDeleteTranslation,
    closeTranslateModal,
    
    // Features management
    addFeature,
    updateFeature,
    removeFeature,
    
    // Limitations management
    addLimitation,
    updateLimitation,
    removeLimitation,
    
    // Translation helpers
    updateFeatureTranslation,
    updateLimitationTranslation,
    getAllPlanLimitations,
    
    // Locale helpers
    t,
    getPlanName,
    getPlanDescription,
    getPlanFeatures,
  } = usePlans();

  if (isUserLoading) {
    return <AdminPageSkeleton statsCount={3} columns={6} />;
  }

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className={styles.adminPage}>
      {/* Header */}
      <div className={styles.adminHeader}>
        <h1 className={styles.adminTitle}>{t('admin.plans.title')}</h1>
        <p className={styles.adminSubtitle}>{t('admin.plans.subtitle')}</p>
      </div>

      {/* Stats */}
      <PlansStats stats={stats} />

      {/* Toolbar */}
      <PlansToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onRefresh={loadPlans}
        onAdd={handleAdd}
      />

      {/* Table */}
      <div className={styles.tableContainer}>
        <PlansTable
          filteredPlans={filteredPlans}
          isLoading={isLoading}
          expandedPlan={expandedPlan}
          onToggleExpand={(id) => setExpandedPlan(expandedPlan === id ? null : id)}
          onEdit={handleEdit}
          onDuplicate={handleDuplicate}
          onDelete={handleDeleteClick}
          onToggleActive={handleToggleActive}
          onTranslate={handleTranslate}
          getPlanName={getPlanName}
          getPlanDescription={getPlanDescription}
          getPlanFeatures={getPlanFeatures}
        />
      </div>

      {/* Edit/Add Modal */}
      <PlanEditModal
        isOpen={editModalOpen}
        onClose={closeEditModal}
        selectedPlan={selectedPlan}
        formData={formData}
        setFormData={setFormData}
        features={features}
        limitations={limitations}
        predefinedLimitations={predefinedLimitations}
        onAddFeature={addFeature}
        onUpdateFeature={updateFeature}
        onRemoveFeature={removeFeature}
        onAddLimitation={addLimitation}
        onUpdateLimitation={updateLimitation}
        onRemoveLimitation={removeLimitation}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        title={t('admin.plans.actions.delete')}
        message={t('admin.common.confirmDelete')}
        confirmText={t('admin.common.delete')}
        cancelText={t('admin.common.cancel')}
        variant="danger"
        isLoading={isSubmitting}
      />

      {/* Translation Modal */}
      <PlanTranslateModal
        isOpen={translateModalOpen}
        onClose={closeTranslateModal}
        selectedPlan={selectedPlan}
        selectedLanguage={selectedLanguage}
        availableLanguages={availableLanguages}
        existingTranslations={existingTranslations}
        translationData={translationData}
        setTranslationData={setTranslationData}
        onLanguageChange={handleLanguageChange}
        onUpdateFeatureTranslation={updateFeatureTranslation}
        onUpdateLimitationTranslation={updateLimitationTranslation}
        getAllPlanLimitations={getAllPlanLimitations}
        onSubmit={handleTranslationSubmit}
        onDeleteTranslation={handleDeleteTranslation}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}