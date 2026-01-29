'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Filter,
  Download,
  RefreshCw,
  Plus,
  Eye,
  Edit2,
  Trash2,
  Building2,
  ChevronLeft,
  ChevronRight,
  Users,
  CreditCard,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useUser } from '@/app/context/user-context';
import {
  AdminModal,
  ConfirmDialog,
  FormInput,
  FormCheckbox,
  FormSelect,
  FormActions,
  PrimaryButton,
  SecondaryButton,
} from '../components/AdminModal';
import styles from '../admin.module.css';
import modalStyles from '../components/AdminModal.module.css';

export default function PlatformAccountsPage() {
  const router = useRouter();
  const { t, locale } = useLocale();
  const { isSuperAdmin, isLoading: isUserLoading } = useUser();
  const [accounts, setAccounts] = useState([]);
  const [stats, setStats] = useState({ total: 0, active: 0, totalUsers: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Modal states
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    ownerEmail: '',
    logo: '',
    website: '',
    industry: '',
    timezone: 'UTC',
    defaultLanguage: 'EN',
    billingEmail: '',
    generalEmail: '',
    isActive: true,
  });

  // Enum options
  const languages = ['EN', 'HE', 'AR', 'ES', 'FR', 'DE', 'PT', 'IT', 'RU', 'ZH', 'JA', 'KO'];
  const timezones = [
    'UTC', 'America/New_York', 'America/Los_Angeles', 'America/Chicago',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Jerusalem',
    'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Singapore', 'Australia/Sydney'
  ];

  // Redirect non-admin users
  useEffect(() => {
    if (!isUserLoading && !isSuperAdmin) {
      router.push('/dashboard');
    }
  }, [isSuperAdmin, isUserLoading, router]);

  // Load accounts from API
  const loadAccounts = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/accounts');
      if (!response.ok) {
        throw new Error('Failed to fetch accounts');
      }
      const data = await response.json();
      setAccounts(data.accounts || []);
      setStats(data.stats || { total: 0, active: 0, totalUsers: 0 });
    } catch (error) {
      console.error('Failed to load accounts:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) {
      loadAccounts();
    }
  }, [isSuperAdmin, loadAccounts]);

  // Handle View
  const handleView = (account) => {
    setSelectedAccount(account);
    setViewModalOpen(true);
  };

  // Handle Edit
  const handleEdit = (account) => {
    setSelectedAccount(account);
    setFormData({
      name: account.name || '',
      slug: account.slug || '',
      ownerEmail: account.owner?.email || '',
      logo: account.logo || '',
      website: account.website || '',
      industry: account.industry || '',
      timezone: account.timezone || 'UTC',
      defaultLanguage: account.defaultLanguage || 'EN',
      billingEmail: account.billingEmail || '',
      generalEmail: account.generalEmail || '',
      isActive: account.status === 'active',
    });
    setEditModalOpen(true);
  };

  // Handle Add
  const handleAdd = () => {
    setSelectedAccount(null);
    setFormData({
      name: '',
      slug: '',
      ownerEmail: '',
      logo: '',
      website: '',
      industry: '',
      timezone: 'UTC',
      defaultLanguage: 'EN',
      billingEmail: '',
      generalEmail: '',
      isActive: true,
    });
    setEditModalOpen(true);
  };

  const closeEditModal = () => {
    setEditModalOpen(false);
    setSelectedAccount(null);
    setFormData({
      name: '',
      slug: '',
      ownerEmail: '',
      logo: '',
      website: '',
      industry: '',
      timezone: 'UTC',
      defaultLanguage: 'EN',
      billingEmail: '',
      generalEmail: '',
      isActive: true,
    });
  };

  const closeViewModal = () => {
    setViewModalOpen(false);
    setSelectedAccount(null);
  };

  // Handle Submit (create or update)
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const url = selectedAccount
        ? `/api/admin/accounts/${selectedAccount.id}`
        : '/api/admin/accounts';
      const method = selectedAccount ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.json();
        alert(error.error || 'Failed to save account');
        return;
      }

      await loadAccounts();
      closeEditModal();
    } catch (error) {
      console.error('Error saving account:', error);
      alert('Failed to save account');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Delete
  const handleDeleteClick = (account) => {
    setSelectedAccount(account);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedAccount) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/admin/accounts/${selectedAccount.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        alert(error.error || 'Failed to delete account');
        return;
      }

      await loadAccounts();
      setDeleteDialogOpen(false);
      setSelectedAccount(null);
    } catch (error) {
      console.error('Error deleting account:', error);
      alert('Failed to delete account');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter accounts by search query
  const filteredAccounts = accounts.filter(account =>
    account.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    account.owner?.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    account.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Pagination
  const totalPages = Math.ceil(filteredAccounts.length / itemsPerPage);
  const paginatedAccounts = filteredAccounts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getInitials = (name) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString();
  };

  // Get translated plan name
  const getPlanName = (account) => {
    if (!account.plan || account.plan === 'No Plan') return t('admin.accounts.noPlan');
    const langKey = locale.toUpperCase();
    return account.planTranslations?.[langKey]?.name || account.plan;
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
        <h1 className={styles.adminTitle}>{t('admin.accounts.title')}</h1>
        <p className={styles.adminSubtitle}>{t('admin.accounts.subtitle')}</p>
      </div>

      {/* Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t('admin.accounts.totalAccounts')}</div>
          <div className={styles.statValue}>{stats.total}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t('admin.accounts.statuses.active')}</div>
          <div className={styles.statValue}>{stats.active}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t('admin.users.totalUsers')}</div>
          <div className={styles.statValue}>{stats.totalUsers}</div>
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
              placeholder={t('admin.accounts.searchPlaceholder')}
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
          <button className={styles.exportButton}>
            <Download size={16} />
            <span>{t('admin.common.export')}</span>
          </button>
          <button className={styles.refreshButton} onClick={loadAccounts}>
            <RefreshCw size={16} />
          </button>
          <button className={styles.addButton} onClick={handleAdd}>
            <Plus size={16} />
            <span>{t('admin.accounts.addAccount')}</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className={styles.tableContainer}>
        {isLoading ? (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
          </div>
        ) : paginatedAccounts.length === 0 ? (
          <div className={styles.emptyState}>
            <Building2 className={styles.emptyIcon} />
            <h3 className={styles.emptyTitle}>{t('admin.accounts.noAccounts')}</h3>
            <p className={styles.emptyMessage}>{t('admin.common.noResults')}</p>
          </div>
        ) : (
          <>
            <table className={styles.table}>
              <thead className={styles.tableHeader}>
                <tr>
                  <th>{t('admin.accounts.columns.name')}</th>
                  <th>{t('admin.accounts.columns.owner')}</th>
                  <th>{t('admin.accounts.columns.plan')}</th>
                  <th>{t('admin.accounts.columns.status')}</th>
                  <th>{t('admin.accounts.columns.createdAt')}</th>
                  <th>{t('admin.accounts.columns.actions')}</th>
                </tr>
              </thead>
              <tbody className={styles.tableBody}>
                {paginatedAccounts.map((account) => (
                  <tr key={account.id}>
                    <td>
                      <div className={styles.userCell}>
                        <div className={styles.avatar}>
                          <Building2 size={16} />
                        </div>
                        <div>
                          <div className={styles.userName}>{account.name}</div>
                          <div className={styles.userEmail}>/{account.slug}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div>
                        <div className={styles.userName}>{account.owner?.name || '-'}</div>
                        <div className={styles.userEmail}>{account.owner?.email || '-'}</div>
                      </div>
                    </td>
                    <td>
                      <span className={styles.planBadge}>
                        <CreditCard size={12} />
                        {getPlanName(account)}
                      </span>
                    </td>
                    <td>
                      <span className={`${styles.statusBadge} ${styles[account.status]}`}>
                        {t(`admin.accounts.statuses.${account.status}`)}
                      </span>
                    </td>
                    <td>{formatDate(account.createdAt)}</td>
                    <td>
                      <div className={styles.actionsCell}>
                        <button 
                          className={styles.actionButton} 
                          title={t('admin.accounts.actions.view')}
                          onClick={() => handleView(account)}
                        >
                          <Eye size={16} />
                        </button>
                        <button 
                          className={styles.actionButton} 
                          title={t('admin.accounts.actions.edit')}
                          onClick={() => handleEdit(account)}
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          className={`${styles.actionButton} ${styles.danger}`} 
                          title={t('admin.accounts.actions.delete')}
                          onClick={() => handleDeleteClick(account)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            <div className={styles.pagination}>
              <div className={styles.paginationInfo}>
                {t('admin.common.pagination.showing')} {(currentPage - 1) * itemsPerPage + 1} {t('admin.common.pagination.to')}{' '}
                {Math.min(currentPage * itemsPerPage, filteredAccounts.length)} {t('admin.common.pagination.of')}{' '}
                {filteredAccounts.length} {t('admin.common.pagination.items.accounts')}
              </div>
              <div className={styles.paginationButtons}>
                <button
                  className={styles.paginationButton}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft size={16} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    className={`${styles.paginationButton} ${page === currentPage ? styles.active : ''}`}
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </button>
                ))}
                <button
                  className={styles.paginationButton}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* View Modal */}
      <AdminModal
        isOpen={viewModalOpen}
        onClose={closeViewModal}
        title={t('admin.accounts.actions.view')}
        size="large"
      >
        {selectedAccount && (
          <div className={modalStyles.formGrid}>
            <FormInput
              label={t('admin.accounts.form.name')}
              value={selectedAccount.name}
              disabled
            />
            <FormInput
              label={t('admin.accounts.form.slug')}
              value={selectedAccount.slug}
              disabled
            />
            <FormInput
              label={t('admin.accounts.columns.owner')}
              value={selectedAccount.owner?.name || '-'}
              disabled
            />
            <FormInput
              label={t('admin.accounts.form.ownerEmail')}
              value={selectedAccount.owner?.email || '-'}
              disabled
            />
            <FormInput
              label={t('admin.accounts.form.logo')}
              value={selectedAccount.logo || '-'}
              disabled
            />
            <FormInput
              label={t('admin.accounts.form.website')}
              value={selectedAccount.website || '-'}
              disabled
            />
            <FormInput
              label={t('admin.accounts.form.industry')}
              value={selectedAccount.industry || '-'}
              disabled
            />
            <FormInput
              label={t('admin.accounts.form.timezone')}
              value={selectedAccount.timezone || 'UTC'}
              disabled
            />
            <FormInput
              label={t('admin.accounts.form.defaultLanguage')}
              value={selectedAccount.defaultLanguage || 'EN'}
              disabled
            />
            <FormInput
              label={t('admin.accounts.form.billingEmail')}
              value={selectedAccount.billingEmail || '-'}
              disabled
            />
            <FormInput
              label={t('admin.accounts.form.generalEmail')}
              value={selectedAccount.generalEmail || '-'}
              disabled
            />
            <FormInput
              label={t('admin.accounts.columns.plan')}
              value={getPlanName(selectedAccount)}
              disabled
            />
            <FormInput
              label={t('admin.accounts.columns.status')}
              value={t(`admin.accounts.statuses.${selectedAccount.status}`)}
              disabled
            />
            <FormInput
              label={t('admin.accounts.form.usersCount')}
              value={String(selectedAccount.usersCount || 0)}
              disabled
            />
            <FormInput
              label={t('admin.accounts.columns.createdAt')}
              value={formatDate(selectedAccount.createdAt)}
              disabled
            />
            <FormActions>
              <SecondaryButton onClick={closeViewModal}>
                {t('admin.common.close')}
              </SecondaryButton>
              <PrimaryButton onClick={() => { closeViewModal(); handleEdit(selectedAccount); }}>
                {t('admin.common.edit')}
              </PrimaryButton>
            </FormActions>
          </div>
        )}
      </AdminModal>

      {/* Edit Modal */}
      <AdminModal
        isOpen={editModalOpen}
        onClose={closeEditModal}
        title={selectedAccount ? t('admin.accounts.actions.edit') : t('admin.accounts.addAccount')}
        size="large"
      >
        <form onSubmit={handleSubmit}>
          <div className={modalStyles.formGrid}>
            <FormInput
              label={t('admin.accounts.form.name')}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
            <FormInput
              label={t('admin.accounts.form.slug')}
              value={formData.slug}
              onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
              required
            />
            {!selectedAccount && (
              <FormInput
                label={t('admin.accounts.form.ownerEmail')}
                type="email"
                value={formData.ownerEmail}
                onChange={(e) => setFormData({ ...formData, ownerEmail: e.target.value })}
                placeholder={t('admin.accounts.form.ownerEmailPlaceholder')}
              />
            )}
            <FormInput
              label={t('admin.accounts.form.logo')}
              type="url"
              value={formData.logo}
              onChange={(e) => setFormData({ ...formData, logo: e.target.value })}
              placeholder="https://..."
            />
            <FormInput
              label={t('admin.accounts.form.website')}
              type="url"
              value={formData.website}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              placeholder="https://..."
            />
            <FormInput
              label={t('admin.accounts.form.industry')}
              value={formData.industry}
              onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
            />
            <FormSelect
              label={t('admin.accounts.form.timezone')}
              value={formData.timezone}
              onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
              options={timezones.map(tz => ({ value: tz, label: tz }))}
            />
            <FormSelect
              label={t('admin.accounts.form.defaultLanguage')}
              value={formData.defaultLanguage}
              onChange={(e) => setFormData({ ...formData, defaultLanguage: e.target.value })}
              options={languages.map(lang => ({ value: lang, label: lang }))}
            />
            <FormInput
              label={t('admin.accounts.form.billingEmail')}
              type="email"
              value={formData.billingEmail}
              onChange={(e) => setFormData({ ...formData, billingEmail: e.target.value })}
              required
            />
            <FormInput
              label={t('admin.accounts.form.generalEmail')}
              type="email"
              value={formData.generalEmail}
              onChange={(e) => setFormData({ ...formData, generalEmail: e.target.value })}
              required
            />
            <FormCheckbox
              label={t('admin.accounts.form.isActive')}
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
            />
            <FormActions>
              <SecondaryButton type="button" onClick={closeEditModal}>
                {t('admin.common.cancel')}
              </SecondaryButton>
              <PrimaryButton type="submit" disabled={isSubmitting}>
                {isSubmitting ? t('admin.common.saving') : t('admin.common.save')}
              </PrimaryButton>
            </FormActions>
          </div>
        </form>
      </AdminModal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        title={t('admin.accounts.deleteConfirm.title')}
        message={t('admin.accounts.deleteConfirm.message', { name: selectedAccount?.name || '' })}
        confirmText={t('admin.common.delete')}
        isLoading={isSubmitting}
      />
    </div>
  );
}
