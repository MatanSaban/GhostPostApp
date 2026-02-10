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
  Archive,
  Package,
  Check,
  X,
  Users,
  Globe,
  Languages,
  RotateCcw,
  Sparkles,
  Coins,
  HardDrive,
  Key,
  FileText,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useUser } from '@/app/context/user-context';
import { AdminModal, ConfirmDialog, FormInput, FormTextarea, FormCheckbox, FormSelect, FormActions, PrimaryButton, SecondaryButton } from '../components/AdminModal';
import { AdminPageSkeleton, TableSkeleton } from '@/app/dashboard/components';
import styles from '../admin.module.css';

// Add-on type icons
const typeIcons = {
  SEATS: Users,
  SITES: Globe,
  AI_CREDITS: Sparkles,
  STORAGE: HardDrive,
  KEYWORDS: Key,
  CONTENT: FileText,
};

// Add-on types with labels
const addOnTypes = [
  { value: 'SEATS', label: 'Team Members' },
  { value: 'SITES', label: 'Additional Websites' },
  { value: 'AI_CREDITS', label: 'AI Credits Pack' },
  { value: 'STORAGE', label: 'Storage' },
  { value: 'KEYWORDS', label: 'Keywords Tracking' },
  { value: 'CONTENT', label: 'Content Items' },
];

// Billing types
const billingTypes = [
  { value: 'RECURRING', label: 'Recurring (Monthly)' },
  { value: 'ONE_TIME', label: 'One-Time Purchase' },
];

export default function AddOnsSettingsPage() {
  const router = useRouter();
  const { t, locale } = useLocale();
  const { isSuperAdmin, isLoading: isUserLoading } = useUser();
  const [addOns, setAddOns] = useState([]);
  const [stats, setStats] = useState({ totalAddOns: 0, activeAddOns: 0, totalPurchases: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Available languages for translations
  const availableLanguages = ['EN', 'HE', 'AR', 'ES', 'FR', 'DE', 'PT', 'IT', 'RU', 'ZH', 'JA', 'KO'];

  // Helper to get translated add-on name based on current locale
  const getAddOnName = (addOn) => {
    const currentLang = locale?.toUpperCase() || 'EN';
    const translation = addOn.translations?.find(tr => tr.language === currentLang);
    return translation?.name || addOn.name;
  };

  // Helper to get translated add-on description
  const getAddOnDescription = (addOn) => {
    const currentLang = locale?.toUpperCase() || 'EN';
    const translation = addOn.translations?.find(tr => tr.language === currentLang);
    return translation?.description || addOn.description;
  };

  // Modal states
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [translateModalOpen, setTranslateModalOpen] = useState(false);
  const [selectedAddOn, setSelectedAddOn] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    type: 'AI_CREDITS',
    price: '',
    currency: 'USD',
    billingType: 'ONE_TIME',
    quantity: '',
    isActive: true,
  });

  // Translation form state
  const [selectedLanguage, setSelectedLanguage] = useState('HE');
  const [translationData, setTranslationData] = useState({
    name: '',
    description: '',
  });
  const [existingTranslations, setExistingTranslations] = useState({});

  // Redirect non-admin users
  useEffect(() => {
    if (!isUserLoading && !isSuperAdmin) {
      router.push('/dashboard');
    }
  }, [isSuperAdmin, isUserLoading, router]);

  // Load add-ons from API
  const loadAddOns = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('active', 'all'); // Get all, including inactive
      if (typeFilter) params.append('type', typeFilter);
      
      const response = await fetch(`/api/admin/addons?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch add-ons');
      const data = await response.json();
      
      const addOnsList = data.addOns || [];
      setAddOns(addOnsList);
      
      // Calculate stats
      setStats({
        totalAddOns: addOnsList.length,
        activeAddOns: addOnsList.filter(a => a.isActive).length,
        totalPurchases: addOnsList.reduce((sum, a) => sum + (a._count?.purchases || 0), 0),
      });
    } catch (error) {
      console.error('Failed to load add-ons:', error);
    } finally {
      setIsLoading(false);
    }
  }, [typeFilter]);

  useEffect(() => {
    if (isSuperAdmin) {
      loadAddOns();
    }
  }, [isSuperAdmin, loadAddOns]);

  // Filter add-ons by search query
  const filteredAddOns = addOns.filter(addOn =>
    addOn.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    addOn.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
    addOn.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatCurrency = (amount, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
    }).format(amount);
  };

  // Open edit modal
  const handleEdit = (addOn) => {
    setSelectedAddOn(addOn);
    setFormData({
      name: addOn.name,
      slug: addOn.slug,
      description: addOn.description || '',
      type: addOn.type,
      price: addOn.price?.toString() || '',
      currency: addOn.currency || 'USD',
      billingType: addOn.billingType || 'ONE_TIME',
      quantity: addOn.quantity?.toString() || '',
      isActive: addOn.isActive,
    });
    setEditModalOpen(true);
  };

  // Open add modal
  const handleAdd = () => {
    setSelectedAddOn(null);
    setFormData({
      name: '',
      slug: '',
      description: '',
      type: 'AI_CREDITS',
      price: '',
      currency: 'USD',
      billingType: 'ONE_TIME',
      quantity: '',
      isActive: true,
    });
    setEditModalOpen(true);
  };

  // Close edit modal
  const closeEditModal = () => {
    setEditModalOpen(false);
    setSelectedAddOn(null);
  };

  // Auto-generate slug from name
  const handleNameChange = (name) => {
    setFormData(prev => ({
      ...prev,
      name,
      // Only auto-generate slug if it's a new add-on or slug is empty
      slug: !selectedAddOn && !prev.slug ? 
        name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : 
        prev.slug,
    }));
  };

  // Submit edit/add form
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const payload = {
        name: formData.name,
        slug: formData.slug,
        description: formData.description,
        type: formData.type,
        price: parseFloat(formData.price) || 0,
        currency: formData.currency,
        billingType: formData.billingType,
        quantity: formData.quantity ? parseInt(formData.quantity) : null,
        isActive: formData.isActive,
      };

      let response;
      if (selectedAddOn) {
        // Update existing add-on
        response = await fetch(`/api/admin/addons/${selectedAddOn.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        // Create new add-on
        response = await fetch('/api/admin/addons', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save add-on');
      }

      closeEditModal();
      loadAddOns();
    } catch (error) {
      console.error('Error saving add-on:', error);
      alert(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open delete confirmation
  const handleDeleteClick = (addOn) => {
    setSelectedAddOn(addOn);
    setDeleteDialogOpen(true);
  };

  // Confirm delete
  const handleDeleteConfirm = async () => {
    if (!selectedAddOn) return;
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/admin/addons/${selectedAddOn.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete add-on');
      }

      setDeleteDialogOpen(false);
      setSelectedAddOn(null);
      loadAddOns();
    } catch (error) {
      console.error('Error deleting add-on:', error);
      alert(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open translate modal
  const handleTranslate = (addOn) => {
    setSelectedAddOn(addOn);
    // Build existing translations map
    const translationsMap = {};
    addOn.translations?.forEach(tr => {
      translationsMap[tr.language] = {
        name: tr.name,
        description: tr.description,
      };
    });
    setExistingTranslations(translationsMap);
    // Default to first non-EN language or HE
    const firstLang = 'HE';
    setSelectedLanguage(firstLang);
    const existing = translationsMap[firstLang];
    setTranslationData({
      name: existing?.name || '',
      description: existing?.description || '',
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
    });
  };

  // Submit translation
  const handleTranslationSubmit = async (e) => {
    e.preventDefault();
    if (!selectedAddOn) return;
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/admin/addons/${selectedAddOn.id}/translations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: selectedLanguage,
          name: translationData.name,
          description: translationData.description,
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
        },
      }));

      // Reload add-ons to get updated data
      loadAddOns();
      alert(t('admin.addons.translations.saved') || 'Translation saved successfully');
    } catch (error) {
      console.error('Error saving translation:', error);
      alert(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete translation
  const handleDeleteTranslation = async () => {
    if (!selectedAddOn || !selectedLanguage) return;
    
    if (!confirm(t('admin.addons.translations.confirmDelete') || 'Are you sure you want to delete this translation?')) return;
    
    setIsSubmitting(true);
    try {
      const response = await fetch(
        `/api/admin/addons/${selectedAddOn.id}/translations?language=${selectedLanguage}`,
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
      setTranslationData({ name: '', description: '' });
      loadAddOns();
    } catch (error) {
      console.error('Error deleting translation:', error);
      alert(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Archive/Activate add-on
  const handleToggleActive = async (addOn) => {
    try {
      const response = await fetch(`/api/admin/addons/${addOn.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !addOn.isActive }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update add-on');
      }

      loadAddOns();
    } catch (error) {
      console.error('Error updating add-on:', error);
      alert(error.message);
    }
  };

  // Get type icon component
  const getTypeIcon = (type) => {
    const IconComponent = typeIcons[type] || Package;
    return <IconComponent size={16} />;
  };

  // Get type label
  const getTypeLabel = (type) => {
    const typeInfo = addOnTypes.find(t => t.value === type);
    return t(`admin.addons.types.${type.toLowerCase()}`) || typeInfo?.label || type;
  };

  // Get billing type label
  const getBillingLabel = (billingType) => {
    if (billingType === 'ONE_TIME') {
      return t('admin.addons.billingTypes.oneTime') || 'One-Time';
    }
    return t('admin.addons.billingTypes.recurring') || 'Recurring';
  };

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
        <h1 className={styles.adminTitle}>{t('admin.addons.title') || 'Add-Ons Management'}</h1>
        <p className={styles.adminSubtitle}>{t('admin.addons.subtitle') || 'Manage add-ons that users can purchase for their accounts'}</p>
      </div>

      {/* Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t('admin.addons.stats.total') || 'Total Add-Ons'}</div>
          <div className={styles.statValue}>{stats.totalAddOns}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t('admin.addons.stats.active') || 'Active Add-Ons'}</div>
          <div className={styles.statValue}>{stats.activeAddOns}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t('admin.addons.stats.purchases') || 'Active Purchases'}</div>
          <div className={styles.statValue}>{stats.totalPurchases}</div>
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
              placeholder={t('admin.addons.searchPlaceholder') || 'Search add-ons...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select
            className={styles.filterSelect}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">{t('admin.addons.allTypes') || 'All Types'}</option>
            {addOnTypes.map(type => (
              <option key={type.value} value={type.value}>
                {t(`admin.addons.types.${type.value.toLowerCase()}`) || type.label}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.toolbarRight}>
          <button className={styles.refreshButton} onClick={loadAddOns}>
            <RefreshCw size={16} />
          </button>
          <button className={styles.addButton} onClick={handleAdd}>
            <Plus size={16} />
            <span>{t('admin.addons.addAddOn') || 'Add Add-On'}</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className={styles.tableContainer}>
        {isLoading ? (
          <TableSkeleton rows={8} columns={6} hasActions />
        ) : filteredAddOns.length === 0 ? (
          <div className={styles.emptyState}>
            <Package className={styles.emptyIcon} />
            <h3 className={styles.emptyTitle}>{t('admin.addons.noAddOns') || 'No add-ons found'}</h3>
            <p className={styles.emptyMessage}>{t('admin.common.noResults') || 'No results match your search'}</p>
          </div>
        ) : (
          <table className={styles.table}>
            <thead className={styles.tableHeader}>
              <tr>
                <th>{t('admin.addons.columns.name') || 'Name'}</th>
                <th>{t('admin.addons.columns.type') || 'Type'}</th>
                <th>{t('admin.addons.columns.price') || 'Price'}</th>
                <th>{t('admin.addons.columns.quantity') || 'Quantity'}</th>
                <th>{t('admin.addons.columns.purchases') || 'Purchases'}</th>
                <th>{t('admin.addons.columns.status') || 'Status'}</th>
                <th>{t('admin.addons.columns.actions') || 'Actions'}</th>
              </tr>
            </thead>
            <tbody className={styles.tableBody}>
              {filteredAddOns.map((addOn) => (
                <tr key={addOn.id}>
                  <td>
                    <div className={styles.userCell}>
                      <div 
                        className={styles.avatar} 
                        style={{ background: addOn.isActive ? 'var(--gradient-primary)' : 'var(--muted)' }}
                      >
                        {getTypeIcon(addOn.type)}
                      </div>
                      <div>
                        <div className={styles.userName}>{getAddOnName(addOn)}</div>
                        <div className={styles.userEmail}>{getAddOnDescription(addOn) || addOn.slug}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className={styles.statusBadge} style={{ 
                        background: 'var(--muted)', 
                        color: 'var(--foreground)',
                        fontSize: '0.75rem',
                      }}>
                        {getTypeLabel(addOn.type)}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div>
                      <div style={{ fontWeight: 600 }}>
                        {formatCurrency(addOn.price, addOn.currency)}
                      </div>
                      <div className={styles.userEmail}>
                        {getBillingLabel(addOn.billingType)}
                      </div>
                    </div>
                  </td>
                  <td>
                    {addOn.quantity ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Coins size={14} style={{ color: 'var(--muted-foreground)' }} />
                        {addOn.quantity.toLocaleString()}
                      </div>
                    ) : (
                      <span style={{ color: 'var(--muted-foreground)' }}>+1</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Users size={14} style={{ color: 'var(--muted-foreground)' }} />
                      {addOn._count?.purchases || 0}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className={`${styles.statusBadge} ${styles[addOn.isActive ? 'active' : 'inactive']}`}>
                        {addOn.isActive ? 
                          (t('admin.addons.statuses.active') || 'Active') : 
                          (t('admin.addons.statuses.inactive') || 'Inactive')
                        }
                      </span>
                      {addOn.translations?.length > 0 && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', color: 'var(--muted-foreground)' }}>
                          <Globe size={12} />
                          {addOn.translations.length}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className={styles.actionsCell}>
                      <button 
                        className={styles.actionButton} 
                        title={t('admin.addons.actions.translate') || 'Translate'}
                        onClick={() => handleTranslate(addOn)}
                      >
                        <Languages size={16} />
                      </button>
                      <button 
                        className={styles.actionButton} 
                        title={t('admin.addons.actions.edit') || 'Edit'}
                        onClick={() => handleEdit(addOn)}
                      >
                        <Edit2 size={16} />
                      </button>
                      {addOn.isActive ? (
                        <button 
                          className={styles.actionButton} 
                          title={t('admin.addons.actions.archive') || 'Archive'}
                          onClick={() => handleToggleActive(addOn)}
                        >
                          <Archive size={16} />
                        </button>
                      ) : (
                        <>
                          <button 
                            className={styles.actionButton} 
                            title={t('admin.common.reactivate') || 'Reactivate'}
                            onClick={() => handleToggleActive(addOn)}
                          >
                            <RotateCcw size={16} />
                          </button>
                          <button 
                            className={`${styles.actionButton} ${styles.danger}`} 
                            title={t('admin.addons.actions.delete') || 'Delete'}
                            onClick={() => handleDeleteClick(addOn)}
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
        title={selectedAddOn ? 
          (t('admin.addons.actions.edit') || 'Edit Add-On') : 
          (t('admin.addons.addAddOn') || 'Add Add-On')
        }
        size="medium"
      >
        <form onSubmit={handleSubmit}>
          <FormInput
            label={t('admin.addons.columns.name') || 'Name'}
            value={formData.name}
            onChange={(e) => handleNameChange(e.target.value)}
            required
            placeholder="e.g., AI Credits Pack - 10K"
          />
          <FormInput
            label="Slug"
            value={formData.slug}
            onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
            required
            disabled={selectedAddOn?._count?.purchases > 0}
            placeholder="e.g., ai-credits-10k"
          />
          <FormTextarea
            label={t('admin.addons.columns.description') || 'Description'}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={2}
            placeholder="Describe what this add-on provides..."
          />
          
          <FormSelect
            label={t('admin.addons.columns.type') || 'Type'}
            value={formData.type}
            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
            options={addOnTypes.map(type => ({
              value: type.value,
              label: t(`admin.addons.types.${type.value.toLowerCase()}`) || type.label,
            }))}
          />
          
          <FormSelect
            label={t('admin.addons.billingType') || 'Billing Type'}
            value={formData.billingType}
            onChange={(e) => setFormData({ ...formData, billingType: e.target.value })}
            options={billingTypes.map(bt => ({
              value: bt.value,
              label: t(`admin.addons.billingTypes.${bt.value === 'ONE_TIME' ? 'oneTime' : 'recurring'}`) || bt.label,
            }))}
          />
          
          <FormInput
            label={`${t('admin.addons.columns.price') || 'Price'} (${formData.currency})`}
            type="number"
            step="0.01"
            min="0"
            value={formData.price}
            onChange={(e) => setFormData({ ...formData, price: e.target.value })}
            required
          />
          
          <FormInput
            label={t('admin.addons.columns.quantity') || 'Quantity (optional)'}
            type="number"
            min="1"
            value={formData.quantity}
            onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
            placeholder="e.g., 10000 for AI credits pack"
          />
          <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: '-0.5rem', marginBottom: '1rem' }}>
            {t('admin.addons.quantityHint') || 'Leave empty for add-ons that provide +1 of a resource (like additional seats or sites)'}
          </p>
          
          <FormCheckbox
            label={t('admin.addons.statuses.active') || 'Active'}
            checked={formData.isActive}
            onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
          />
          <FormActions>
            <SecondaryButton type="button" onClick={closeEditModal}>
              {t('admin.common.cancel') || 'Cancel'}
            </SecondaryButton>
            <PrimaryButton type="submit" isLoading={isSubmitting}>
              {t('admin.common.save') || 'Save'}
            </PrimaryButton>
          </FormActions>
        </form>
      </AdminModal>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        title={t('admin.addons.actions.delete') || 'Delete Add-On'}
        message={t('admin.common.confirmDelete') || 'Are you sure you want to delete this add-on? This action cannot be undone.'}
        confirmText={t('admin.common.delete') || 'Delete'}
        cancelText={t('admin.common.cancel') || 'Cancel'}
        variant="danger"
        isLoading={isSubmitting}
      />

      {/* Translation Modal */}
      <AdminModal
        isOpen={translateModalOpen}
        onClose={() => setTranslateModalOpen(false)}
        title={`${t('admin.addons.actions.translate') || 'Translate'}: ${selectedAddOn?.name || ''}`}
        size="medium"
      >
        {selectedAddOn && (
          <form onSubmit={handleTranslationSubmit}>
            <div style={{ marginBottom: '1rem' }}>
              <FormSelect
                label={t('admin.addons.translations.selectLanguage') || 'Select Language'}
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
              <strong>{t('admin.addons.translations.original') || 'Original'} (EN):</strong>
              <div style={{ marginTop: '0.5rem' }}>
                <div><strong>{t('admin.addons.columns.name') || 'Name'}:</strong> {selectedAddOn.name}</div>
                <div><strong>{t('admin.addons.columns.description') || 'Description'}:</strong> {selectedAddOn.description || '-'}</div>
              </div>
            </div>

            <FormInput
              label={`${t('admin.addons.columns.name') || 'Name'} (${selectedLanguage})`}
              value={translationData.name}
              onChange={(e) => setTranslationData({ ...translationData, name: e.target.value })}
              required
              placeholder={selectedAddOn.name}
            />
            <FormTextarea
              label={`${t('admin.addons.columns.description') || 'Description'} (${selectedLanguage})`}
              value={translationData.description}
              onChange={(e) => setTranslationData({ ...translationData, description: e.target.value })}
              rows={2}
              placeholder={selectedAddOn.description || ''}
            />

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
                  {t('admin.addons.translations.deleteTranslation') || 'Delete Translation'}
                </button>
              )}
              <SecondaryButton type="button" onClick={() => setTranslateModalOpen(false)}>
                {t('admin.common.close') || 'Close'}
              </SecondaryButton>
              <PrimaryButton type="submit" isLoading={isSubmitting}>
                {t('admin.addons.translations.save') || 'Save Translation'}
              </PrimaryButton>
            </FormActions>
          </form>
        )}
      </AdminModal>
    </div>
  );
}
