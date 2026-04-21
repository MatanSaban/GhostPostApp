'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from '@/app/context/locale-context';
import { useUser } from '@/app/context/user-context';
import { ConfirmDialog } from '../components/AdminModal';
import styles from '../admin.module.css';

import {
  useInterviewFlow,
  InterviewFlowSkeleton,
  InterviewFlowStats,
  InterviewFlowToolbar,
  QuestionTable,
  QuestionEditModal,
} from './components';

export default function InterviewFlowPage() {
  const router = useRouter();
  const { t } = useLocale();
  const { isSuperAdmin, isLoading: isUserLoading } = useUser();
  
  const flow = useInterviewFlow(isSuperAdmin);

  // Redirect non-admin users
  useEffect(() => {
    if (!isUserLoading && !isSuperAdmin) {
      router.push('/dashboard');
    }
  }, [isSuperAdmin, isUserLoading, router]);

  if (isUserLoading) {
    return <InterviewFlowSkeleton />;
  }

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className={styles.adminPage}>
      {/* Header */}
      <div className={styles.adminHeader}>
        <h1 className={styles.adminTitle}>{t('admin.interviewFlow.title')}</h1>
        <p className={styles.adminSubtitle}>{t('admin.interviewFlow.subtitle')}</p>
      </div>

      {/* Stats */}
      <InterviewFlowStats 
        questions={flow.questions} 
        botActions={flow.botActions} 
      />

      {/* Toolbar */}
      <InterviewFlowToolbar
        searchQuery={flow.searchQuery}
        onSearchChange={flow.setSearchQuery}
        filterType={flow.filterType}
        onFilterTypeChange={flow.setFilterType}
        filterStatus={flow.filterStatus}
        onFilterStatusChange={flow.setFilterStatus}
        onRefresh={flow.loadData}
        onAdd={flow.handleAdd}
      />

      {/* Table */}
      <div className={styles.tableContainer}>
        <QuestionTable
          filteredQuestions={flow.filteredQuestions}
          isLoading={flow.isLoading}
          onMove={flow.handleMove}
          onToggleActive={flow.handleToggleActive}
          onEdit={flow.handleEdit}
          onDuplicate={flow.handleDuplicate}
          onDelete={flow.handleDeleteClick}
        />
      </div>

      {/* Edit/Add Modal */}
      <QuestionEditModal
        isOpen={flow.editModalOpen}
        onClose={() => flow.setEditModalOpen(false)}
        selectedQuestion={flow.selectedQuestion}
        formData={flow.formData}
        setFormData={flow.setFormData}
        activeTab={flow.activeTab}
        setActiveTab={flow.setActiveTab}
        botActions={flow.botActions}
        isSubmitting={flow.isSubmitting}
        onSubmit={flow.handleSubmit}
        onTypeChange={flow.handleTypeChange}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={flow.deleteDialogOpen}
        onClose={() => flow.setDeleteDialogOpen(false)}
        onConfirm={flow.handleDeleteConfirm}
        title={t('admin.interviewFlow.deleteTitle')}
        message={t('admin.interviewFlow.deleteMessage')}
        confirmText={t('admin.common.delete')}
        cancelText={t('admin.common.cancel')}
      />
    </div>
  );
}
