'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  RefreshCw,
  Plus,
  Edit2,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  MessageSquareMore,
  GripVertical,
  Play,
  Pause,
  Zap,
  Bot,
  FileText,
  List,
  ToggleLeft,
  Upload,
  Sliders,
  CheckCircle,
  Type,
  Hash,
  Settings,
  Eye,
  EyeOff,
  Save,
  X,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useUser } from '@/app/context/user-context';
import { AdminModal, ConfirmDialog, FormInput, FormTextarea, FormSelect, FormCheckbox, FormActions, PrimaryButton, SecondaryButton } from '../components/AdminModal';
import styles from '../admin.module.css';

// Question type icons
const typeIcons = {
  GREETING: MessageSquareMore,
  INPUT: Type,
  CONFIRMATION: CheckCircle,
  SELECTION: List,
  MULTI_SELECTION: List,
  DYNAMIC: Zap,
  EDITABLE_DATA: FileText,
  FILE_UPLOAD: Upload,
  SLIDER: Sliders,
  AI_SUGGESTION: Bot,
};

// Question type keys for translations
const questionTypes = [
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
const getTypeLabel = (t, type) => {
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

// Default input configs by type
const defaultInputConfigs = {
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

export default function InterviewFlowPage() {
  const router = useRouter();
  const { t } = useLocale();
  const { isSuperAdmin, isLoading: isUserLoading } = useUser();
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
  const [formData, setFormData] = useState({
    translationKey: '',
    questionType: 'INPUT',
    inputConfig: {},
    validation: {},
    aiPromptHint: '',
    allowedActions: [],
    autoActions: [],
    saveToField: '',
    dependsOn: '',
    showCondition: '',
    isActive: true,
  });

  // Redirect non-admin users
  useEffect(() => {
    if (!isUserLoading && !isSuperAdmin) {
      router.push('/dashboard');
    }
  }, [isSuperAdmin, isUserLoading, router]);

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

  // Get type icon
  const getTypeIcon = (type) => {
    const Icon = typeIcons[type] || MessageSquareMore;
    return <Icon size={16} />;
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
      await loadData(); // Reload on error
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

  // Render input config form based on question type
  const renderInputConfigForm = () => {
    const config = formData.inputConfig;
    
    switch (formData.questionType) {
      case 'GREETING':
        return (
          <FormTextarea
            label={t('admin.interviewFlow.inputConfig.message')}
            value={config.message || ''}
            onChange={(e) => setFormData(prev => ({
              ...prev,
              inputConfig: { ...prev.inputConfig, message: e.target.value }
            }))}
            rows={3}
          />
        );

      case 'INPUT':
        return (
          <>
            <FormSelect
              label={t('admin.interviewFlow.inputConfig.inputType')}
              value={config.inputType || 'text'}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                inputConfig: { ...prev.inputConfig, inputType: e.target.value }
              }))}
              options={[
                { value: 'text', label: t('admin.interviewFlow.inputConfig.inputTypes.text') },
                { value: 'email', label: t('admin.interviewFlow.inputConfig.inputTypes.email') },
                { value: 'tel', label: t('admin.interviewFlow.inputConfig.inputTypes.tel') },
                { value: 'url', label: t('admin.interviewFlow.inputConfig.inputTypes.url') },
                { value: 'number', label: t('admin.interviewFlow.inputConfig.inputTypes.number') },
                { value: 'textarea', label: t('admin.interviewFlow.inputConfig.inputTypes.textarea') },
              ]}
            />
            <FormInput
              label={t('admin.interviewFlow.inputConfig.placeholder')}
              value={config.placeholder || ''}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                inputConfig: { ...prev.inputConfig, placeholder: e.target.value }
              }))}
            />
            <FormInput
              label={t('admin.interviewFlow.validation.maxLength')}
              type="number"
              value={config.maxLength || ''}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                inputConfig: { ...prev.inputConfig, maxLength: e.target.value ? parseInt(e.target.value) : null }
              }))}
            />
          </>
        );

      case 'CONFIRMATION':
        return (
          <>
            <FormInput
              label={t('admin.interviewFlow.inputConfig.confirmLabel')}
              value={config.confirmLabel || 'Yes'}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                inputConfig: { ...prev.inputConfig, confirmLabel: e.target.value }
              }))}
            />
            <FormInput
              label={t('admin.interviewFlow.inputConfig.denyLabel')}
              value={config.denyLabel || 'No'}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                inputConfig: { ...prev.inputConfig, denyLabel: e.target.value }
              }))}
            />
          </>
        );

      case 'SELECTION':
      case 'MULTI_SELECTION':
        return (
          <>
            <FormTextarea
              label={`${t('admin.interviewFlow.inputConfig.options')} (${t('admin.interviewFlow.inputConfig.optionsHelp')})`}
              value={(config.options || []).join('\n')}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                inputConfig: { 
                  ...prev.inputConfig, 
                  options: e.target.value.split('\n').filter(o => o.trim())
                }
              }))}
              rows={5}
              placeholder={t('admin.interviewFlow.inputConfig.optionsPlaceholder')}
            />
            {formData.questionType === 'MULTI_SELECTION' && (
              <>
                <FormInput
                  label={t('admin.interviewFlow.inputConfig.minSelections')}
                  type="number"
                  value={config.minSelect || 1}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    inputConfig: { ...prev.inputConfig, minSelect: parseInt(e.target.value) || 1 }
                  }))}
                />
                <FormInput
                  label={t('admin.interviewFlow.inputConfig.maxSelections')}
                  type="number"
                  value={config.maxSelect || ''}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    inputConfig: { ...prev.inputConfig, maxSelect: e.target.value ? parseInt(e.target.value) : null }
                  }))}
                />
              </>
            )}
          </>
        );

      case 'DYNAMIC':
        return (
          <>
            <FormSelect
              label={t('admin.interviewFlow.inputConfig.sourceAction')}
              value={config.sourceAction || ''}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                inputConfig: { ...prev.inputConfig, sourceAction: e.target.value }
              }))}
              options={[
                { value: '', label: t('admin.interviewFlow.inputConfig.selectAction') },
                ...botActions.map(a => ({ value: a.name, label: a.name }))
              ]}
            />
            <FormTextarea
              label={t('admin.interviewFlow.inputConfig.displayTemplate')}
              value={config.template || ''}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                inputConfig: { ...prev.inputConfig, template: e.target.value }
              }))}
              rows={3}
              placeholder={t('admin.interviewFlow.inputConfig.templateHelp')}
            />
          </>
        );

      case 'FILE_UPLOAD':
        return (
          <>
            <FormInput
              label={t('admin.interviewFlow.inputConfig.accept')}
              value={config.accept || '*/*'}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                inputConfig: { ...prev.inputConfig, accept: e.target.value }
              }))}
              placeholder="image/*,application/pdf"
            />
            <FormInput
              label={t('admin.interviewFlow.inputConfig.maxSize')}
              type="number"
              value={config.maxSize || 5242880}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                inputConfig: { ...prev.inputConfig, maxSize: parseInt(e.target.value) }
              }))}
            />
            <FormCheckbox
              label={t('admin.interviewFlow.inputConfig.multiple')}
              checked={config.multiple || false}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                inputConfig: { ...prev.inputConfig, multiple: e.target.checked }
              }))}
            />
          </>
        );

      case 'SLIDER':
        return (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              <FormInput
                label={t('admin.interviewFlow.inputConfig.min')}
                type="number"
                value={config.min ?? 0}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  inputConfig: { ...prev.inputConfig, min: parseInt(e.target.value) }
                }))}
              />
              <FormInput
                label={t('admin.interviewFlow.inputConfig.max')}
                type="number"
                value={config.max ?? 100}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  inputConfig: { ...prev.inputConfig, max: parseInt(e.target.value) }
                }))}
              />
              <FormInput
                label={t('admin.interviewFlow.inputConfig.step')}
                type="number"
                value={config.step ?? 1}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  inputConfig: { ...prev.inputConfig, step: parseInt(e.target.value) }
                }))}
              />
            </div>
          </>
        );

      case 'AI_SUGGESTION':
        return (
          <>
            <FormInput
              label={t('admin.interviewFlow.inputConfig.suggestionType')}
              value={config.suggestionType || ''}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                inputConfig: { ...prev.inputConfig, suggestionType: e.target.value }
              }))}
              placeholder={t('admin.interviewFlow.inputConfig.suggestionTypePlaceholder')}
            />
            <FormCheckbox
              label={t('admin.interviewFlow.inputConfig.allowCustom')}
              checked={config.allowCustom !== false}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                inputConfig: { ...prev.inputConfig, allowCustom: e.target.checked }
              }))}
            />
          </>
        );

      case 'EDITABLE_DATA':
        return (
          <>
            <FormTextarea
              label={t('admin.interviewFlow.inputConfig.fieldsJson')}
              value={JSON.stringify(config.fields || [], null, 2)}
              onChange={(e) => {
                try {
                  const fields = JSON.parse(e.target.value);
                  setFormData(prev => ({
                    ...prev,
                    inputConfig: { ...prev.inputConfig, fields }
                  }));
                } catch (err) {
                  // Invalid JSON, ignore
                }
              }}
              rows={5}
              placeholder={t('admin.interviewFlow.inputConfig.fieldsPlaceholder')}
            />
            <FormCheckbox
              label={t('admin.interviewFlow.inputConfig.allowAddItems')}
              checked={config.allowAdd || false}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                inputConfig: { ...prev.inputConfig, allowAdd: e.target.checked }
              }))}
            />
            <FormCheckbox
              label={t('admin.interviewFlow.inputConfig.allowRemoveItems')}
              checked={config.allowRemove || false}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                inputConfig: { ...prev.inputConfig, allowRemove: e.target.checked }
              }))}
            />
          </>
        );

      default:
        return null;
    }
  };

  if (isUserLoading) {
    return (
      <div className={styles.loadingState}>
        <div className={styles.spinner} />
      </div>
    );
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
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t('admin.stats.totalQuestions')}</div>
          <div className={styles.statValue}>{questions.length}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t('admin.stats.activeQuestions')}</div>
          <div className={styles.statValue}>{questions.filter(q => q.isActive).length}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t('admin.stats.botActions')}</div>
          <div className={styles.statValue}>{botActions.length}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t('admin.stats.questionTypes')}</div>
          <div className={styles.statValue}>{new Set(questions.map(q => q.questionType)).size}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className={styles.adminToolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.searchWrapper}>
            <Search className={styles.searchIcon} />
            <input
              type="text"
              className={styles.searchInput}
              placeholder={t('admin.interviewFlow.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select
            className={styles.filterSelect}
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="all">{t('admin.common.allTypes')}</option>
            {questionTypes.map(type => (
              <option key={type} value={type}>{getTypeLabel(t, type)}</option>
            ))}
          </select>
          <select
            className={styles.filterSelect}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="all">{t('admin.common.allStatus')}</option>
            <option value="active">{t('admin.common.active')}</option>
            <option value="inactive">{t('admin.common.inactive')}</option>
          </select>
        </div>
        <div className={styles.toolbarRight}>
          <button className={styles.refreshButton} onClick={loadData}>
            <RefreshCw size={16} />
          </button>
          <button className={styles.addButton} onClick={handleAdd}>
            <Plus size={16} />
            <span>{t('admin.interviewFlow.addQuestion')}</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className={styles.tableContainer}>
        {isLoading ? (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
          </div>
        ) : filteredQuestions.length === 0 ? (
          <div className={styles.emptyState}>
            <MessageSquareMore className={styles.emptyIcon} />
            <h3 className={styles.emptyTitle}>{t('admin.interviewFlow.noQuestions')}</h3>
            <p className={styles.emptyMessage}>{t('admin.common.noResults')}</p>
          </div>
        ) : (
          <table className={styles.table}>
            <thead className={styles.tableHeader}>
              <tr>
                <th style={{ width: '40px' }}></th>
                <th style={{ width: '40px' }}>#</th>
                <th>{t('admin.interviewFlow.columns.key')}</th>
                <th style={{ width: '150px' }}>{t('admin.interviewFlow.columns.type')}</th>
                <th style={{ width: '120px' }}>{t('admin.interviewFlow.columns.actions')}</th>
                <th style={{ width: '100px' }}>{t('admin.interviewFlow.columns.status')}</th>
                <th style={{ width: '140px' }}>{t('admin.common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredQuestions.map((question, index) => (
                <tr key={question.id} className={!question.isActive ? styles.inactiveRow : ''}>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <button
                        className={styles.moveButton}
                        onClick={() => handleMove(question.id, 'up')}
                        disabled={index === 0}
                        title="Move up"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        className={styles.moveButton}
                        onClick={() => handleMove(question.id, 'down')}
                        disabled={index === filteredQuestions.length - 1}
                        title="Move down"
                      >
                        <ChevronDown size={14} />
                      </button>
                    </div>
                  </td>
                  <td style={{ fontWeight: 500, color: 'var(--muted-foreground)' }}>
                    {question.order + 1}
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontWeight: 500, fontFamily: 'monospace', fontSize: '0.875rem' }}>
                        {question.translationKey}
                      </span>
                      {question.saveToField && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                          → {question.saveToField}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {getTypeIcon(question.questionType)}
                      <span style={{ fontSize: '0.875rem' }}>
                        {getTypeLabel(t, question.questionType)}
                      </span>
                    </div>
                  </td>
                  <td>
                    {question.allowedActions?.length > 0 && (
                      <span className={styles.badge} style={{ background: 'var(--primary)', color: 'white' }}>
                        {question.allowedActions.length} actions
                      </span>
                    )}
                    {question.autoActions?.length > 0 && (
                      <span className={styles.badge} style={{ background: 'var(--warning)', color: 'var(--warning-foreground)', marginLeft: '4px' }}>
                        {question.autoActions.length} auto
                      </span>
                    )}
                  </td>
                  <td>
                    <button
                      onClick={() => handleToggleActive(question)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        background: question.isActive ? 'var(--success-bg)' : 'var(--muted)',
                        color: question.isActive ? 'var(--success)' : 'var(--muted-foreground)',
                      }}
                    >
                      {question.isActive ? <Eye size={12} /> : <EyeOff size={12} />}
                      {question.isActive ? t('admin.common.active') : t('admin.common.inactive')}
                    </button>
                  </td>
                  <td>
                    <div className={styles.actionButtons}>
                      <button
                        className={styles.actionButton}
                        onClick={() => handleEdit(question)}
                        title="Edit"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        className={styles.actionButton}
                        onClick={() => handleDuplicate(question)}
                        title="Duplicate"
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        className={`${styles.actionButton} ${styles.deleteButton}`}
                        onClick={() => handleDeleteClick(question)}
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit/Add Modal */}
      <AdminModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title={selectedQuestion 
          ? t('admin.interviewFlow.editQuestion')
          : t('admin.interviewFlow.addQuestion')
        }
        size="large"
      >
        <form onSubmit={handleSubmit}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
            {[
              { key: 'basic', label: t('admin.interviewFlow.tabs.basic') },
              { key: 'input', label: t('admin.interviewFlow.tabs.input') },
              { key: 'validation', label: t('admin.interviewFlow.tabs.validation') },
              { key: 'ai', label: t('admin.interviewFlow.tabs.ai') },
              { key: 'conditions', label: t('admin.interviewFlow.tabs.conditions') },
            ].map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  background: activeTab === tab.key ? 'var(--primary)' : 'transparent',
                  color: activeTab === tab.key ? 'white' : 'var(--foreground)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Basic Tab */}
          {activeTab === 'basic' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <FormInput
                label={`${t('admin.interviewFlow.fields.translationKey')} *`}
                value={formData.translationKey}
                onChange={(e) => setFormData(prev => ({ ...prev, translationKey: e.target.value }))}
                placeholder="interview.questions.businessName"
                required
              />
              <FormSelect
                label={t('admin.interviewFlow.fields.type')}
                value={formData.questionType}
                onChange={(e) => handleTypeChange(e.target.value)}
                options={questionTypes.map(type => ({ value: type, label: getTypeLabel(t, type) }))}
              />
              <FormInput
                label={t('admin.interviewFlow.fields.saveToField')}
                value={formData.saveToField}
                onChange={(e) => setFormData(prev => ({ ...prev, saveToField: e.target.value }))}
                placeholder={t('admin.interviewFlow.fields.saveToFieldPlaceholder')}
              />
              <FormCheckbox
                label={t('admin.common.active')}
                checked={formData.isActive}
                onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
              />
            </div>
          )}

          {/* Input Config Tab */}
          {activeTab === 'input' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h4 style={{ margin: 0, fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
                {t('admin.interviewFlow.inputConfig.title')} - {getTypeLabel(t, formData.questionType)}
              </h4>
              {renderInputConfigForm()}
            </div>
          )}

          {/* Validation Tab */}
          {activeTab === 'validation' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <FormCheckbox
                label={t('admin.interviewFlow.validation.required')}
                checked={formData.validation.required || false}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  validation: { ...prev.validation, required: e.target.checked }
                }))}
              />
              <FormInput
                label={t('admin.interviewFlow.validation.minLength')}
                type="number"
                value={formData.validation.minLength || ''}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  validation: { ...prev.validation, minLength: e.target.value ? parseInt(e.target.value) : undefined }
                }))}
              />
              <FormInput
                label={t('admin.interviewFlow.validation.maxLength')}
                type="number"
                value={formData.validation.maxLength || ''}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  validation: { ...prev.validation, maxLength: e.target.value ? parseInt(e.target.value) : undefined }
                }))}
              />
              <FormInput
                label={t('admin.interviewFlow.validation.pattern')}
                value={formData.validation.pattern || ''}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  validation: { ...prev.validation, pattern: e.target.value || undefined }
                }))}
                placeholder={t('admin.interviewFlow.validation.patternPlaceholder')}
              />
              <FormInput
                label={t('admin.interviewFlow.validation.errorMessage')}
                value={formData.validation.errorMessage || ''}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  validation: { ...prev.validation, errorMessage: e.target.value || undefined }
                }))}
              />
            </div>
          )}

          {/* AI Config Tab */}
          {activeTab === 'ai' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <FormTextarea
                label={t('admin.interviewFlow.fields.aiPromptHint')}
                value={formData.aiPromptHint}
                onChange={(e) => setFormData(prev => ({ ...prev, aiPromptHint: e.target.value }))}
                rows={3}
                placeholder={t('admin.interviewFlow.fields.aiPromptHintHelp')}
              />
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem' }}>
                  {t('admin.interviewFlow.aiConfig.allowedActions')}
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {botActions.map(action => (
                    <label
                      key={action.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        background: formData.allowedActions.includes(action.name) ? 'var(--primary)' : 'var(--muted)',
                        color: formData.allowedActions.includes(action.name) ? 'white' : 'var(--foreground)',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={formData.allowedActions.includes(action.name)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData(prev => ({
                              ...prev,
                              allowedActions: [...prev.allowedActions, action.name]
                            }));
                          } else {
                            setFormData(prev => ({
                              ...prev,
                              allowedActions: prev.allowedActions.filter(a => a !== action.name)
                            }));
                          }
                        }}
                        style={{ display: 'none' }}
                      />
                      <Bot size={14} />
                      {action.name}
                    </label>
                  ))}
                </div>
                {botActions.length === 0 && (
                  <p style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem', marginTop: '8px' }}>
                    {t('admin.interviewFlow.aiConfig.noActionsAvailable')}
                  </p>
                )}
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem' }}>
                  {t('admin.interviewFlow.aiConfig.autoActions')} ({t('admin.interviewFlow.aiConfig.autoActionsHelp')})
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {botActions.map(action => (
                    <label
                      key={action.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        background: formData.autoActions.includes(action.name) ? 'var(--warning)' : 'var(--muted)',
                        color: formData.autoActions.includes(action.name) ? 'var(--warning-foreground)' : 'var(--foreground)',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={formData.autoActions.includes(action.name)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData(prev => ({
                              ...prev,
                              autoActions: [...prev.autoActions, action.name]
                            }));
                          } else {
                            setFormData(prev => ({
                              ...prev,
                              autoActions: prev.autoActions.filter(a => a !== action.name)
                            }));
                          }
                        }}
                        style={{ display: 'none' }}
                      />
                      <Zap size={14} />
                      {action.name}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Conditions Tab */}
          {activeTab === 'conditions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <FormInput
                label={t('admin.interviewFlow.conditions.dependsOn')}
                value={formData.dependsOn}
                onChange={(e) => setFormData(prev => ({ ...prev, dependsOn: e.target.value }))}
                placeholder={t('admin.interviewFlow.conditions.dependsOnPlaceholder')}
              />
              <FormTextarea
                label={t('admin.interviewFlow.conditions.showCondition')}
                value={formData.showCondition}
                onChange={(e) => setFormData(prev => ({ ...prev, showCondition: e.target.value }))}
                rows={4}
                placeholder={t('admin.interviewFlow.conditions.showConditionPlaceholder')}
              />
              <p style={{ color: 'var(--muted-foreground)', fontSize: '0.75rem', margin: 0 }}>
                {t('admin.interviewFlow.conditions.showConditionHelp')}
              </p>
            </div>
          )}

          <FormActions>
            <SecondaryButton type="button" onClick={() => setEditModalOpen(false)}>
              {t('admin.common.cancel')}
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <RefreshCw size={16} className={styles.spinning} />
              ) : (
                <Save size={16} />
              )}
              {selectedQuestion 
                ? t('admin.common.save') 
                : t('admin.common.create')
              }
            </PrimaryButton>
          </FormActions>
        </form>
      </AdminModal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        title={t('admin.interviewFlow.deleteTitle')}
        message={t('admin.interviewFlow.deleteMessage')}
        confirmText={t('admin.common.delete')}
        cancelText={t('admin.common.cancel')}
      />
    </div>
  );
}
