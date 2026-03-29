'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Search,
  RefreshCw,
  Plus,
  Edit2,
  Trash2,
  Copy,
  Ticket,
  Percent,
  DollarSign,
  Check,
  X,
  Calendar,
  Users,
  Zap,
  Languages,
  Globe,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useUser } from '@/app/context/user-context';
import { AdminModal, ConfirmDialog, FormInput, FormTextarea, FormCheckbox, FormSelect, FormActions, PrimaryButton, SecondaryButton } from '../components/AdminModal';
import { AdminPageSkeleton, TableSkeleton, Button } from '@/app/dashboard/components';
import styles from '../admin.module.css';

const EMPTY_FORM = {
  code: '',
  description: '',
  discountType: 'PERCENTAGE',
  discountValue: '',
  maxRedemptions: '',
  maxPerAccount: '1',
  validFrom: '',
  validUntil: '',
  durationMonths: '',
  isActive: true,
  applicablePlanIds: [],
  limitationOverrides: [],
  extraFeatures: [],
};

export default function CouponsPage() {
  const { t } = useLocale();
  const { isSuperAdmin, isLoading: isUserLoading } = useUser();

  const [coupons, setCoupons] = useState([]);
  const [stats, setStats] = useState({ totalCoupons: 0, activeCoupons: 0, totalRedemptions: 0, activeRedemptions: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [plans, setPlans] = useState([]);

  // Modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedCoupon, setSelectedCoupon] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [limitationOverrides, setLimitationOverrides] = useState([]);
  const [extraFeatures, setExtraFeatures] = useState([]);

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [couponToDelete, setCouponToDelete] = useState(null);

  // Translation state
  const [translateModalOpen, setTranslateModalOpen] = useState(false);
  const availableLanguages = ['EN', 'HE', 'AR', 'ES', 'FR', 'DE', 'PT', 'IT', 'RU', 'ZH', 'JA', 'KO'];
  const [selectedLanguage, setSelectedLanguage] = useState('HE');
  const [translationData, setTranslationData] = useState({ description: '' });
  const [existingTranslations, setExistingTranslations] = useState({});

  // Predefined limitation keys (matching account-limits.js)
  const limitationKeys = [
    { key: 'maxSites', label: 'Websites' },
    { key: 'maxMembers', label: 'Team Members' },
    { key: 'aiCredits', label: 'AI Credits' },
    { key: 'maxKeywords', label: 'Keywords' },
    { key: 'maxContent', label: 'Content Items' },
    { key: 'siteAudits', label: 'Site Audits' },
  ];

  const loadCoupons = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/admin/coupons');
      if (!res.ok) throw new Error('Failed to fetch coupons');
      const data = await res.json();
      setCoupons(data.coupons || []);
      setStats(data.stats || {});
    } catch (err) {
      console.error('Error loading coupons:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadPlans = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/plans');
      if (!res.ok) return;
      const data = await res.json();
      setPlans(data.plans || []);
    } catch (err) {
      console.error('Error loading plans:', err);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) {
      loadCoupons();
      loadPlans();
    }
  }, [isSuperAdmin, loadCoupons, loadPlans]);

  // Filter coupons by search
  const filteredCoupons = coupons.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.code.toLowerCase().includes(q) ||
      (c.description || '').toLowerCase().includes(q)
    );
  });

  const handleAdd = () => {
    setSelectedCoupon(null);
    setFormData({ ...EMPTY_FORM });
    setLimitationOverrides([]);
    setExtraFeatures([]);
    setEditModalOpen(true);
  };

  const handleEdit = (coupon) => {
    setSelectedCoupon(coupon);
    setFormData({
      code: coupon.code,
      description: coupon.description || '',
      discountType: coupon.discountType,
      discountValue: coupon.discountValue?.toString() || '',
      maxRedemptions: coupon.maxRedemptions?.toString() || '',
      maxPerAccount: coupon.maxPerAccount?.toString() || '1',
      validFrom: coupon.validFrom ? coupon.validFrom.slice(0, 16) : '',
      validUntil: coupon.validUntil ? coupon.validUntil.slice(0, 16) : '',
      durationMonths: coupon.durationMonths?.toString() || '',
      isActive: coupon.isActive,
      applicablePlanIds: coupon.applicablePlanIds || [],
    });
    setLimitationOverrides(Array.isArray(coupon.limitationOverrides) ? coupon.limitationOverrides : []);
    setExtraFeatures(Array.isArray(coupon.extraFeatures) ? coupon.extraFeatures : []);
    setEditModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      const payload = {
        ...formData,
        limitationOverrides,
        extraFeatures,
      };

      const url = selectedCoupon ? `/api/admin/coupons/${selectedCoupon.id}` : '/api/admin/coupons';
      const method = selectedCoupon ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to save coupon');
        return;
      }

      setEditModalOpen(false);
      loadCoupons();
    } catch (err) {
      console.error('Error saving coupon:', err);
      alert('Failed to save coupon');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = (coupon) => {
    setCouponToDelete(coupon);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!couponToDelete) return;
    try {
      setIsSubmitting(true);
      const res = await fetch(`/api/admin/coupons/${couponToDelete.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to delete coupon');
        return;
      }
      setDeleteDialogOpen(false);
      setCouponToDelete(null);
      loadCoupons();
    } catch (err) {
      console.error('Error deleting coupon:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (coupon) => {
    try {
      const res = await fetch(`/api/admin/coupons/${coupon.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !coupon.isActive }),
      });
      if (res.ok) loadCoupons();
    } catch (err) {
      console.error('Error toggling coupon:', err);
    }
  };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
  };

  // Open translate modal
  const handleTranslate = (coupon) => {
    setSelectedCoupon(coupon);
    const translationsMap = {};
    coupon.translations?.forEach(tr => {
      translationsMap[tr.language] = { description: tr.description };
    });
    setExistingTranslations(translationsMap);
    const firstLang = 'HE';
    setSelectedLanguage(firstLang);
    const existing = translationsMap[firstLang];
    setTranslationData({ description: existing?.description || '' });
    setTranslateModalOpen(true);
  };

  // Handle language change in translate modal
  const handleLanguageChange = (lang) => {
    setSelectedLanguage(lang);
    const existing = existingTranslations[lang];
    setTranslationData({ description: existing?.description || '' });
  };

  // Submit translation
  const handleTranslationSubmit = async (e) => {
    e.preventDefault();
    if (!selectedCoupon) return;
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/admin/coupons/${selectedCoupon.id}/translations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: selectedLanguage,
          description: translationData.description,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save translation');
      }

      setExistingTranslations(prev => ({
        ...prev,
        [selectedLanguage]: { description: translationData.description },
      }));

      loadCoupons();
      alert(t('admin.coupons.translations.saved') || 'Translation saved successfully');
    } catch (error) {
      console.error('Error saving translation:', error);
      alert(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete translation
  const handleDeleteTranslation = async () => {
    if (!selectedCoupon || !selectedLanguage) return;

    if (!confirm(t('admin.coupons.translations.confirmDelete') || 'Are you sure you want to delete this translation?')) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(
        `/api/admin/coupons/${selectedCoupon.id}/translations?language=${selectedLanguage}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete translation');
      }

      setExistingTranslations(prev => {
        const updated = { ...prev };
        delete updated[selectedLanguage];
        return updated;
      });

      setTranslationData({ description: '' });
      loadCoupons();
    } catch (error) {
      console.error('Error deleting translation:', error);
      alert(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Limitation overrides management
  const addLimitationOverride = () => {
    setLimitationOverrides([...limitationOverrides, { key: '', value: '' }]);
  };

  const updateLimitationOverride = (index, field, value) => {
    const updated = [...limitationOverrides];
    updated[index] = { ...updated[index], [field]: field === 'value' ? (value === '' ? '' : Number(value)) : value };
    setLimitationOverrides(updated);
  };

  const removeLimitationOverride = (index) => {
    setLimitationOverrides(limitationOverrides.filter((_, i) => i !== index));
  };

  // Extra features management
  const addExtraFeature = () => {
    setExtraFeatures([...extraFeatures, '']);
  };

  const updateExtraFeature = (index, value) => {
    const updated = [...extraFeatures];
    updated[index] = value;
    setExtraFeatures(updated);
  };

  const removeExtraFeature = (index) => {
    setExtraFeatures(extraFeatures.filter((_, i) => i !== index));
  };

  if (isUserLoading) {
    return <AdminPageSkeleton statsCount={4} columns={7} />;
  }

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className={styles.adminPage}>
      {/* Header */}
      <div className={styles.adminHeader}>
        <h1 className={styles.adminTitle}>{t('admin.coupons.title')}</h1>
        <p className={styles.adminSubtitle}>{t('admin.coupons.subtitle')}</p>
      </div>

      {/* Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t('admin.coupons.stats.total')}</div>
          <div className={styles.statValue}>{stats.totalCoupons}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t('admin.coupons.stats.active')}</div>
          <div className={styles.statValue}>{stats.activeCoupons}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t('admin.coupons.stats.totalRedemptions')}</div>
          <div className={styles.statValue}>{stats.totalRedemptions}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t('admin.coupons.stats.activeRedemptions')}</div>
          <div className={styles.statValue}>{stats.activeRedemptions}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className={styles.adminToolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.searchWrapper}>
            <Search size={20} className={styles.searchIcon} />
            <input
              type="text"
              className={styles.searchInput}
              placeholder={t('admin.coupons.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <div className={styles.toolbarRight}>
          <button className={styles.refreshButton} onClick={loadCoupons} title="Refresh">
            <RefreshCw size={16} />
          </button>
          <Button variant="primary" onClick={handleAdd}>
            <Plus size={16} />
            {t('admin.coupons.addCoupon')}
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className={styles.tableContainer}>
        {isLoading ? (
          <TableSkeleton columns={7} rows={5} />
        ) : filteredCoupons.length === 0 ? (
          <div className={styles.emptyState}>
            <Ticket size={48} className={styles.emptyIcon} />
            <h3 className={styles.emptyTitle}>{t('admin.coupons.noCoupons')}</h3>
          </div>
        ) : (
          <table className={styles.table}>
            <thead className={styles.tableHeader}>
              <tr>
                <th>{t('admin.coupons.columns.code')}</th>
                <th>{t('admin.coupons.columns.discount')}</th>
                <th>{t('admin.coupons.columns.benefits')}</th>
                <th>{t('admin.coupons.columns.usage')}</th>
                <th>{t('admin.coupons.columns.validity')}</th>
                <th>{t('admin.coupons.columns.status')}</th>
                <th>{t('admin.coupons.columns.actions')}</th>
              </tr>
            </thead>
            <tbody className={styles.tableBody}>
              {filteredCoupons.map((coupon) => (
                <tr key={coupon.id} className={!coupon.isActive ? styles.inactiveRow : ''}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Ticket size={16} style={{ color: 'var(--primary)' }} />
                      <strong style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>{coupon.code}</strong>
                      <button
                        className={styles.actionButton}
                        onClick={() => copyCode(coupon.code)}
                        title="Copy code"
                        style={{ width: '1.5rem', height: '1.5rem' }}
                      >
                        <Copy size={12} />
                      </button>
                    </div>
                    {coupon.description && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: '0.25rem' }}>
                        {coupon.description}
                      </div>
                    )}
                    {coupon.translations?.length > 0 && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}>
                        <span className={styles.planBadge} style={{ fontSize: '0.625rem', gap: '0.125rem' }}>
                          <Globe size={10} />
                          {coupon.translations.length}
                        </span>
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      {coupon.discountType === 'PERCENTAGE' ? <Percent size={14} /> : <DollarSign size={14} />}
                      <span>
                        {coupon.discountValue > 0
                          ? coupon.discountType === 'PERCENTAGE'
                            ? `${coupon.discountValue}%`
                            : `$${coupon.discountValue}`
                          : '-'}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {Array.isArray(coupon.limitationOverrides) && coupon.limitationOverrides.length > 0 && (
                        <span className={styles.planBadge} style={{ fontSize: '0.6875rem' }}>
                          <Zap size={10} />
                          {coupon.limitationOverrides.length} override{coupon.limitationOverrides.length > 1 ? 's' : ''}
                        </span>
                      )}
                      {Array.isArray(coupon.extraFeatures) && coupon.extraFeatures.length > 0 && (
                        <span className={styles.planBadge} style={{ fontSize: '0.6875rem' }}>
                          <Check size={10} />
                          {coupon.extraFeatures.length} feature{coupon.extraFeatures.length > 1 ? 's' : ''}
                        </span>
                      )}
                      {(!coupon.limitationOverrides?.length && !coupon.extraFeatures?.length) && '-'}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Users size={14} />
                      <span>{coupon.activeRedemptions}</span>
                      <span style={{ color: 'var(--muted-foreground)' }}>
                        / {coupon.maxRedemptions || '∞'}
                      </span>
                    </div>
                    {coupon.durationMonths && (
                      <div style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)' }}>
                        {coupon.durationMonths} month{coupon.durationMonths > 1 ? 's' : ''}
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ fontSize: '0.75rem' }}>
                      {coupon.validUntil ? (
                        <>
                          <Calendar size={12} style={{ display: 'inline', marginInlineEnd: '0.25rem' }} />
                          {new Date(coupon.validUntil).toLocaleDateString()}
                        </>
                      ) : (
                        <span style={{ color: 'var(--muted-foreground)' }}>{t('admin.coupons.noExpiry')}</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <button
                      className={`${styles.statusBadge} ${coupon.isActive ? styles.active : styles.inactive}`}
                      onClick={() => handleToggleActive(coupon)}
                      style={{ cursor: 'pointer', border: 'none' }}
                    >
                      {coupon.isActive ? t('admin.coupons.statuses.active') : t('admin.coupons.statuses.inactive')}
                    </button>
                  </td>
                  <td>
                    <div className={styles.actionButtons}>
                      <Button variant="icon" onClick={() => handleTranslate(coupon)} title={t('admin.coupons.actions.translate') || 'Translate'}>
                        <Languages size={14} />
                      </Button>
                      <Button variant="icon" onClick={() => handleEdit(coupon)} title="Edit">
                        <Edit2 size={14} />
                      </Button>
                      <Button variant="icon" iconDanger onClick={() => handleDeleteClick(coupon)} title="Delete">
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit / Add Modal */}
      <AdminModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title={selectedCoupon ? t('admin.coupons.actions.edit') : t('admin.coupons.addCoupon')}
        size="large"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Basic Info */}
          <FormInput
            label={t('admin.coupons.form.code')}
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
            placeholder="LAUNCH50"
            style={{ fontFamily: 'monospace', textTransform: 'uppercase' }}
          />
          <FormTextarea
            label={t('admin.coupons.form.description')}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder={t('admin.coupons.form.descriptionPlaceholder')}
            rows={2}
          />

          {/* Discount Settings */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <FormSelect
              label={t('admin.coupons.form.discountType')}
              value={formData.discountType}
              onChange={(e) => setFormData({ ...formData, discountType: e.target.value })}
              options={[
                { value: 'PERCENTAGE', label: t('admin.coupons.form.percentage') },
                { value: 'FIXED_AMOUNT', label: t('admin.coupons.form.fixedAmount') },
              ]}
            />
            <FormInput
              label={t('admin.coupons.form.discountValue')}
              type="number"
              min="0"
              value={formData.discountValue}
              onChange={(e) => setFormData({ ...formData, discountValue: e.target.value })}
              placeholder="0"
            />
          </div>

          {/* Usage Limits */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
            <FormInput
              label={t('admin.coupons.form.maxRedemptions')}
              type="number"
              min="0"
              value={formData.maxRedemptions}
              onChange={(e) => setFormData({ ...formData, maxRedemptions: e.target.value })}
              placeholder="∞"
            />
            <FormInput
              label={t('admin.coupons.form.maxPerAccount')}
              type="number"
              min="1"
              value={formData.maxPerAccount}
              onChange={(e) => setFormData({ ...formData, maxPerAccount: e.target.value })}
              placeholder="1"
            />
            <FormInput
              label={t('admin.coupons.form.durationMonths')}
              type="number"
              min="1"
              value={formData.durationMonths}
              onChange={(e) => setFormData({ ...formData, durationMonths: e.target.value })}
              placeholder={t('admin.coupons.form.lifetime')}
            />
          </div>

          {/* Validity Period */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <FormInput
              label={t('admin.coupons.form.validFrom')}
              type="datetime-local"
              value={formData.validFrom}
              onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })}
            />
            <FormInput
              label={t('admin.coupons.form.validUntil')}
              type="datetime-local"
              value={formData.validUntil}
              onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
            />
          </div>

          {/* Applicable Plans */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, marginBottom: '0.5rem', color: 'var(--foreground)' }}>
              {t('admin.coupons.form.applicablePlans')}
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {plans.map((plan) => (
                <label
                  key={plan.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    padding: '0.375rem 0.75rem',
                    border: `1px solid ${formData.applicablePlanIds.includes(plan.id) ? 'var(--primary)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius)',
                    cursor: 'pointer',
                    fontSize: '0.8125rem',
                    background: formData.applicablePlanIds.includes(plan.id) ? 'rgba(123,44,191,0.1)' : 'transparent',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={formData.applicablePlanIds.includes(plan.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData({ ...formData, applicablePlanIds: [...formData.applicablePlanIds, plan.id] });
                      } else {
                        setFormData({ ...formData, applicablePlanIds: formData.applicablePlanIds.filter((id) => id !== plan.id) });
                      }
                    }}
                    style={{ display: 'none' }}
                  />
                  {formData.applicablePlanIds.includes(plan.id) && <Check size={12} />}
                  {plan.name}
                </label>
              ))}
              {plans.length === 0 && (
                <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                  {t('admin.coupons.form.allPlans')}
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: '0.25rem' }}>
              {t('admin.coupons.form.allPlansHint')}
            </div>
          </div>

          {/* Limitation Overrides */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 600, margin: 0, color: 'var(--foreground)' }}>
                  {t('admin.coupons.form.limitationOverrides')}
                </h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', margin: 0 }}>
                  {t('admin.coupons.form.limitationOverridesHint')}
                </p>
              </div>
              <button
                type="button"
                onClick={addLimitationOverride}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.25rem',
                  padding: '0.375rem 0.75rem', fontSize: '0.75rem', fontWeight: 500,
                  background: 'var(--primary)', color: 'white', border: 'none',
                  borderRadius: 'var(--radius)', cursor: 'pointer',
                }}
              >
                <Plus size={12} /> {t('admin.common.add')}
              </button>
            </div>
            {limitationOverrides.map((override, index) => (
              <div key={index} className={styles.limitationItem}>
                <select
                  className={styles.limitationSelect}
                  value={override.key}
                  onChange={(e) => updateLimitationOverride(index, 'key', e.target.value)}
                >
                  <option value="">{t('admin.coupons.form.selectLimit')}</option>
                  {limitationKeys.map((lk) => (
                    <option key={lk.key} value={lk.key}>{lk.label}</option>
                  ))}
                </select>
                <input
                  type="number"
                  className={styles.limitationValueInput}
                  value={override.value}
                  onChange={(e) => updateLimitationOverride(index, 'value', e.target.value)}
                  placeholder={t('admin.coupons.form.overrideValue')}
                  min="0"
                />
                <button
                  type="button"
                  className={styles.removeLimitationBtn}
                  onClick={() => removeLimitationOverride(index)}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>

          {/* Extra Features */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 600, margin: 0, color: 'var(--foreground)' }}>
                  {t('admin.coupons.form.extraFeatures')}
                </h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', margin: 0 }}>
                  {t('admin.coupons.form.extraFeaturesHint')}
                </p>
              </div>
              <button
                type="button"
                onClick={addExtraFeature}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.25rem',
                  padding: '0.375rem 0.75rem', fontSize: '0.75rem', fontWeight: 500,
                  background: 'var(--primary)', color: 'white', border: 'none',
                  borderRadius: 'var(--radius)', cursor: 'pointer',
                }}
              >
                <Plus size={12} /> {t('admin.common.add')}
              </button>
            </div>
            {extraFeatures.map((feature, index) => (
              <div key={index} className={styles.limitationItem} style={{ marginBottom: '0.5rem' }}>
                <input
                  type="text"
                  className={styles.limitationLabelInput}
                  value={feature}
                  onChange={(e) => updateExtraFeature(index, e.target.value)}
                  placeholder={t('admin.coupons.form.featureKeyPlaceholder')}
                />
                <button
                  type="button"
                  className={styles.removeLimitationBtn}
                  onClick={() => removeExtraFeature(index)}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>

          {/* Active toggle */}
          <FormCheckbox
            label={t('admin.coupons.form.isActive')}
            checked={formData.isActive}
            onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
          />

          {/* Actions */}
          <FormActions>
            <SecondaryButton onClick={() => setEditModalOpen(false)}>
              {t('admin.common.cancel')}
            </SecondaryButton>
            <PrimaryButton onClick={handleSubmit} isLoading={isSubmitting}>
              {selectedCoupon ? t('admin.common.save') : t('admin.coupons.addCoupon')}
            </PrimaryButton>
          </FormActions>
        </div>
      </AdminModal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        title={t('admin.coupons.actions.delete')}
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
        title={`${t('admin.coupons.actions.translate') || 'Translate'}: ${selectedCoupon?.code || ''}`}
        size="medium"
      >
        {selectedCoupon && (
          <form onSubmit={handleTranslationSubmit}>
            <div style={{ marginBottom: '1rem' }}>
              <FormSelect
                label={t('admin.coupons.translations.selectLanguage') || 'Select Language'}
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
              fontSize: '0.8125rem',
            }}>
              <strong>{t('admin.coupons.translations.original') || 'Original'} (EN):</strong>
              <div style={{ marginTop: '0.5rem' }}>
                <div><strong>{t('admin.coupons.columns.code') || 'Code'}:</strong> {selectedCoupon.code}</div>
                <div><strong>{t('admin.coupons.form.description') || 'Description'}:</strong> {selectedCoupon.description || '-'}</div>
              </div>
            </div>

            <FormTextarea
              label={`${t('admin.coupons.form.description') || 'Description'} (${selectedLanguage})`}
              value={translationData.description}
              onChange={(e) => setTranslationData({ ...translationData, description: e.target.value })}
              rows={3}
              placeholder={selectedCoupon.description || ''}
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
                  {t('admin.coupons.translations.deleteTranslation') || 'Delete Translation'}
                </button>
              )}
              <SecondaryButton type="button" onClick={() => setTranslateModalOpen(false)}>
                {t('admin.common.close') || 'Close'}
              </SecondaryButton>
              <PrimaryButton type="submit" isLoading={isSubmitting}>
                {t('admin.coupons.translations.save') || 'Save Translation'}
              </PrimaryButton>
            </FormActions>
          </form>
        )}
      </AdminModal>
    </div>
  );
}
