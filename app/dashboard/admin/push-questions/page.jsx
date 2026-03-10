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
import { AdminPageSkeleton, TableSkeleton } from '@/app/dashboard/components';
import styles from '../admin.module.css';

const QUESTION_TYPES = [
  { value: 'TEXT', label: 'Short Text' },
  { value: 'TEXTAREA', label: 'Long Text' },
  { value: 'CHOICE', label: 'Single Choice' },
  { value: 'MULTI_CHOICE', label: 'Multiple Choice' },
  { value: 'NUMBER', label: 'Number' },
  { value: 'URL', label: 'URL' },
];

const AVAILABLE_LANGUAGES = ['EN', 'HE', 'FR'];

export default function PushQuestionsPage() {
  const router = useRouter();
  const { t } = useLocale();
  const { isSuperAdmin, isLoading: isUserLoading } = useUser();
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
    const found = QUESTION_TYPES.find(t => t.value === type);
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
          question: `${question.question} (Copy)`,
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
    
    if (!confirm(`Delete ${selectedLanguage} translation?`)) return;

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
        <h1 className={styles.adminTitle}>Push Questions</h1>
        <p className={styles.adminSubtitle}>Questions displayed to users on the site profile page</p>
      </div>

      {/* Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Total Questions</div>
          <div className={styles.statValue}>{stats.total}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Active Questions</div>
          <div className={styles.statValue}>{stats.active}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Required Questions</div>
          <div className={styles.statValue}>{stats.required}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Total Answers</div>
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
              placeholder="Search questions..."
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
            <option value="all">All Questions</option>
            <option value="active">Active Questions</option>
            <option value="inactive">Inactive Questions</option>
          </select>
        </div>
        <div className={styles.toolbarRight}>
          <button className={styles.refreshButton} onClick={loadData}>
            <RefreshCw size={16} />
          </button>
          <button className={styles.addButton} onClick={handleAdd}>
            <Plus size={16} />
            <span>Add Question</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className={styles.tableContainer}>
        {isLoading ? (
          <TableSkeleton rows={8} columns={6} hasActions />
        ) : filteredQuestions.length === 0 ? (
          <div className={styles.emptyState}>
            <MessageSquareMore className={styles.emptyIcon} />
            <h3 className={styles.emptyTitle}>No Questions</h3>
            <p className={styles.emptyMessage}>Add push questions to display to users</p>
          </div>
        ) : (
          <table className={styles.table}>
            <thead className={styles.tableHeader}>
              <tr>
                <th style={{ width: '50px' }}>Order</th>
                <th>Question</th>
                <th>Type</th>
                <th>Target</th>
                <th style={{ width: '80px' }}>Required</th>
                <th style={{ width: '80px' }}>Status</th>
                <th>Actions</th>
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
                          {question.answersCount} answers
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
                        All Sites
                      </span>
                    ) : (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--warning)' }}>
                        <Target size={14} />
                        {question.targetSiteIds?.length || 0} sites
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
                      title={question.isActive ? 'Click to deactivate' : 'Click to activate'}
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
                      <button
                        className={styles.actionButton}
                        onClick={() => handleMoveUp(question.id)}
                        disabled={index === 0}
                        title="Move Up"
                        style={{ opacity: index === 0 ? 0.5 : 1 }}
                      >
                        <ChevronUp size={16} />
                      </button>
                      <button
                        className={styles.actionButton}
                        onClick={() => handleMoveDown(question.id)}
                        disabled={index === filteredQuestions.length - 1}
                        title="Move Down"
                        style={{ opacity: index === filteredQuestions.length - 1 ? 0.5 : 1 }}
                      >
                        <ChevronDown size={16} />
                      </button>
                      <button 
                        className={styles.actionButton} 
                        title="Edit"
                        onClick={() => handleEdit(question)}
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        className={styles.actionButton} 
                        title="Translate"
                        onClick={() => handleTranslate(question)}
                        style={{ 
                          color: Object.keys(question.translations || {}).length > 0 
                            ? 'var(--success)' 
                            : undefined 
                        }}
                      >
                        <Languages size={16} />
                      </button>
                      <button 
                        className={styles.actionButton} 
                        title="Duplicate"
                        onClick={() => handleDuplicate(question)}
                      >
                        <Copy size={16} />
                      </button>
                      <button 
                        className={`${styles.actionButton} ${styles.danger}`} 
                        title="Delete"
                        onClick={() => handleDeleteClick(question)}
                      >
                        <Trash2 size={16} />
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
        title={selectedQuestion ? 'Edit Question' : 'Add New Question'}
        size="large"
      >
        <form onSubmit={handleSubmit}>
          <FormInput
            label="Question *"
            value={formData.question}
            onChange={(e) => setFormData({ ...formData, question: e.target.value })}
            required
          />
          <FormTextarea
            label="Description / Hint"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Description or hint to help users understand the question"
          />
          <FormSelect
            label="Question Type"
            value={formData.questionType}
            onChange={(e) => setFormData({ ...formData, questionType: e.target.value })}
            options={QUESTION_TYPES}
          />
          
          {['CHOICE', 'MULTI_CHOICE'].includes(formData.questionType) && (
            <FormTextarea
              label="Options (comma separated)"
              value={formData.options}
              onChange={(e) => setFormData({ ...formData, options: e.target.value })}
              placeholder="Option 1, Option 2, Option 3"
            />
          )}

          <FormInput
            label="Category (optional)"
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            placeholder="e.g., Marketing, Content, Technical"
          />

          <div style={{ marginBottom: '1rem' }}>
            <FormCheckbox
              label="Show to all sites"
              checked={formData.targetAll}
              onChange={(e) => setFormData({ ...formData, targetAll: e.target.checked })}
            />
          </div>

          {!formData.targetAll && sites.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                Select specific sites:
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
            label="Required question (cannot skip)"
            checked={formData.required}
            onChange={(e) => setFormData({ ...formData, required: e.target.checked })}
          />
          
          <FormCheckbox
            label="Active question"
            checked={formData.isActive}
            onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
          />

          <FormActions>
            <SecondaryButton type="button" onClick={() => setEditModalOpen(false)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save'}
            </PrimaryButton>
          </FormActions>
        </form>
      </AdminModal>

      {/* Translate Modal */}
      <AdminModal
        isOpen={translateModalOpen}
        onClose={() => setTranslateModalOpen(false)}
        title={`Translate: ${selectedQuestion?.question || ''}`}
        size="large"
      >
        <form onSubmit={handleTranslationSubmit}>
          <FormSelect
            label="Select Language"
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
            <strong>Original (EN):</strong>
            <div style={{ marginTop: '0.5rem' }}>
              <div><strong>Question:</strong> {selectedQuestion?.question}</div>
              {selectedQuestion?.description && (
                <div><strong>Description:</strong> {selectedQuestion.description}</div>
              )}
              {selectedQuestion?.options && selectedQuestion.options.length > 0 && (
                <div><strong>Options:</strong> {selectedQuestion.options.join(', ')}</div>
              )}
            </div>
          </div>

          <FormInput
            label={`Question (${selectedLanguage}) *`}
            value={translationData.question}
            onChange={(e) => setTranslationData({ ...translationData, question: e.target.value })}
            required
            placeholder={selectedQuestion?.question}
          />
          
          <FormTextarea
            label={`Description (${selectedLanguage})`}
            value={translationData.description}
            onChange={(e) => setTranslationData({ ...translationData, description: e.target.value })}
            placeholder={selectedQuestion?.description || ''}
          />

          {['CHOICE', 'MULTI_CHOICE'].includes(selectedQuestion?.questionType) && (
            <FormTextarea
              label={`Options (${selectedLanguage}, comma separated)`}
              value={translationData.options}
              onChange={(e) => setTranslationData({ ...translationData, options: e.target.value })}
              placeholder={selectedQuestion?.options?.join(', ') || 'Option 1, Option 2, Option 3'}
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
                Delete Translation
              </button>
            )}
            <SecondaryButton type="button" onClick={() => setTranslateModalOpen(false)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Translation'}
            </PrimaryButton>
          </FormActions>
        </form>
      </AdminModal>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        title="Delete Question"
        message="Are you sure you want to delete this question? All saved answers will also be deleted."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
}
