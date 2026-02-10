'use client';

import { useState, useEffect, useCallback } from 'react';

// Default input configs by type
export const defaultInputConfigs = {
  GREETING: { message: '' },
  INPUT: { inputType: 'text', placeholder: '', maxLength: null, pattern: null },
  CONFIRMATION: { confirmLabel: 'Yes', denyLabel: 'No' },
  SELECTION: { options: [] },
  MULTI_SELECTION: { options: [], minSelect: 1, maxSelect: null },
  DYNAMIC: { sourceAction: '', template: '' },
  EDITABLE_DATA: { fields: [], allowAdd: false, allowRemove: false },
  FILE_UPLOAD: { accept: '*/*', maxSize: 5242880, multiple: false },
  SLIDER: { min: 0, max: 100, step: 1, labels: {} },
  AI_SUGGESTION: { suggestionType: '', allowCustom: true },
};

// Question types list
export const questionTypes = [
  'GREETING',
  'INPUT',
  'CONFIRMATION',
  'SELECTION',
  'MULTI_SELECTION',
  'DYNAMIC',
  'EDITABLE_DATA',
  'FILE_UPLOAD',
  'SLIDER',
  'AI_SUGGESTION',
];

// Get translated type label
export const getTypeLabel = (t, type) => {
  const labels = {
    GREETING: t('admin.interviewFlow.types.greeting'),
    INPUT: t('admin.interviewFlow.types.input'),
    CONFIRMATION: t('admin.interviewFlow.types.confirmation'),
    SELECTION: t('admin.interviewFlow.types.selection'),
    MULTI_SELECTION: t('admin.interviewFlow.types.multiSelection'),
    DYNAMIC: t('admin.interviewFlow.types.dynamic'),
    EDITABLE_DATA: t('admin.interviewFlow.types.editableData'),
    FILE_UPLOAD: t('admin.interviewFlow.types.fileUpload'),
    SLIDER: t('admin.interviewFlow.types.slider'),
    AI_SUGGESTION: t('admin.interviewFlow.types.aiSuggestion'),
  };
  return labels[type] || type;
};

const initialFormData = {
  translationKey: '',
  questionType: 'INPUT',
  inputConfig: defaultInputConfigs.INPUT,
  validation: {},
  aiPromptHint: '',
  allowedActions: [],
  autoActions: [],
  saveToField: '',
  dependsOn: '',
  showCondition: '',
  isActive: true,
};

export function useInterviewFlow(isSuperAdmin) {
  const [questions, setQuestions] = useState([]);
  const [botActions, setBotActions] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  // Modal states
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('basic');

  // Form data
  const [formData, setFormData] = useState(initialFormData);

  // Load questions and bot actions from API
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/interview-flow');
      if (!response.ok) throw new Error('Failed to fetch data');
      const data = await response.json();
      setQuestions(data.questions || []);
      setBotActions(data.botActions || []);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) {
      loadData();
    }
  }, [isSuperAdmin, loadData]);

  // Filter questions
  const filteredQuestions = questions.filter(q => {
    const matchesSearch = q.translationKey.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || q.questionType === filterType;
    const matchesStatus = filterStatus === 'all' || 
      (filterStatus === 'active' && q.isActive) ||
      (filterStatus === 'inactive' && !q.isActive);
    return matchesSearch && matchesType && matchesStatus;
  }).sort((a, b) => a.order - b.order);

  // Save new order
  const saveOrder = async (orderedQuestions) => {
    const order = orderedQuestions.map((q, i) => ({ id: q.id, order: i }));
    
    // Optimistically update UI
    setQuestions(orderedQuestions.map((q, i) => ({ ...q, order: i })));

    try {
      const response = await fetch('/api/admin/interview-flow', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order }),
      });

      if (!response.ok) throw new Error('Failed to save order');
    } catch (error) {
      console.error('Error saving order:', error);
      await loadData();
    }
  };

  // Move question up/down
  const handleMove = async (questionId, direction) => {
    const sortedQuestions = [...questions].sort((a, b) => a.order - b.order);
    const index = sortedQuestions.findIndex(q => q.id === questionId);
    
    if (direction === 'up' && index > 0) {
      const newQuestions = [...sortedQuestions];
      [newQuestions[index - 1], newQuestions[index]] = [newQuestions[index], newQuestions[index - 1]];
      await saveOrder(newQuestions);
    } else if (direction === 'down' && index < sortedQuestions.length - 1) {
      const newQuestions = [...sortedQuestions];
      [newQuestions[index], newQuestions[index + 1]] = [newQuestions[index + 1], newQuestions[index]];
      await saveOrder(newQuestions);
    }
  };

  // Toggle question active status
  const handleToggleActive = async (question) => {
    try {
      const response = await fetch(`/api/admin/interview-flow/${question.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !question.isActive }),
      });

      if (!response.ok) throw new Error('Failed to update question');

      setQuestions(prev => prev.map(q => 
        q.id === question.id ? { ...q, isActive: !q.isActive } : q
      ));
    } catch (error) {
      console.error('Error toggling active:', error);
    }
  };

  // Open edit modal
  const handleEdit = (question) => {
    setSelectedQuestion(question);
    setFormData({
      translationKey: question.translationKey,
      questionType: question.questionType,
      inputConfig: question.inputConfig || defaultInputConfigs[question.questionType],
      validation: question.validation || {},
      aiPromptHint: question.aiPromptHint || '',
      allowedActions: question.allowedActions || [],
      autoActions: question.autoActions || [],
      saveToField: question.saveToField || '',
      dependsOn: question.dependsOn || '',
      showCondition: question.showCondition || '',
      isActive: question.isActive,
    });
    setActiveTab('basic');
    setEditModalOpen(true);
  };

  // Open add modal
  const handleAdd = () => {
    setSelectedQuestion(null);
    setFormData({
      ...initialFormData,
      inputConfig: defaultInputConfigs.INPUT,
    });
    setActiveTab('basic');
    setEditModalOpen(true);
  };

  // Handle duplicate
  const handleDuplicate = async (question) => {
    try {
      const response = await fetch('/api/admin/interview-flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          translationKey: `${question.translationKey}_copy`,
          questionType: question.questionType,
          inputConfig: question.inputConfig,
          validation: question.validation,
          aiPromptHint: question.aiPromptHint,
          allowedActions: question.allowedActions,
          autoActions: question.autoActions,
          saveToField: question.saveToField,
          dependsOn: question.dependsOn,
          showCondition: question.showCondition,
          isActive: false,
        }),
      });

      if (!response.ok) throw new Error('Failed to duplicate question');

      await loadData();
    } catch (error) {
      console.error('Error duplicating question:', error);
      alert(error.message);
    }
  };

  // Open delete dialog
  const handleDeleteClick = (question) => {
    setSelectedQuestion(question);
    setDeleteDialogOpen(true);
  };

  // Confirm delete
  const handleDeleteConfirm = async () => {
    if (!selectedQuestion) return;

    try {
      const response = await fetch(`/api/admin/interview-flow/${selectedQuestion.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete question');

      setDeleteDialogOpen(false);
      setSelectedQuestion(null);
      await loadData();
    } catch (error) {
      console.error('Error deleting question:', error);
      alert(error.message);
    }
  };

  // Handle type change
  const handleTypeChange = (newType) => {
    setFormData(prev => ({
      ...prev,
      questionType: newType,
      inputConfig: defaultInputConfigs[newType],
    }));
  };

  // Handle form submit (create or update)
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const payload = {
        translationKey: formData.translationKey,
        questionType: formData.questionType,
        inputConfig: formData.inputConfig,
        validation: formData.validation,
        aiPromptHint: formData.aiPromptHint || null,
        allowedActions: formData.allowedActions,
        autoActions: formData.autoActions,
        saveToField: formData.saveToField || null,
        dependsOn: formData.dependsOn || null,
        showCondition: formData.showCondition || null,
        isActive: formData.isActive,
      };

      const url = selectedQuestion
        ? `/api/admin/interview-flow/${selectedQuestion.id}`
        : '/api/admin/interview-flow';
      
      const method = selectedQuestion ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save question');
      }

      setEditModalOpen(false);
      setSelectedQuestion(null);
      await loadData();
    } catch (error) {
      console.error('Error saving question:', error);
      alert(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    // Data
    questions,
    botActions,
    filteredQuestions,
    isLoading,
    // Search & Filter
    searchQuery,
    setSearchQuery,
    filterType,
    setFilterType,
    filterStatus,
    setFilterStatus,
    // Modal states
    editModalOpen,
    setEditModalOpen,
    deleteDialogOpen,
    setDeleteDialogOpen,
    selectedQuestion,
    isSubmitting,
    activeTab,
    setActiveTab,
    // Form
    formData,
    setFormData,
    // Actions
    loadData,
    handleMove,
    handleToggleActive,
    handleEdit,
    handleAdd,
    handleDuplicate,
    handleDeleteClick,
    handleDeleteConfirm,
    handleTypeChange,
    handleSubmit,
  };
}
