'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Filter,
  RefreshCw,
  Plus,
  Edit2,
  Trash2,
  Copy,
  Archive,
  FileStack,
  Check,
  X,
  Users,
  Sparkles,
  RotateCcw,
  Languages,
  Globe,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useUser } from '@/app/context/user-context';
import { AdminModal, ConfirmDialog, FormInput, FormTextarea, FormCheckbox, FormSelect, FormActions, PrimaryButton, SecondaryButton } from '../components/AdminModal';
import styles from '../admin.module.css';

export default function PlansSettingsPage() {
  const router = useRouter();
  const { t, locale } = useLocale();
  const { isSuperAdmin, isLoading: isUserLoading } = useUser();
  const [plans, setPlans] = useState([]);
  const [stats, setStats] = useState({ totalPlans: 0, totalSubscribers: 0, avgPrice: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [expandedPlan, setExpandedPlan] = useState(null);

  // Available languages for translations
  const availableLanguages = ['EN', 'HE', 'AR', 'ES', 'FR', 'DE', 'PT', 'IT', 'RU', 'ZH', 'JA', 'KO'];

  // Helper to get translated plan name based on current locale
  const getPlanName = (plan) => {
    const currentLang = locale?.toUpperCase() || 'EN';
    if (plan.translations && plan.translations[currentLang]?.name) {
      return plan.translations[currentLang].name;
    }
    return plan.name;
  };

  // Helper to get translated plan description
  const getPlanDescription = (plan) => {
    const currentLang = locale?.toUpperCase() || 'EN';
    if (plan.translations && plan.translations[currentLang]?.description) {
      return plan.translations[currentLang].description;
    }
    return plan.description;
  };

  // Helper to get translated features
  const getPlanFeatures = (plan) => {
    const currentLang = locale?.toUpperCase() || 'EN';
    if (plan.translations && plan.translations[currentLang]?.features?.length > 0) {
      return plan.features.map((f, idx) => ({
        name: plan.translations[currentLang].features[idx] || f.name,
        included: f.included,
      }));
    }
    return plan.features;
  };

  // Modal states
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [translateModalOpen, setTranslateModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    price: '',
    yearlyPrice: '',
    features: '',
    isActive: true,
  });

  // Translation form state
  const [selectedLanguage, setSelectedLanguage] = useState('HE');
  const [translationData, setTranslationData] = useState({
    name: '',
    description: '',
    features: '',
  });
  const [existingTranslations, setExistingTranslations] = useState({});

  // Redirect non-admin users
  useEffect(() => {
    if (!isUserLoading && !isSuperAdmin) {
      router.push('/dashboard');
    }
  }, [isSuperAdmin, isUserLoading, router]);

  // Load plans from API
  const loadPlans = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/plans');
      if (!response.ok) throw new Error('Failed to fetch plans');
      const data = await response.json();
      setPlans(data.plans || []);
      setStats(data.stats || { totalPlans: 0, totalSubscribers: 0, avgPrice: 0 });
    } catch (error) {
      console.error('Failed to load plans:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) {
      loadPlans();
    }
  }, [isSuperAdmin, loadPlans]);

  // Filter plans by search query
  const filteredPlans = plans.filter(plan =>
    plan.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    plan.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  // Open edit modal
  const handleEdit = (plan) => {
    setSelectedPlan(plan);
    setFormData({
      name: plan.name,
      slug: plan.slug,
      description: plan.description || '',
      price: plan.monthlyPrice?.toString() || '',
      yearlyPrice: plan.yearlyPrice?.toString() || '',
      features: plan.features.map(f => f.name).join('\n'),
      isActive: plan.status === 'active',
    });
    setEditModalOpen(true);
  };

  // Open add modal
  const handleAdd = () => {
    setSelectedPlan(null);
    setFormData({
      name: '',
      slug: '',
      description: '',
      price: '',
      yearlyPrice: '',
      features: '',
      isActive: true,
    });
    setEditModalOpen(true);
  };

  // Close edit modal
  const closeEditModal = () => {
    setEditModalOpen(false);
    setSelectedPlan(null);
  };

  // Submit edit/add form
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const featuresArray = formData.features
        .split('\n')
        .map(f => f.trim())
        .filter(f => f);

      const payload = {
        name: formData.name,
        slug: formData.slug,
        description: formData.description,
        price: parseFloat(formData.price) || 0,
        yearlyPrice: formData.yearlyPrice ? parseFloat(formData.yearlyPrice) : null,
        features: featuresArray,
        isActive: formData.isActive,
      };

      let response;
      if (selectedPlan) {
        // Update existing plan
        response = await fetch(`/api/admin/plans/${selectedPlan.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        // Create new plan
        response = await fetch('/api/admin/plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save plan');
      }

      closeEditModal();
      loadPlans();
    } catch (error) {
      console.error('Error saving plan:', error);
      alert(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Duplicate plan
  const handleDuplicate = async (plan) => {
    try {
      const response = await fetch(`/api/admin/plans/${plan.id}`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to duplicate plan');
      }

      loadPlans();
    } catch (error) {
      console.error('Error duplicating plan:', error);
      alert(error.message);
    }
  };

  // Open delete confirmation
  const handleDeleteClick = (plan) => {
    setSelectedPlan(plan);
    setDeleteDialogOpen(true);
  };

  // Confirm delete
  const handleDeleteConfirm = async () => {
    if (!selectedPlan) return;
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/admin/plans/${selectedPlan.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete plan');
      }

      setDeleteDialogOpen(false);
      setSelectedPlan(null);
      loadPlans();
    } catch (error) {
      console.error('Error deleting plan:', error);
      alert(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open translate modal
  const handleTranslate = (plan) => {
    setSelectedPlan(plan);
    setExistingTranslations(plan.translations || {});
    // Default to first non-EN language or HE
    const firstLang = 'HE';
    setSelectedLanguage(firstLang);
    const existing = plan.translations?.[firstLang];
    setTranslationData({
      name: existing?.name || '',
      description: existing?.description || '',
      features: existing?.features?.join('\n') || '',
    });
    setTranslateModalOpen(true);
  };

  // Handle language change in translate modal
  const handleLanguageChange = (lang) => {
    setSelectedLanguage(lang);
    const existing = existingTranslations[lang];
    setTranslationData({
      name: existing?.name || '',
      description: existing?.description || '',
      features: existing?.features?.join('\n') || '',
    });
  };

  // Submit translation
  const handleTranslationSubmit = async (e) => {
    e.preventDefault();
    if (!selectedPlan) return;
    setIsSubmitting(true);

    try {
      const featuresArray = translationData.features
        .split('\n')
        .map(f => f.trim())
        .filter(f => f);

      const response = await fetch(`/api/admin/plans/${selectedPlan.id}/translations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: selectedLanguage,
          name: translationData.name,
          description: translationData.description,
          features: featuresArray,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save translation');
      }

      // Update local state
      setExistingTranslations(prev => ({
        ...prev,
        [selectedLanguage]: {
          name: translationData.name,
          description: translationData.description,
          features: featuresArray,
        },
      }));

      // Reload plans to get updated data
      loadPlans();
      alert(t('admin.plans.translations.saved'));
    } catch (error) {
      console.error('Error saving translation:', error);
      alert(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete translation
  const handleDeleteTranslation = async () => {
    if (!selectedPlan || !selectedLanguage) return;
    
    if (!confirm(t('admin.plans.translations.confirmDelete'))) return;
    
    setIsSubmitting(true);
    try {
      const response = await fetch(
        `/api/admin/plans/${selectedPlan.id}/translations?language=${selectedLanguage}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete translation');
      }

      // Update local state
      setExistingTranslations(prev => {
        const updated = { ...prev };
        delete updated[selectedLanguage];
        return updated;
      });

      // Reset form
      setTranslationData({ name: '', description: '', features: '' });
      loadPlans();
    } catch (error) {
      console.error('Error deleting translation:', error);
      alert(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Archive/Activate plan
  const handleToggleActive = async (plan) => {
    try {
      const response = await fetch(`/api/admin/plans/${plan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: plan.status !== 'active' }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update plan');
      }

      loadPlans();
    } catch (error) {
      console.error('Error updating plan:', error);
      alert(error.message);
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
        <h1 className={styles.adminTitle}>{t('admin.plans.title')}</h1>
        <p className={styles.adminSubtitle}>{t('admin.plans.subtitle')}</p>
      </div>

      {/* Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t('admin.stats.totalPlans')}</div>
          <div className={styles.statValue}>{stats.totalPlans}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t('admin.stats.totalSubscribers')}</div>
          <div className={styles.statValue}>{stats.totalSubscribers}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t('admin.stats.avgPrice')}</div>
          <div className={styles.statValue}>{formatCurrency(stats.avgPrice)}</div>
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
              placeholder={t('admin.plans.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button className={styles.filterButton}>
            <Filter size={16} />
            <span>{t('admin.common.filter')}</span>
          </button>
        </div>
        <div className={styles.toolbarRight}>
          <button className={styles.refreshButton} onClick={loadPlans}>
            <RefreshCw size={16} />
          </button>
          <button className={styles.addButton} onClick={handleAdd}>
            <Plus size={16} />
            <span>{t('admin.plans.addPlan')}</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className={styles.tableContainer}>
        {isLoading ? (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
          </div>
        ) : filteredPlans.length === 0 ? (
          <div className={styles.emptyState}>
            <FileStack className={styles.emptyIcon} />
            <h3 className={styles.emptyTitle}>{t('admin.plans.noPlans')}</h3>
            <p className={styles.emptyMessage}>{t('admin.common.noResults')}</p>
          </div>
        ) : (
          <table className={styles.table}>
            <thead className={styles.tableHeader}>
              <tr>
                <th>{t('admin.plans.columns.name')}</th>
                <th>{t('admin.plans.columns.price')}</th>
                <th>{t('admin.plans.columns.features')}</th>
                <th>{t('admin.plans.columns.subscribers')}</th>
                <th>{t('admin.plans.columns.status')}</th>
                <th>{t('admin.plans.columns.actions')}</th>
              </tr>
            </thead>
            <tbody className={styles.tableBody}>
              {filteredPlans.map((plan) => (
                <tr key={plan.id}>
                  <td>
                    <div className={styles.userCell}>
                      <div className={styles.avatar} style={{ background: plan.status === 'archived' ? 'var(--muted)' : 'var(--gradient-primary)' }}>
                        <Sparkles size={16} />
                      </div>
                      <div>
                        <div className={styles.userName}>{getPlanName(plan)}</div>
                        <div className={styles.userEmail}>{getPlanDescription(plan)}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div>
                      <div style={{ fontWeight: 600 }}>
                        {formatCurrency(plan.monthlyPrice)}{t('admin.subscriptions.billingCycles.perMonth')}
                      </div>
                      <div className={styles.userEmail}>
                        {formatCurrency(plan.yearlyPrice)}{t('admin.subscriptions.billingCycles.perYear')}
                      </div>
                    </div>
                  </td>
                  <td>
                    <button
                      onClick={() => setExpandedPlan(expandedPlan === plan.id ? null : plan.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--primary)',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                      }}
                    >
                      {plan.features.filter(f => f.included).length} {t('admin.common.features')}
                    </button>
                    {expandedPlan === plan.id && (
                      <div style={{ marginTop: '0.5rem' }}>
                        {getPlanFeatures(plan).map((feature, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              fontSize: '0.75rem',
                              color: feature.included ? 'var(--foreground)' : 'var(--muted-foreground)',
                              marginBottom: '0.25rem',
                            }}
                          >
                            {feature.included ? (
                              <Check size={12} style={{ color: 'var(--success)' }} />
                            ) : (
                              <X size={12} />
                            )}
                            {feature.name}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Users size={14} style={{ color: 'var(--muted-foreground)' }} />
                      {plan.subscribersCount}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className={`${styles.statusBadge} ${styles[plan.status === 'archived' ? 'inactive' : plan.status]}`}>
                        {t(`admin.plans.statuses.${plan.status}`)}
                      </span>
                      {Object.keys(plan.translations || {}).length > 0 && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', color: 'var(--muted-foreground)' }}>
                          <Globe size={12} />
                          {Object.keys(plan.translations).length}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className={styles.actionsCell}>
                      <button 
                        className={styles.actionButton} 
                        title={t('admin.plans.actions.translate')}
                        onClick={() => handleTranslate(plan)}
                      >
                        <Languages size={16} />
                      </button>
                      <button 
                        className={styles.actionButton} 
                        title={t('admin.plans.actions.edit')}
                        onClick={() => handleEdit(plan)}
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        className={styles.actionButton} 
                        title={t('admin.plans.actions.duplicate')}
                        onClick={() => handleDuplicate(plan)}
                      >
                        <Copy size={16} />
                      </button>
                      {plan.status === 'active' ? (
                        <button 
                          className={styles.actionButton} 
                          title={t('admin.plans.actions.archive')}
                          onClick={() => handleToggleActive(plan)}
                        >
                          <Archive size={16} />
                        </button>
                      ) : (
                        <>
                          <button 
                            className={styles.actionButton} 
                            title={t('admin.common.reactivate')}
                            onClick={() => handleToggleActive(plan)}
                          >
                            <RotateCcw size={16} />
                          </button>
                          <button 
                            className={`${styles.actionButton} ${styles.danger}`} 
                            title={t('admin.plans.actions.delete')}
                            onClick={() => handleDeleteClick(plan)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
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
        onClose={closeEditModal}
        title={selectedPlan ? t('admin.plans.actions.edit') : t('admin.plans.addPlan')}
        size="medium"
      >
        <form onSubmit={handleSubmit}>
          <FormInput
            label={t('admin.plans.columns.name')}
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
          <FormInput
            label="Slug"
            value={formData.slug}
            onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
            required
            disabled={selectedPlan?.subscribersCount > 0}
          />
          <FormTextarea
            label={t('admin.plans.columns.description')}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={2}
          />
          <FormInput
            label={`${t('admin.plans.columns.price')} (${t('admin.plans.form.monthly')})`}
            type="number"
            step="0.01"
            min="0"
            value={formData.price}
            onChange={(e) => setFormData({ ...formData, price: e.target.value })}
            required
          />
          <FormInput
            label={`${t('admin.plans.columns.price')} (${t('admin.plans.form.yearly')})`}
            type="number"
            step="0.01"
            min="0"
            value={formData.yearlyPrice}
            onChange={(e) => setFormData({ ...formData, yearlyPrice: e.target.value })}
            placeholder={t('admin.plans.form.yearlyPlaceholder')}
          />
          <FormTextarea
            label={`${t('admin.plans.columns.features')} (${t('admin.common.options')})`}
            value={formData.features}
            onChange={(e) => setFormData({ ...formData, features: e.target.value })}
            placeholder="One feature per line"
            rows={4}
          />
          <FormCheckbox
            label={t('admin.plans.statuses.active')}
            checked={formData.isActive}
            onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
          />
          <FormActions>
            <SecondaryButton type="button" onClick={closeEditModal}>
              {t('admin.common.cancel')}
            </SecondaryButton>
            <PrimaryButton type="submit" isLoading={isSubmitting}>
              {t('admin.common.save')}
            </PrimaryButton>
          </FormActions>
        </form>
      </AdminModal>

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
      <AdminModal
        isOpen={translateModalOpen}
        onClose={() => setTranslateModalOpen(false)}
        title={`${t('admin.plans.actions.translate')}: ${selectedPlan?.name || ''}`}
        size="large"
      >
        {selectedPlan && (
          <form onSubmit={handleTranslationSubmit}>
            <div style={{ marginBottom: '1rem' }}>
              <FormSelect
                label={t('admin.plans.translations.selectLanguage')}
                value={selectedLanguage}
                onChange={(e) => handleLanguageChange(e.target.value)}
                options={availableLanguages.filter(l => l !== 'EN').map(lang => ({
                  value: lang,
                  label: `${lang} ${existingTranslations[lang] ? '✓' : ''}`,
                }))}
              />
            </div>

            <div style={{ 
              background: 'var(--muted)', 
              padding: '1rem', 
              borderRadius: '0.5rem', 
              marginBottom: '1rem',
              fontSize: '0.875rem',
            }}>
              <strong>{t('admin.plans.translations.original')} (EN):</strong>
              <div style={{ marginTop: '0.5rem' }}>
                <div><strong>{t('admin.plans.columns.name')}:</strong> {selectedPlan.name}</div>
                <div><strong>{t('admin.plans.columns.description')}:</strong> {selectedPlan.description || '-'}</div>
                <div><strong>{t('admin.plans.columns.features')}:</strong></div>
                <ul style={{ margin: '0.25rem 0 0 1.5rem', padding: 0 }}>
                  {selectedPlan.features.map((f, idx) => (
                    <li key={idx}>{f.name}</li>
                  ))}
                </ul>
              </div>
            </div>

            <FormInput
              label={`${t('admin.plans.columns.name')} (${selectedLanguage})`}
              value={translationData.name}
              onChange={(e) => setTranslationData({ ...translationData, name: e.target.value })}
              required
              placeholder={selectedPlan.name}
            />
            <FormTextarea
              label={`${t('admin.plans.columns.description')} (${selectedLanguage})`}
              value={translationData.description}
              onChange={(e) => setTranslationData({ ...translationData, description: e.target.value })}
              rows={2}
              placeholder={selectedPlan.description || ''}
            />
            <FormTextarea
              label={`${t('admin.plans.columns.features')} (${selectedLanguage})`}
              value={translationData.features}
              onChange={(e) => setTranslationData({ ...translationData, features: e.target.value })}
              placeholder={t('admin.plans.translations.featuresPlaceholder')}
              rows={4}
            />
            <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: '-0.5rem', marginBottom: '1rem' }}>
              {t('admin.plans.translations.featuresHint')}
            </p>

            <FormActions>
              {existingTranslations[selectedLanguage] && (
                <button
                  type="button"
                  onClick={handleDeleteTranslation}
                  disabled={isSubmitting}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--destructive)',
                    color: 'var(--destructive)',
                    padding: '0.5rem 1rem',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    marginRight: 'auto',
                  }}
                >
                  {t('admin.plans.translations.deleteTranslation')}
                </button>
              )}
              <SecondaryButton type="button" onClick={() => setTranslateModalOpen(false)}>
                {t('admin.common.close')}
              </SecondaryButton>
              <PrimaryButton type="submit" isLoading={isSubmitting}>
                {t('admin.plans.translations.save')}
              </PrimaryButton>
            </FormActions>
          </form>
        )}
      </AdminModal>
    </div>
  );
}
