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
  FolderPlus,
  Settings,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useUser } from '@/app/context/user-context';
import { AdminModal, ConfirmDialog, FormInput, FormTextarea, FormSelect, FormCheckbox, FormActions, PrimaryButton, SecondaryButton } from '../components/AdminModal';
import styles from '../admin.module.css';

export default function InterviewQuestionsPage() {
  const router = useRouter();
  const { t } = useLocale();
  const { isSuperAdmin, isLoading: isUserLoading } = useUser();
  const [questions, setQuestions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Modal states
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    question: '',
    questionKey: '',
    type: 'text',
    categoryId: '',
    placeholder: '',
    options: '',
    required: false,
  });

  // Redirect non-admin users
  useEffect(() => {
    if (!isUserLoading && !isSuperAdmin) {
      router.push('/dashboard');
    }
  }, [isSuperAdmin, isUserLoading, router]);

  // Load questions and categories from API
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/interview-questions');
      if (!response.ok) throw new Error('Failed to fetch questions');
      const data = await response.json();
      setQuestions(data.questions || []);
      setCategories(data.categories || []);
    } catch (error) {
      console.error('Failed to load questions:', error);
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
    const matchesCategory = selectedCategory === 'all' || q.categoryId === selectedCategory;
    return matchesSearch && matchesCategory;
  }).sort((a, b) => a.order - b.order);

  const getCategoryName = (categoryId) => {
    const category = categories.find(c => c.id === categoryId);
    if (!category) return t('admin.common.uncategorized');
    // Try to get translated category name using the category key
    const categoryKey = category.name.replace(/\s+/g, '').charAt(0).toLowerCase() + category.name.replace(/\s+/g, '').slice(1);
    const translated = t(`admin.interviewQuestions.categoryNames.${categoryKey}`);
    return translated && !translated.includes('admin.interviewQuestions.categoryNames') ? translated : category.name;
  };

  // Helper to get translated question text
  const getQuestionText = (question) => {
    if (!question.questionKey) return question.question;
    const translated = t(`admin.interviewQuestions.questions.${question.questionKey}`);
    return translated && !translated.includes('admin.interviewQuestions.questions') ? translated : question.question;
  };

  const getTypeLabel = (type) => {
    return t(`admin.interviewQuestions.types.${type}`) || type;
  };

  const handleMoveUp = (questionId) => {
    const index = questions.findIndex(q => q.id === questionId);
    if (index > 0) {
      const newQuestions = [...questions];
      const currentOrder = newQuestions[index].order;
      newQuestions[index].order = newQuestions[index - 1].order;
      newQuestions[index - 1].order = currentOrder;
      setQuestions(newQuestions);
    }
  };

  const handleMoveDown = (questionId) => {
    const index = questions.findIndex(q => q.id === questionId);
    if (index < questions.length - 1) {
      const newQuestions = [...questions];
      const currentOrder = newQuestions[index].order;
      newQuestions[index].order = newQuestions[index + 1].order;
      newQuestions[index + 1].order = currentOrder;
      setQuestions(newQuestions);
    }
  };

  // Open edit modal
  const handleEdit = (question) => {
    setSelectedQuestion(question);
    setFormData({
      question: question.question,
      questionKey: question.questionKey || '',
      type: question.type,
      categoryId: question.categoryId,
      placeholder: question.placeholder || '',
      options: question.options ? question.options.join(', ') : '',
      required: question.required,
    });
    setEditModalOpen(true);
  };

  // Open add modal
  const handleAdd = () => {
    setSelectedQuestion(null);
    setFormData({
      question: '',
      questionKey: '',
      type: 'text',
      categoryId: categories[0]?.id || '',
      placeholder: '',
      options: '',
      required: false,
    });
    setEditModalOpen(true);
  };

  // Handle duplicate
  const handleDuplicate = async (question) => {
    try {
      const response = await fetch('/api/admin/interview-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: `${question.question} (Copy)`,
          questionKey: question.questionKey ? `${question.questionKey}Copy` : null,
          type: question.type,
          categoryId: question.categoryId,
          placeholder: question.placeholder,
          options: question.options,
          required: question.required,
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
      const response = await fetch(`/api/admin/interview-questions/${selectedQuestion.id}`, {
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
        questionKey: formData.questionKey || null,
        type: formData.type,
        categoryId: formData.categoryId,
        placeholder: formData.placeholder || null,
        options: formData.options ? formData.options.split(',').map(o => o.trim()).filter(Boolean) : [],
        required: formData.required,
      };

      const url = selectedQuestion
        ? `/api/admin/interview-questions/${selectedQuestion.id}`
        : '/api/admin/interview-questions';
      
      const method = selectedQuestion ? 'PUT' : 'POST';

      const response = await fetch(url, {
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
        <h1 className={styles.adminTitle}>{t('admin.interviewQuestions.title')}</h1>
        <p className={styles.adminSubtitle}>{t('admin.interviewQuestions.subtitle')}</p>
      </div>

      {/* Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t('admin.stats.totalQuestions')}</div>
          <div className={styles.statValue}>{questions.length}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t('admin.stats.categories')}</div>
          <div className={styles.statValue}>{categories.length}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t('admin.stats.required')}</div>
          <div className={styles.statValue}>{questions.filter(q => q.required).length}</div>
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
              placeholder={t('admin.interviewQuestions.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{
              padding: '0.625rem 1rem',
              fontSize: '0.875rem',
              background: 'var(--input)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              color: 'var(--foreground)',
              cursor: 'pointer',
            }}
          >
            <option value="all">{t('admin.common.allCategories')}</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>
        <div className={styles.toolbarRight}>
          <button className={styles.refreshButton} onClick={loadData}>
            <RefreshCw size={16} />
          </button>
          <button className={styles.exportButton}>
            <FolderPlus size={16} />
            <span>{t('admin.interviewQuestions.addCategory')}</span>
          </button>
          <button className={styles.addButton} onClick={handleAdd}>
            <Plus size={16} />
            <span>{t('admin.interviewQuestions.addQuestion')}</span>
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
            <h3 className={styles.emptyTitle}>{t('admin.interviewQuestions.noQuestions')}</h3>
            <p className={styles.emptyMessage}>{t('admin.common.noResults')}</p>
          </div>
        ) : (
          <table className={styles.table}>
            <thead className={styles.tableHeader}>
              <tr>
                <th style={{ width: '50px' }}>{t('admin.interviewQuestions.columns.order')}</th>
                <th>{t('admin.interviewQuestions.columns.question')}</th>
                <th>{t('admin.interviewQuestions.columns.type')}</th>
                <th>{t('admin.interviewQuestions.columns.category')}</th>
                <th style={{ width: '80px' }}>{t('admin.interviewQuestions.columns.required')}</th>
                <th>{t('admin.interviewQuestions.columns.actions')}</th>
              </tr>
            </thead>
            <tbody className={styles.tableBody}>
              {filteredQuestions.map((question, index) => (
                <tr key={question.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <GripVertical size={14} style={{ color: 'var(--muted-foreground)', cursor: 'grab' }} />
                      <span>{question.order}</span>
                    </div>
                  </td>
                  <td>
                    <div>
                      <div className={styles.userName}>{getQuestionText(question)}</div>
                      {question.options && (
                        <div className={styles.userEmail}>
                          {t('admin.common.options')}: {question.options.slice(0, 3).join(', ')}
                          {question.options.length > 3 && ` ${t('admin.common.more').replace('{count}', question.options.length - 3)}`}
                        </div>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className={styles.planBadge}>
                      <Settings size={12} />
                      {getTypeLabel(question.type)}
                    </span>
                  </td>
                  <td>{getCategoryName(question.categoryId)}</td>
                  <td style={{ textAlign: 'center' }}>
                    {question.required ? (
                      <Check size={18} style={{ color: 'var(--success)' }} />
                    ) : (
                      <X size={18} style={{ color: 'var(--muted-foreground)' }} />
                    )}
                  </td>
                  <td>
                    <div className={styles.actionsCell}>
                      <button
                        className={styles.actionButton}
                        onClick={() => handleMoveUp(question.id)}
                        disabled={index === 0}
                        title={t('admin.interviewQuestions.actions.moveUp')}
                        style={{ opacity: index === 0 ? 0.5 : 1 }}
                      >
                        <ChevronUp size={16} />
                      </button>
                      <button
                        className={styles.actionButton}
                        onClick={() => handleMoveDown(question.id)}
                        disabled={index === filteredQuestions.length - 1}
                        title={t('admin.interviewQuestions.actions.moveDown')}
                        style={{ opacity: index === filteredQuestions.length - 1 ? 0.5 : 1 }}
                      >
                        <ChevronDown size={16} />
                      </button>
                      <button 
                        className={styles.actionButton} 
                        title={t('admin.interviewQuestions.actions.edit')}
                        onClick={() => handleEdit(question)}
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        className={styles.actionButton} 
                        title={t('admin.interviewQuestions.actions.duplicate')}
                        onClick={() => handleDuplicate(question)}
                      >
                        <Copy size={16} />
                      </button>
                      <button 
                        className={`${styles.actionButton} ${styles.danger}`} 
                        title={t('admin.interviewQuestions.actions.delete')}
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
        title={selectedQuestion ? t('admin.interviewQuestions.actions.edit') : t('admin.interviewQuestions.addQuestion')}
      >
        <form onSubmit={handleSubmit}>
          <FormInput
            label={t('admin.interviewQuestions.columns.question')}
            value={formData.question}
            onChange={(e) => setFormData({ ...formData, question: e.target.value })}
            required
          />
          <FormInput
            label={t('admin.interviewQuestions.form.questionKey')}
            value={formData.questionKey}
            onChange={(e) => setFormData({ ...formData, questionKey: e.target.value })}
            placeholder="e.g., businessGoals"
            required
          />
          <FormSelect
            label={t('admin.interviewQuestions.columns.type')}
            value={formData.type}
            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
            options={[
              { value: 'text', label: t('admin.interviewQuestions.types.text') },
              { value: 'textarea', label: t('admin.interviewQuestions.types.textarea') },
              { value: 'select', label: t('admin.interviewQuestions.types.select') },
              { value: 'multiselect', label: t('admin.interviewQuestions.types.multiselect') },
              { value: 'radio', label: t('admin.interviewQuestions.types.radio') },
              { value: 'checkbox', label: t('admin.interviewQuestions.types.checkbox') },
              { value: 'scale', label: t('admin.interviewQuestions.types.scale') },
            ]}
          />
          <FormInput
            label={`${t('admin.interviewQuestions.form.placeholder')} (${t('admin.common.optional')})`}
            value={formData.placeholder}
            onChange={(e) => setFormData({ ...formData, placeholder: e.target.value })}
          />
          {['select', 'multiselect', 'radio', 'checkbox'].includes(formData.type) && (
            <FormTextarea
              label={`${t('admin.common.options')} (${t('admin.interviewQuestions.form.commaSeparated')})`}
              value={formData.options}
              onChange={(e) => setFormData({ ...formData, options: e.target.value })}
              placeholder="Option 1, Option 2, Option 3"
            />
          )}
          <FormCheckbox
            label={t('admin.interviewQuestions.columns.required')}
            checked={formData.required}
            onChange={(e) => setFormData({ ...formData, required: e.target.checked })}
          />
          <FormActions>
            <SecondaryButton type="button" onClick={() => setEditModalOpen(false)}>
              {t('admin.common.cancel')}
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={isSubmitting}>
              {isSubmitting ? t('admin.common.saving') : t('admin.common.save')}
            </PrimaryButton>
          </FormActions>
        </form>
      </AdminModal>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        title={t('admin.interviewQuestions.actions.delete')}
        message={t('admin.common.confirmDelete')}
        confirmText={t('admin.common.delete')}
        cancelText={t('admin.common.cancel')}
        variant="danger"
      />
    </div>
  );
}
