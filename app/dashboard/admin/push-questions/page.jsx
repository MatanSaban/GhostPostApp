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
  Check,
  X,
  Globe,
  Target,
  Eye,
  EyeOff,
  Languages,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useUser } from '@/app/context/user-context';
import { AdminModal, ConfirmDialog, FormInput, FormTextarea, FormSelect, FormCheckbox, FormActions, PrimaryButton, SecondaryButton } from '../components/AdminModal';
import { AdminPageSkeleton, TableSkeleton, Button } from '@/app/dashboard/components';
import styles from '../admin.module.css';

const QUESTION_TYPE_VALUES = ['TEXT', 'TEXTAREA', 'CHOICE', 'MULTI_CHOICE', 'NUMBER', 'URL'];

const AVAILABLE_LANGUAGES = ['EN', 'HE', 'FR'];

export default function PushQuestionsPage() {
  const router = useRouter();
  const { t } = useLocale();
  const { isSuperAdmin, isLoading: isUserLoading } = useUser();
  const QUESTION_TYPES = QUESTION_TYPE_VALUES.map((value) => ({
    value,
    label: t(`admin.pushQuestions.questionTypes.${value}`),
  }));
  const [questions, setQuestions] = useState([]);
  const [sites, setSites] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all'); // all, active, inactive

  // Modal states
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [translateModalOpen, setTranslateModalOpen] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('HE');
  const [translationData, setTranslationData] = useState({
    question: '',
    description: '',
    options: '',
  });
  const [formData, setFormData] = useState({
    question: '',
    description: '',
    questionType: 'TEXT',
    options: '',
    targetAll: true,
    targetSiteIds: [],
    required: false,
    category: '',
    isActive: true,
  });

  // Redirect non-admin users
  useEffect(() => {
    if (!isUserLoading && !isSuperAdmin) {
      router.push('/dashboard');
    }
  }, [isSuperAdmin, isUserLoading, router]);

  // Load questions from API
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/push-questions');
      if (!response.ok) throw new Error('Failed to fetch questions');
      const data = await response.json();
      setQuestions(data.questions || []);
      setSites(data.sites || []);
    } catch (error) {
      console.error('Failed to load push questions:', error);
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
    const matchesSearch = q.question.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || 
      (filterStatus === 'active' && q.isActive) ||
      (filterStatus === 'inactive' && !q.isActive);
    return matchesSearch && matchesStatus;
  }).sort((a, b) => a.order - b.order);

  const getTypeLabel = (type) => {
    const found = QUESTION_TYPES.find((qt) => qt.value === type);
    return found ? found.label : type;
  };

  // Open edit modal
  const handleEdit = (question) => {
    setSelectedQuestion(question);
    setFormData({
      question: question.question,
      description: question.description || '',
      questionType: question.questionType,
      options: question.options ? question.options.join(', ') : '',
      targetAll: question.targetAll,
      targetSiteIds: question.targetSiteIds || [],
      required: question.required,
      category: question.category || '',
      isActive: question.isActive,
    });
    setEditModalOpen(true);
  };

  // Open add modal
  const handleAdd = () => {
    setSelectedQuestion(null);
    setFormData({
      question: '',
      description: '',
      questionType: 'TEXT',
      options: '',
      targetAll: true,
      targetSiteIds: [],
      required: false,
      category: '',
      isActive: true,
    });
    setEditModalOpen(true);
  };

  // Handle duplicate
  const handleDuplicate = async (question) => {
    try {
      const response = await fetch('/api/admin/push-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: `${question.question}${t('admin.pushQuestions.copySuffix')}`,
          description: question.description,
          questionType: question.questionType,
          options: question.options,
          targetAll: question.targetAll,
          targetSiteIds: question.targetSiteIds,
          required: question.required,
          category: question.category,
          isActive: false, // Duplicates start as inactive
        }),
      });

      if (!response.ok) throw new Error('Failed to duplicate question');

      await loadData();
    } catch (error) {
      console.error('Error duplicating question:', error);
      alert(error.message);
    }
  };

  // Toggle active status
  const handleToggleActive = async (question) => {
    try {
      const response = await fetch('/api/admin/push-questions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: question.id,
          isActive: !question.isActive,
        }),
      });

      if (!response.ok) throw new Error('Failed to update question');

      await loadData();
    } catch (error) {
      console.error('Error updating question:', error);
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
      const response = await fetch(`/api/admin/push-questions?id=${selectedQuestion.id}`, {
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

  // Handle form submit (create or update)
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const payload = {
        question: formData.question,
        description: formData.description || null,
        questionType: formData.questionType,
        options: formData.options ? formData.options.split(',').map(o => o.trim()).filter(Boolean) : null,
        targetAll: formData.targetAll,
        targetSiteIds: formData.targetAll ? [] : formData.targetSiteIds,
        required: formData.required,
        category: formData.category || null,
        isActive: formData.isActive,
      };

      if (selectedQuestion) {
        payload.id = selectedQuestion.id;
      }

      const method = selectedQuestion ? 'PATCH' : 'POST';

      const response = await fetch('/api/admin/push-questions', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Failed to save question');

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

  // Move question up/down
  const handleMoveUp = async (questionId) => {
    const index = filteredQuestions.findIndex(q => q.id === questionId);
    if (index <= 0) return;

    const currentQuestion = filteredQuestions[index];
    const prevQuestion = filteredQuestions[index - 1];

    try {
      await fetch('/api/admin/push-questions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentQuestion.id, order: prevQuestion.order }),
      });
      await fetch('/api/admin/push-questions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: prevQuestion.id, order: currentQuestion.order }),
      });
      await loadData();
    } catch (error) {
      console.error('Error reordering:', error);
    }
  };

  const handleMoveDown = async (questionId) => {
    const index = filteredQuestions.findIndex(q => q.id === questionId);
    if (index >= filteredQuestions.length - 1) return;

    const currentQuestion = filteredQuestions[index];
    const nextQuestion = filteredQuestions[index + 1];

    try {
      await fetch('/api/admin/push-questions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentQuestion.id, order: nextQuestion.order }),
      });
      await fetch('/api/admin/push-questions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: nextQuestion.id, order: currentQuestion.order }),
      });
      await loadData();
    } catch (error) {
      console.error('Error reordering:', error);
    }
  };

  // Handle site selection for targeting
  const handleSiteToggle = (siteId) => {
    setFormData(prev => ({
      ...prev,
      targetSiteIds: prev.targetSiteIds.includes(siteId)
        ? prev.targetSiteIds.filter(id => id !== siteId)
        : [...prev.targetSiteIds, siteId],
    }));
  };

  // Open translate modal
  const handleTranslate = (question) => {
    setSelectedQuestion(question);
    setSelectedLanguage('HE');
    // Load existing translation if available
    const existingTranslation = question.translations?.['HE'];
    setTranslationData({
      question: existingTranslation?.question || '',
      description: existingTranslation?.description || '',
      options: existingTranslation?.options ? existingTranslation.options.join(', ') : '',
    });
    setTranslateModalOpen(true);
  };

  // Handle language change in translate modal
  const handleLanguageChange = (lang) => {
    setSelectedLanguage(lang);
    const existingTranslation = selectedQuestion?.translations?.[lang];
    setTranslationData({
      question: existingTranslation?.question || '',
      description: existingTranslation?.description || '',
      options: existingTranslation?.options ? existingTranslation.options.join(', ') : '',
    });
  };

  // Handle translation submit
  const handleTranslationSubmit = async (e) => {
    e.preventDefault();
    if (!selectedQuestion) return;
    setIsSubmitting(true);

    try {
      const payload = {
        language: selectedLanguage,
        question: translationData.question,
        description: translationData.description || null,
        options: translationData.options 
          ? translationData.options.split(',').map(o => o.trim()).filter(Boolean) 
          : null,
      };

      const response = await fetch(`/api/admin/push-questions/${selectedQuestion.id}/translations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Failed to save translation');

      setTranslateModalOpen(false);
      await loadData();
    } catch (error) {
      console.error('Error saving translation:', error);
      alert(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete translation
  const handleDeleteTranslation = async () => {
    if (!selectedQuestion || !selectedLanguage) return;
    
    if (!confirm(t('admin.pushQuestions.translateModal.deleteTranslationConfirm', { lang: selectedLanguage }))) return;

    try {
      const response = await fetch(
        `/api/admin/push-questions/${selectedQuestion.id}/translations?language=${selectedLanguage}`,
        { method: 'DELETE' }
      );

      if (!response.ok) throw new Error('Failed to delete translation');

      setTranslationData({ question: '', description: '', options: '' });
      await loadData();
      
      // Refresh selected question data
      const updatedQuestion = questions.find(q => q.id === selectedQuestion.id);
      if (updatedQuestion) {
        setSelectedQuestion(updatedQuestion);
      }
    } catch (error) {
      console.error('Error deleting translation:', error);
      alert(error.message);
    }
  };

  if (isUserLoading) {
    return <AdminPageSkeleton statsCount={4} columns={6} />;
  }

  if (!isSuperAdmin) {
    return null;
  }

  const stats = {
    total: questions.length,
    active: questions.filter(q => q.isActive).length,
    required: questions.filter(q => q.required).length,
    totalAnswers: questions.reduce((sum, q) => sum + (q.answersCount || 0), 0),
  };

  return (
    <div className={styles.adminPage}>
      {/* Header */}
      <div className={styles.adminHeader}>
        <h1 className={styles.adminTitle}>{t('admin.pushQuestions.title')}</h1>
        <p className={styles.adminSubtitle}>{t('admin.pushQuestions.subtitle')}</p>
      </div>

      {/* Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t('admin.pushQuestions.stats.total')}</div>
          <div className={styles.statValue}>{stats.total}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t('admin.pushQuestions.stats.active')}</div>
          <div className={styles.statValue}>{stats.active}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t('admin.pushQuestions.stats.required')}</div>
          <div className={styles.statValue}>{stats.required}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t('admin.pushQuestions.stats.totalAnswers')}</div>
          <div className={styles.statValue}>{stats.totalAnswers}</div>
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
              placeholder={t('admin.pushQuestions.toolbar.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{
              padding: '0.625rem 1rem',
              fontSize: '0.8125rem',
              background: 'var(--input)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              color: 'var(--foreground)',
              cursor: 'pointer',
            }}
          >
            <option value="all">{t('admin.pushQuestions.toolbar.filterAll')}</option>
            <option value="active">{t('admin.pushQuestions.toolbar.filterActive')}</option>
            <option value="inactive">{t('admin.pushQuestions.toolbar.filterInactive')}</option>
          </select>
        </div>
        <div className={styles.toolbarRight}>
          <button className={styles.refreshButton} onClick={loadData}>
            <RefreshCw size={16} />
          </button>
          <Button variant="primary" onClick={handleAdd}>
            <Plus size={16} />
            <span>{t('admin.pushQuestions.toolbar.addQuestion')}</span>
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className={styles.tableContainer}>
        {isLoading ? (
          <TableSkeleton rows={8} columns={6} hasActions />
        ) : filteredQuestions.length === 0 ? (
          <div className={styles.emptyState}>
            <MessageSquareMore className={styles.emptyIcon} />
            <h3 className={styles.emptyTitle}>{t('admin.pushQuestions.empty.title')}</h3>
            <p className={styles.emptyMessage}>{t('admin.pushQuestions.empty.message')}</p>
          </div>
        ) : (
          <table className={styles.table}>
            <thead className={styles.tableHeader}>
              <tr>
                <th style={{ width: '50px' }}>{t('admin.pushQuestions.columns.order')}</th>
                <th>{t('admin.pushQuestions.columns.question')}</th>
                <th>{t('admin.pushQuestions.columns.type')}</th>
                <th>{t('admin.pushQuestions.columns.target')}</th>
                <th style={{ width: '80px' }}>{t('admin.pushQuestions.columns.required')}</th>
                <th style={{ width: '80px' }}>{t('admin.pushQuestions.columns.status')}</th>
                <th>{t('admin.pushQuestions.columns.actions')}</th>
              </tr>
            </thead>
            <tbody className={styles.tableBody}>
              {filteredQuestions.map((question, index) => (
                <tr key={question.id} style={{ opacity: question.isActive ? 1 : 0.6 }}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <GripVertical size={14} style={{ color: 'var(--muted-foreground)', cursor: 'grab' }} />
                      <span>{question.order}</span>
                    </div>
                  </td>
                  <td>
                    <div>
                      <div className={styles.userName}>{question.question}</div>
                      {question.description && (
                        <div className={styles.userEmail}>{question.description}</div>
                      )}
                      {question.answersCount > 0 && (
                        <div className={styles.userEmail} style={{ color: 'var(--primary)' }}>
                          {t('admin.pushQuestions.answerCount', { count: question.answersCount })}
                        </div>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className={styles.planBadge}>
                      {getTypeLabel(question.questionType)}
                    </span>
                  </td>
                  <td>
                    {question.targetAll ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--success)' }}>
                        <Globe size={14} />
                        {t('admin.pushQuestions.target.allSites')}
                      </span>
                    ) : (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--warning)' }}>
                        <Target size={14} />
                        {t('admin.pushQuestions.target.specificSites', { count: question.targetSiteIds?.length || 0 })}
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {question.required ? (
                      <Check size={18} style={{ color: 'var(--success)' }} />
                    ) : (
                      <X size={18} style={{ color: 'var(--muted-foreground)' }} />
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      onClick={() => handleToggleActive(question)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '0.25rem',
                      }}
                      title={question.isActive ? t('admin.pushQuestions.rowActions.clickDeactivate') : t('admin.pushQuestions.rowActions.clickActivate')}
                    >
                      {question.isActive ? (
                        <Eye size={18} style={{ color: 'var(--success)' }} />
                      ) : (
                        <EyeOff size={18} style={{ color: 'var(--muted-foreground)' }} />
                      )}
                    </button>
                  </td>
                  <td>
                    <div className={styles.actionsCell}>
                      <Button
                        variant="icon"
                        onClick={() => handleMoveUp(question.id)}
                        disabled={index === 0}
                        title={t('admin.pushQuestions.rowActions.moveUp')}
                        style={{ opacity: index === 0 ? 0.5 : 1 }}
                      >
                        <ChevronUp size={16} />
                      </Button>
                      <Button
                        variant="icon"
                        onClick={() => handleMoveDown(question.id)}
                        disabled={index === filteredQuestions.length - 1}
                        title={t('admin.pushQuestions.rowActions.moveDown')}
                        style={{ opacity: index === filteredQuestions.length - 1 ? 0.5 : 1 }}
                      >
                        <ChevronDown size={16} />
                      </Button>
                      <Button
                        variant="icon"
                        title={t('admin.pushQuestions.rowActions.edit')}
                        onClick={() => handleEdit(question)}
                      >
                        <Edit2 size={16} />
                      </Button>
                      <Button
                        variant="icon"
                        title={t('admin.pushQuestions.rowActions.translate')}
                        onClick={() => handleTranslate(question)}
                        style={{
                          color: Object.keys(question.translations || {}).length > 0
                            ? 'var(--success)'
                            : undefined
                        }}
                      >
                        <Languages size={16} />
                      </Button>
                      <Button
                        variant="icon"
                        title={t('admin.pushQuestions.rowActions.duplicate')}
                        onClick={() => handleDuplicate(question)}
                      >
                        <Copy size={16} />
                      </Button>
                      <Button
                        variant="icon"
                        iconDanger
                        title={t('admin.pushQuestions.rowActions.delete')}
                        onClick={() => handleDeleteClick(question)}
                      >
                        <Trash2 size={16} />
                      </Button>
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
        title={selectedQuestion ? t('admin.pushQuestions.editModal.titleEdit') : t('admin.pushQuestions.editModal.titleAdd')}
        size="large"
      >
        <form onSubmit={handleSubmit}>
          <FormInput
            label={t('admin.pushQuestions.editModal.questionLabel')}
            value={formData.question}
            onChange={(e) => setFormData({ ...formData, question: e.target.value })}
            required
          />
          <FormTextarea
            label={t('admin.pushQuestions.editModal.descriptionLabel')}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder={t('admin.pushQuestions.editModal.descriptionPlaceholder')}
          />
          <FormSelect
            label={t('admin.pushQuestions.editModal.questionType')}
            value={formData.questionType}
            onChange={(e) => setFormData({ ...formData, questionType: e.target.value })}
            options={QUESTION_TYPES}
          />

          {['CHOICE', 'MULTI_CHOICE'].includes(formData.questionType) && (
            <FormTextarea
              label={t('admin.pushQuestions.editModal.optionsLabel')}
              value={formData.options}
              onChange={(e) => setFormData({ ...formData, options: e.target.value })}
              placeholder={t('admin.pushQuestions.editModal.optionsPlaceholder')}
            />
          )}

          <FormInput
            label={t('admin.pushQuestions.editModal.categoryLabel')}
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            placeholder={t('admin.pushQuestions.editModal.categoryPlaceholder')}
          />

          <div style={{ marginBottom: '1rem' }}>
            <FormCheckbox
              label={t('admin.pushQuestions.editModal.showToAll')}
              checked={formData.targetAll}
              onChange={(e) => setFormData({ ...formData, targetAll: e.target.checked })}
            />
          </div>

          {!formData.targetAll && sites.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                {t('admin.pushQuestions.editModal.selectSpecificSites')}
              </label>
              <div style={{ 
                maxHeight: '150px', 
                overflowY: 'auto', 
                border: '1px solid var(--border)', 
                borderRadius: 'var(--radius-md)',
                padding: '0.5rem',
              }}>
                {sites.map(site => (
                  <label 
                    key={site.id} 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.5rem',
                      padding: '0.375rem',
                      cursor: 'pointer',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={formData.targetSiteIds.includes(site.id)}
                      onChange={() => handleSiteToggle(site.id)}
                    />
                    <span>{site.name || site.url}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <FormCheckbox
            label={t('admin.pushQuestions.editModal.requiredQuestion')}
            checked={formData.required}
            onChange={(e) => setFormData({ ...formData, required: e.target.checked })}
          />

          <FormCheckbox
            label={t('admin.pushQuestions.editModal.activeQuestion')}
            checked={formData.isActive}
            onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
          />

          <FormActions>
            <SecondaryButton type="button" onClick={() => setEditModalOpen(false)}>
              {t('admin.pushQuestions.editModal.cancel')}
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={isSubmitting}>
              {isSubmitting ? t('admin.pushQuestions.editModal.saving') : t('admin.pushQuestions.editModal.save')}
            </PrimaryButton>
          </FormActions>
        </form>
      </AdminModal>

      {/* Translate Modal */}
      <AdminModal
        isOpen={translateModalOpen}
        onClose={() => setTranslateModalOpen(false)}
        title={t('admin.pushQuestions.translateModal.title', { question: selectedQuestion?.question || '' })}
        size="large"
      >
        <form onSubmit={handleTranslationSubmit}>
          <FormSelect
            label={t('admin.pushQuestions.translateModal.selectLanguage')}
            value={selectedLanguage}
            onChange={(e) => handleLanguageChange(e.target.value)}
            options={AVAILABLE_LANGUAGES.filter(l => l !== 'EN').map(lang => ({
              value: lang,
              label: `${lang} ${selectedQuestion?.translations?.[lang] ? '✓' : ''}`,
            }))}
          />

          <div style={{
            background: 'var(--muted)',
            padding: '1rem',
            borderRadius: '0.5rem',
            marginBottom: '1rem',
            fontSize: '0.8125rem',
          }}>
            <strong>{t('admin.pushQuestions.translateModal.originalLabel')}</strong>
            <div style={{ marginTop: '0.5rem' }}>
              <div><strong>{t('admin.pushQuestions.translateModal.questionLabel')}</strong> {selectedQuestion?.question}</div>
              {selectedQuestion?.description && (
                <div><strong>{t('admin.pushQuestions.translateModal.descriptionLabel')}</strong> {selectedQuestion.description}</div>
              )}
              {selectedQuestion?.options && selectedQuestion.options.length > 0 && (
                <div><strong>{t('admin.pushQuestions.translateModal.optionsLabel')}</strong> {selectedQuestion.options.join(', ')}</div>
              )}
            </div>
          </div>

          <FormInput
            label={t('admin.pushQuestions.translateModal.translatedQuestion', { lang: selectedLanguage })}
            value={translationData.question}
            onChange={(e) => setTranslationData({ ...translationData, question: e.target.value })}
            required
            placeholder={selectedQuestion?.question}
          />

          <FormTextarea
            label={t('admin.pushQuestions.translateModal.translatedDescription', { lang: selectedLanguage })}
            value={translationData.description}
            onChange={(e) => setTranslationData({ ...translationData, description: e.target.value })}
            placeholder={selectedQuestion?.description || ''}
          />

          {['CHOICE', 'MULTI_CHOICE'].includes(selectedQuestion?.questionType) && (
            <FormTextarea
              label={t('admin.pushQuestions.translateModal.translatedOptions', { lang: selectedLanguage })}
              value={translationData.options}
              onChange={(e) => setTranslationData({ ...translationData, options: e.target.value })}
              placeholder={selectedQuestion?.options?.join(', ') || t('admin.pushQuestions.translateModal.defaultOptionsPlaceholder')}
            />
          )}

          <FormActions>
            {selectedQuestion?.translations?.[selectedLanguage] && (
              <button
                type="button"
                onClick={handleDeleteTranslation}
                style={{
                  background: 'var(--destructive)',
                  color: 'white',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  marginRight: 'auto',
                }}
              >
                {t('admin.pushQuestions.translateModal.deleteTranslation')}
              </button>
            )}
            <SecondaryButton type="button" onClick={() => setTranslateModalOpen(false)}>
              {t('admin.pushQuestions.translateModal.cancel')}
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={isSubmitting}>
              {isSubmitting ? t('admin.pushQuestions.translateModal.saving') : t('admin.pushQuestions.translateModal.save')}
            </PrimaryButton>
          </FormActions>
        </form>
      </AdminModal>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        title={t('admin.pushQuestions.deleteDialog.title')}
        message={t('admin.pushQuestions.deleteDialog.message')}
        confirmText={t('admin.pushQuestions.deleteDialog.confirm')}
        cancelText={t('admin.pushQuestions.deleteDialog.cancel')}
        variant="danger"
      />
    </div>
  );
}
