'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  RefreshCw,
  Plus,
  Edit2,
  Trash2,
  ChevronUp,
  ChevronDown,
  HelpCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useUser } from '@/app/context/user-context';
import {
  AdminModal,
  ConfirmDialog,
  FormInput,
  FormTextarea,
  FormSelect,
  FormCheckbox,
  FormActions,
  PrimaryButton,
  SecondaryButton,
} from '../components/AdminModal';
import { AdminPageSkeleton, Button } from '@/app/dashboard/components';
import styles from '../admin.module.css';

const AVAILABLE_LANGUAGES = ['en', 'he'];

export default function FAQManagementPage() {
  const router = useRouter();
  const { t } = useLocale();

  const PAGE_OPTIONS = [
    { value: 'pricing', label: t('admin.faq.pageOptions.pricing') },
    { value: 'faq', label: t('admin.faq.pageOptions.faq') },
    { value: 'both', label: t('admin.faq.pageOptions.both') },
  ];

  const CATEGORY_OPTIONS = [
    { value: '', label: t('admin.faq.categories.none') },
    { value: 'general', label: t('admin.faq.categories.general') },
    { value: 'pricing', label: t('admin.faq.categories.pricing') },
    { value: 'features', label: t('admin.faq.categories.features') },
    { value: 'technical', label: t('admin.faq.categories.technical') },
  ];
  const { isSuperAdmin, isLoading: isUserLoading } = useUser();
  const [faqs, setFaqs] = useState([]);
  const [stats, setStats] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [filterPage, setFilterPage] = useState('all');

  // Modal states
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedFaq, setSelectedFaq] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form data with translations for all languages
  const [formData, setFormData] = useState({
    page: 'pricing',
    category: '',
    isActive: true,
    translations: {
      en: { question: '', answer: '' },
      he: { question: '', answer: '' },
    },
  });

  // Redirect non-admin users
  useEffect(() => {
    if (!isUserLoading && !isSuperAdmin) {
      router.push('/dashboard');
    }
  }, [isSuperAdmin, isUserLoading, router]);

  // Load FAQs
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/faq');
      if (!response.ok) throw new Error('Failed to fetch FAQs');
      const data = await response.json();
      setFaqs(data.faqs || []);
      setStats(data.stats || {});
    } catch (error) {
      console.error('Failed to load FAQs:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) loadData();
  }, [isSuperAdmin, loadData]);

  // Filter
  const filteredFaqs = faqs
    .filter((faq) => {
      const content = faq.content || {};
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch =
        !searchQuery ||
        Object.values(content).some(
          (lang) =>
            lang.question?.toLowerCase().includes(searchLower) ||
            lang.answer?.toLowerCase().includes(searchLower)
        );
      const matchesPage =
        filterPage === 'all' || faq.page === filterPage || faq.page === 'both';
      return matchesSearch && matchesPage;
    })
    .sort((a, b) => a.order - b.order);

  // Get display text (prefer current locale, fallback to en)
  const getDisplayText = (content, field) => {
    if (!content) return '';
    const locale = 'en'; // always show English in admin
    return content[locale]?.[field] || content.he?.[field] || '';
  };

  // Open edit modal
  const handleEdit = (faq) => {
    setSelectedFaq(faq);
    const content = faq.content || {};
    setFormData({
      page: faq.page || 'pricing',
      category: faq.category || '',
      isActive: faq.isActive,
      translations: {
        en: { question: content.en?.question || '', answer: content.en?.answer || '' },
        he: { question: content.he?.question || '', answer: content.he?.answer || '' },
      },
    });
    setEditModalOpen(true);
  };

  // Open add modal
  const handleAdd = () => {
    setSelectedFaq(null);
    setFormData({
      page: 'pricing',
      category: '',
      isActive: true,
      translations: {
        en: { question: '', answer: '' },
        he: { question: '', answer: '' },
      },
    });
    setEditModalOpen(true);
  };

  // Submit form
  const handleSubmit = async () => {
    // Validate at least one language has content
    const hasContent = AVAILABLE_LANGUAGES.some(
      (lang) => formData.translations[lang]?.question?.trim()
    );
    if (!hasContent) return;

    setIsSubmitting(true);
    try {
      const content = {};
      AVAILABLE_LANGUAGES.forEach((lang) => {
        const t = formData.translations[lang];
        if (t.question?.trim()) {
          content[lang] = {
            question: t.question.trim(),
            answer: t.answer?.trim() || '',
          };
        }
      });

      const payload = {
        content,
        page: formData.page,
        category: formData.category,
        isActive: formData.isActive,
      };

      if (selectedFaq) {
        payload.id = selectedFaq.id;
        const res = await fetch('/api/admin/faq', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Failed to update FAQ');
      } else {
        const res = await fetch('/api/admin/faq', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Failed to create FAQ');
      }

      setEditModalOpen(false);
      loadData();
    } catch (error) {
      console.error('Error saving FAQ:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete
  const handleDeleteClick = (faq) => {
    setSelectedFaq(faq);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedFaq) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/admin/faq?id=${selectedFaq.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete FAQ');
      setDeleteDialogOpen(false);
      loadData();
    } catch (error) {
      console.error('Error deleting FAQ:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle active
  const handleToggleActive = async (faq) => {
    try {
      const res = await fetch('/api/admin/faq', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: faq.id, isActive: !faq.isActive }),
      });
      if (!res.ok) throw new Error('Failed to toggle');
      loadData();
    } catch (error) {
      console.error('Error toggling FAQ:', error);
    }
  };

  // Move up/down
  const handleMove = async (faq, direction) => {
    const sorted = [...faqs].sort((a, b) => a.order - b.order);
    const index = sorted.findIndex((f) => f.id === faq.id);
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= sorted.length) return;

    const orderedIds = sorted.map((f) => f.id);
    [orderedIds[index], orderedIds[swapIndex]] = [orderedIds[swapIndex], orderedIds[index]];

    try {
      const res = await fetch('/api/admin/faq/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds }),
      });
      if (!res.ok) throw new Error('Failed to reorder');
      loadData();
    } catch (error) {
      console.error('Error reordering FAQs:', error);
    }
  };

  if (isUserLoading) {
    return <AdminPageSkeleton statsCount={4} columns={5} />;
  }

  if (!isSuperAdmin) return null;

  return (
    <div className={styles.adminPage}>
      {/* Header */}
      <div className={styles.adminHeader}>
        <h1 className={styles.adminTitle}>
          {t('admin.faq.title') || 'FAQ Management'}
        </h1>
        <p className={styles.adminSubtitle}>
          {t('admin.faq.subtitle') || 'Manage frequently asked questions for the marketing website'}
        </p>
      </div>

      {/* Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t('admin.faq.stats.total') || 'Total FAQs'}</div>
          <div className={styles.statValue}>{stats.total || 0}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t('admin.faq.stats.active') || 'Active'}</div>
          <div className={styles.statValue}>{stats.active || 0}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t('admin.faq.stats.pricing') || 'Pricing Page'}</div>
          <div className={styles.statValue}>{stats.pricing || 0}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t('admin.faq.stats.faqPage') || 'FAQ Page'}</div>
          <div className={styles.statValue}>{stats.faqPage || 0}</div>
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
              placeholder={t('admin.faq.searchPlaceholder') || 'Search FAQs...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select
            className={styles.filterSelect}
            value={filterPage}
            onChange={(e) => setFilterPage(e.target.value)}
          >
            <option value="all">{t('admin.faq.filter.all') || 'All Pages'}</option>
            <option value="pricing">{t('admin.faq.filter.pricing') || 'Pricing'}</option>
            <option value="faq">{t('admin.faq.filter.faq') || 'FAQ Page'}</option>
            <option value="both">{t('admin.faq.filter.both') || 'Both'}</option>
          </select>
        </div>
        <div className={styles.toolbarRight}>
          <button className={styles.refreshButton} onClick={loadData}>
            <RefreshCw size={16} />
          </button>
          <Button variant="primary" onClick={handleAdd}>
            <Plus size={16} />
            {t('admin.faq.addFaq') || 'Add FAQ'}
          </Button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <AdminPageSkeleton statsCount={0} columns={5} />
      ) : (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead className={styles.tableHeader}>
              <tr>
                <th style={{ width: 60 }}>{t('admin.faq.columns.order') || '#'}</th>
                <th>{t('admin.faq.columns.question') || 'Question'}</th>
                <th style={{ width: 120 }}>{t('admin.faq.columns.page') || 'Page'}</th>
                <th style={{ width: 120 }}>{t('admin.faq.columns.languages') || 'Languages'}</th>
                <th style={{ width: 100 }}>{t('admin.faq.columns.status') || 'Status'}</th>
                <th style={{ width: 160 }}>{t('admin.faq.columns.actions') || 'Actions'}</th>
              </tr>
            </thead>
            <tbody className={styles.tableBody}>
              {filteredFaqs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted-foreground)' }}>
                    {t('admin.faq.noFaqs') || 'No FAQ items found. Click "Add FAQ" to create one.'}
                  </td>
                </tr>
              ) : (
                filteredFaqs.map((faq, index) => {
                  const content = faq.content || {};
                  const languages = Object.keys(content).filter((k) => content[k]?.question);
                  return (
                    <tr key={faq.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <button
                              onClick={() => handleMove(faq, 'up')}
                              disabled={index === 0}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: index === 0 ? 'default' : 'pointer',
                                opacity: index === 0 ? 0.3 : 1,
                                color: 'var(--foreground)',
                                padding: 0,
                              }}
                            >
                              <ChevronUp size={14} />
                            </button>
                            <button
                              onClick={() => handleMove(faq, 'down')}
                              disabled={index === filteredFaqs.length - 1}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: index === filteredFaqs.length - 1 ? 'default' : 'pointer',
                                opacity: index === filteredFaqs.length - 1 ? 0.3 : 1,
                                color: 'var(--foreground)',
                                padding: 0,
                              }}
                            >
                              <ChevronDown size={14} />
                            </button>
                          </div>
                          <span style={{ color: 'var(--muted-foreground)', fontSize: '0.9375rem' }}>
                            {faq.order + 1}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div style={{ maxWidth: 400 }}>
                          <div style={{ fontWeight: 500, marginBottom: 2 }}>
                            {getDisplayText(content, 'question')}
                          </div>
                          <div
                            style={{
                              fontSize: '0.9375rem',
                              color: 'var(--muted-foreground)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {getDisplayText(content, 'answer')}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          style={{
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.8125rem',
                            background: faq.page === 'both' ? 'var(--primary)' : 'var(--muted)',
                            color: faq.page === 'both' ? 'white' : 'var(--foreground)',
                          }}
                        >
                          {faq.page === 'both' ? t('admin.faq.pageBadge.both') : faq.page === 'pricing' ? t('admin.faq.pageBadge.pricing') : t('admin.faq.pageBadge.faq')}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          {AVAILABLE_LANGUAGES.map((lang) => (
                            <span
                              key={lang}
                              style={{
                                padding: '0.15rem 0.4rem',
                                borderRadius: '3px',
                                fontSize: '0.75rem',
                                fontWeight: 500,
                                textTransform: 'uppercase',
                                background: languages.includes(lang)
                                  ? 'var(--success, #22c55e)'
                                  : 'var(--muted)',
                                color: languages.includes(lang) ? 'white' : 'var(--muted-foreground)',
                              }}
                            >
                              {lang}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <button
                          onClick={() => handleToggleActive(faq)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: faq.isActive ? 'var(--success, #22c55e)' : 'var(--muted-foreground)',
                            fontSize: '0.9375rem',
                          }}
                        >
                          {faq.isActive ? <Eye size={14} /> : <EyeOff size={14} />}
                          {faq.isActive
                            ? t('admin.faq.active') || 'Active'
                            : t('admin.faq.inactive') || 'Inactive'}
                        </button>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            onClick={() => handleEdit(faq)}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: 'var(--primary)',
                              padding: '0.25rem',
                            }}
                            title={t('admin.common.edit') || 'Edit'}
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteClick(faq)}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: 'var(--error, #ef4444)',
                              padding: '0.25rem',
                            }}
                            title={t('admin.common.delete') || 'Delete'}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit/Add Modal */}
      <AdminModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title={
          selectedFaq
            ? t('admin.faq.editFaq') || 'Edit FAQ'
            : t('admin.faq.addFaq') || 'Add FAQ'
        }
        size="large"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Settings row */}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <FormSelect
              label={t('admin.faq.fields.page') || 'Display Page'}
              value={formData.page}
              onChange={(e) => setFormData({ ...formData, page: e.target.value })}
              options={PAGE_OPTIONS}
            />
            <FormSelect
              label={t('admin.faq.fields.category') || 'Category'}
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              options={CATEGORY_OPTIONS}
            />
            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '0.25rem' }}>
              <FormCheckbox
                label={t('admin.faq.fields.active') || 'Active'}
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              />
            </div>
          </div>

          {/* Translation tabs */}
          {AVAILABLE_LANGUAGES.map((lang) => (
            <div
              key={lang}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg, 8px)',
                padding: '1rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '1rem',
                  fontWeight: 600,
                  fontSize: '0.9375rem',
                  color: 'var(--foreground)',
                }}
              >
                <span
                  style={{
                    padding: '0.15rem 0.5rem',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    background: 'var(--primary)',
                    color: 'white',
                  }}
                >
                  {lang}
                </span>
                {lang === 'en' ? 'English' : 'עברית'}
              </div>
              <FormInput
                label={t('admin.faq.fields.question') || 'Question'}
                value={formData.translations[lang]?.question || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    translations: {
                      ...formData.translations,
                      [lang]: { ...formData.translations[lang], question: e.target.value },
                    },
                  })
                }
                placeholder={
                  lang === 'he' ? 'הכנס שאלה...' : 'Enter question...'
                }
                dir={lang === 'he' ? 'rtl' : 'ltr'}
              />
              <FormTextarea
                label={t('admin.faq.fields.answer') || 'Answer'}
                value={formData.translations[lang]?.answer || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    translations: {
                      ...formData.translations,
                      [lang]: { ...formData.translations[lang], answer: e.target.value },
                    },
                  })
                }
                placeholder={
                  lang === 'he' ? 'הכנס תשובה...' : 'Enter answer...'
                }
                dir={lang === 'he' ? 'rtl' : 'ltr'}
                rows={4}
              />
            </div>
          ))}

          <FormActions>
            <SecondaryButton onClick={() => setEditModalOpen(false)}>
              {t('admin.common.cancel') || 'Cancel'}
            </SecondaryButton>
            <PrimaryButton onClick={handleSubmit} isLoading={isSubmitting}>
              {selectedFaq
                ? t('admin.common.save') || 'Save'
                : t('admin.faq.addFaq') || 'Add FAQ'}
            </PrimaryButton>
          </FormActions>
        </div>
      </AdminModal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        title={t('admin.faq.deleteTitle') || 'Delete FAQ'}
        message={
          t('admin.faq.deleteMessage') ||
          'Are you sure you want to delete this FAQ item? This action cannot be undone.'
        }
        isLoading={isSubmitting}
      />
    </div>
  );
}
