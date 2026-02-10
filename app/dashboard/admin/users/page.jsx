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
  Users,
  ChevronLeft,
  ChevronRight,
  Shield,
  UserCheck,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useUser } from '@/app/context/user-context';
import { AdminModal, ConfirmDialog, FormInput, FormCheckbox, FormSelect, FormActions, PrimaryButton, SecondaryButton } from '../components/AdminModal';
import { AdminPageSkeleton, TableSkeleton } from '@/app/dashboard/components';
import styles from '../admin.module.css';
import modalStyles from '../components/AdminModal.module.css';

// Protected user emails that cannot be deleted
const PROTECTED_EMAILS = ['matansaban28@gmail.com'];

export default function PlatformUsersPage() {
  const router = useRouter();
  const { t } = useLocale();
  const { isSuperAdmin, isLoading: isUserLoading } = useUser();
  const [users, setUsers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [stats, setStats] = useState({ total: 0, active: 0, superAdmins: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Modal states
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phoneNumber: '',
    image: '',
    primaryAuthMethod: 'EMAIL',
    selectedLanguage: '',
    preferredCurrency: '',
    registrationStep: 'COMPLETED',
    consentGiven: false,
    isActive: true,
    isSuperAdmin: false,
    emailVerified: false,
    phoneVerified: false,
    accountId: '',
  });

  // Enum options
  const authMethods = ['EMAIL', 'GOOGLE', 'GITHUB', 'FACEBOOK', 'APPLE'];
  const languages = ['EN', 'HE', 'AR', 'ES', 'FR', 'DE', 'PT', 'IT', 'RU', 'ZH', 'JA', 'KO'];
  const currencies = ['USD', 'ILS', 'EUR', 'GBP'];
  const registrationSteps = ['VERIFY', 'ACCOUNT_SETUP', 'INTERVIEW', 'PLAN', 'PAYMENT', 'COMPLETED'];

  // Redirect non-admin users
  useEffect(() => {
    if (!isUserLoading && !isSuperAdmin) {
      router.push('/dashboard');
    }
  }, [isSuperAdmin, isUserLoading, router]);

  // Load users from API
  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/users');
      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }
      const data = await response.json();
      setUsers(data.users || []);
      setStats(data.stats || { total: 0, active: 0, superAdmins: 0 });
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load accounts for linking
  const loadAccounts = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/accounts');
      if (response.ok) {
        const data = await response.json();
        setAccounts(data.accounts || []);
      }
    } catch (error) {
      console.error('Failed to load accounts:', error);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) {
      loadUsers();
      loadAccounts();
    }
  }, [isSuperAdmin, loadUsers, loadAccounts]);

  // Filter users by search query
  const filteredUsers = users.filter(user =>
    `${user.firstName} ${user.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Pagination
  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getInitials = (firstName, lastName) => {
    return `${firstName[0]}${lastName[0]}`.toUpperCase();
  };

  const formatLastLogin = (dateString) => {
    if (!dateString) return t('admin.users.statuses.inactive');
    const date = new Date(dateString);
    const now = new Date();
    const diffHours = Math.floor((now - date) / (1000 * 60 * 60));
    
    if (diffHours < 1) return t('admin.common.time.justNow');
    if (diffHours < 24) return t('admin.common.time.hoursAgo').replace('{hours}', diffHours);
    if (diffHours < 48) return t('admin.common.time.yesterday');
    return date.toLocaleDateString();
  };

  // Open view modal
  const handleView = (user) => {
    setSelectedUser(user);
    setViewModalOpen(true);
  };

  // Open edit modal
  const handleEdit = (user) => {
    setSelectedUser(user);
    setFormData({
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      email: user.email || '',
      password: '',
      phoneNumber: user.phoneNumber || '',
      image: user.image || '',
      primaryAuthMethod: user.primaryAuthMethod || 'EMAIL',
      selectedLanguage: user.selectedLanguage || '',
      preferredCurrency: user.preferredCurrency || '',
      registrationStep: user.registrationStep || 'COMPLETED',
      consentGiven: user.consentGiven || false,
      isActive: user.isActive !== false,
      isSuperAdmin: user.isSuperAdmin || false,
      emailVerified: !!user.emailVerified,
      phoneVerified: !!user.phoneVerified,
      accountId: user.accountIds?.[0] || '',
    });
    setEditModalOpen(true);
  };

  // Open add modal
  const handleAdd = () => {
    setSelectedUser(null);
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      phoneNumber: '',
      image: '',
      primaryAuthMethod: 'EMAIL',
      selectedLanguage: '',
      preferredCurrency: '',
      registrationStep: 'COMPLETED',
      consentGiven: false,
      isActive: true,
      isSuperAdmin: false,
      emailVerified: false,
      phoneVerified: false,
      accountId: '',
    });
    setEditModalOpen(true);
  };

  // Close modals
  const closeEditModal = () => {
    setEditModalOpen(false);
    setSelectedUser(null);
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      phoneNumber: '',
      image: '',
      primaryAuthMethod: 'EMAIL',
      selectedLanguage: '',
      preferredCurrency: '',
      registrationStep: 'COMPLETED',
      consentGiven: false,
      isActive: true,
      isSuperAdmin: false,
      emailVerified: false,
      phoneVerified: false,
      accountId: '',
    });
  };

  const closeViewModal = () => {
    setViewModalOpen(false);
    setSelectedUser(null);
  };

  // Submit add/edit form
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const url = selectedUser
        ? `/api/admin/users/${selectedUser.id}`
        : '/api/admin/users';
      const method = selectedUser ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save user');
      }

      closeEditModal();
      loadUsers();
    } catch (error) {
      console.error('Error saving user:', error);
      alert(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open delete confirmation
  const handleDeleteClick = (user) => {
    setSelectedUser(user);
    setDeleteDialogOpen(true);
  };

  // Confirm delete
  const handleDeleteConfirm = async () => {
    if (!selectedUser) return;
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete user');
      }

      setDeleteDialogOpen(false);
      setSelectedUser(null);
      loadUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      alert(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isUserLoading) {
    return <AdminPageSkeleton statsCount={3} columns={5} />;
  }

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className={styles.adminPage}>
      {/* Header */}
      <div className={styles.adminHeader}>
        <h1 className={styles.adminTitle}>{t('admin.users.title')}</h1>
        <p className={styles.adminSubtitle}>{t('admin.users.subtitle')}</p>
      </div>

      {/* Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t('admin.users.totalUsers')}</div>
          <div className={styles.statValue}>{stats.total}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t('admin.users.statuses.active')}</div>
          <div className={styles.statValue}>{stats.active}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t('admin.users.roles.superAdmin')}</div>
          <div className={styles.statValue}>{stats.superAdmins}</div>
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
              placeholder={t('admin.users.searchPlaceholder')}
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
          <button className={styles.refreshButton} onClick={loadUsers}>
            <RefreshCw size={16} />
          </button>
          <button className={styles.addButton} onClick={handleAdd}>
            <Plus size={16} />
            <span>{t('admin.users.addUser')}</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className={styles.tableContainer}>
        {isLoading ? (
          <TableSkeleton rows={8} columns={5} hasActions />
        ) : paginatedUsers.length === 0 ? (
          <div className={styles.emptyState}>
            <Users className={styles.emptyIcon} />
            <h3 className={styles.emptyTitle}>{t('admin.users.noUsers')}</h3>
            <p className={styles.emptyMessage}>{t('admin.common.noResults')}</p>
          </div>
        ) : (
          <>
            <table className={styles.table}>
              <thead className={styles.tableHeader}>
                <tr>
                  <th>{t('admin.users.columns.name')}</th>
                  <th>{t('admin.users.columns.accounts')}</th>
                  <th>{t('admin.users.columns.role')}</th>
                  <th>{t('admin.users.columns.status')}</th>
                  <th>{t('admin.users.columns.lastLogin')}</th>
                  <th>{t('admin.users.columns.actions')}</th>
                </tr>
              </thead>
              <tbody className={styles.tableBody}>
                {paginatedUsers.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className={styles.userCell}>
                        <div className={styles.avatar}>
                          {getInitials(user.firstName, user.lastName)}
                        </div>
                        <div>
                          <div className={styles.userName}>
                            {user.firstName} {user.lastName}
                            {user.isSuperAdmin && (
                              <Shield size={14} style={{ marginInlineStart: '0.5rem', color: 'var(--primary)' }} />
                            )}
                          </div>
                          <div className={styles.userEmail}>{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {user.accounts.length === 0 ? (
                        <span style={{ color: 'var(--muted-foreground)' }}>-</span>
                      ) : (
                        <span>{user.accounts.join(', ')}</span>
                      )}
                    </td>
                    <td>
                      <span className={styles.planBadge}>
                        {user.isSuperAdmin ? (
                          <>
                            <Shield size={12} />
                            {t('admin.users.roles.superAdmin')}
                          </>
                        ) : (
                          <>
                            <UserCheck size={12} />
                            {t(`admin.users.roles.${user.role}`)}
                          </>
                        )}
                      </span>
                    </td>
                    <td>
                      <span className={`${styles.statusBadge} ${styles[user.status]}`}>
                        {t(`admin.users.statuses.${user.status}`)}
                      </span>
                    </td>
                    <td>{formatLastLogin(user.lastLoginAt)}</td>
                    <td>
                      <div className={styles.actionsCell}>
                        <button 
                          className={styles.actionButton} 
                          title={t('admin.users.actions.view')}
                          onClick={() => handleView(user)}
                        >
                          <Eye size={16} />
                        </button>
                        <button 
                          className={styles.actionButton} 
                          title={t('admin.users.actions.edit')}
                          onClick={() => handleEdit(user)}
                        >
                          <Edit2 size={16} />
                        </button>
                        {!PROTECTED_EMAILS.includes(user.email) && (
                          <button 
                            className={`${styles.actionButton} ${styles.danger}`} 
                            title={t('admin.users.actions.delete')}
                            onClick={() => handleDeleteClick(user)}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
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
                {Math.min(currentPage * itemsPerPage, filteredUsers.length)} {t('admin.common.pagination.of')}{' '}
                {filteredUsers.length} {t('admin.common.pagination.items.users')}
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
        title={t('admin.users.actions.view')}
        size="large"
      >
        {selectedUser && (
          <div className={modalStyles.formGrid}>
            <FormInput
              label={t('admin.users.form.firstName')}
              value={selectedUser.firstName || '-'}
              disabled
            />
            <FormInput
              label={t('admin.users.form.lastName')}
              value={selectedUser.lastName || '-'}
              disabled
            />
            <FormInput
              label={t('admin.users.form.email')}
              value={selectedUser.email}
              disabled
            />
            <FormInput
              label={t('admin.users.form.phoneNumber')}
              value={selectedUser.phoneNumber || '-'}
              disabled
            />
            <FormInput
              label={t('admin.users.form.image')}
              value={selectedUser.image || '-'}
              disabled
            />
            <FormInput
              label={t('admin.users.form.primaryAuthMethod')}
              value={selectedUser.primaryAuthMethod || '-'}
              disabled
            />
            <FormInput
              label={t('admin.users.form.selectedLanguage')}
              value={selectedUser.selectedLanguage || '-'}
              disabled
            />
            <FormInput
              label={t('admin.users.form.preferredCurrency')}
              value={selectedUser.preferredCurrency || '-'}
              disabled
            />
            <FormInput
              label={t('admin.users.form.registrationStep')}
              value={selectedUser.registrationStep || '-'}
              disabled
            />
            <FormInput
              label={t('admin.users.form.emailVerified')}
              value={selectedUser.emailVerified ? t('admin.common.yes') : t('admin.common.no')}
              disabled
            />
            <FormInput
              label={t('admin.users.form.phoneVerified')}
              value={selectedUser.phoneVerified ? t('admin.common.yes') : t('admin.common.no')}
              disabled
            />
            <FormInput
              label={t('admin.users.columns.accounts')}
              value={selectedUser.accounts?.join(', ') || '-'}
              disabled
            />
            <FormInput
              label={t('admin.users.columns.lastLogin')}
              value={formatLastLogin(selectedUser.lastLoginAt)}
              disabled
            />
            <FormInput
              label={t('admin.users.form.createdAt')}
              value={selectedUser.createdAt ? new Date(selectedUser.createdAt).toLocaleString() : '-'}
              disabled
            />
            <FormCheckbox
              label={t('admin.users.form.consentGiven')}
              checked={selectedUser.consentGiven || false}
              disabled
            />
            <FormCheckbox
              label={t('admin.users.form.isActive')}
              checked={selectedUser.isActive !== false}
              disabled
            />
            <FormCheckbox
              label={t('admin.users.form.superAdmin')}
              checked={selectedUser.isSuperAdmin}
              disabled
            />
            <FormActions>
              <SecondaryButton onClick={closeViewModal}>
                {t('admin.common.close')}
              </SecondaryButton>
              <PrimaryButton onClick={() => { closeViewModal(); handleEdit(selectedUser); }}>
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
        title={selectedUser ? t('admin.users.actions.edit') : t('admin.users.addUser')}
        size="large"
      >
        <form onSubmit={handleSubmit}>
          <div className={modalStyles.formGrid}>
            <FormInput
              label={t('admin.users.form.firstName')}
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              required
            />
            <FormInput
              label={t('admin.users.form.lastName')}
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              required
            />
            <FormInput
              label={t('admin.users.form.email')}
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />
            {!selectedUser && (
              <FormInput
                label={t('admin.users.form.password')}
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
              />
            )}
            <FormSelect
              label={t('admin.users.form.linkToAccount')}
              value={formData.accountId}
              onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
              options={[
                { value: '', label: t('admin.users.form.noAccount') },
                ...accounts.map(a => ({ value: a.id, label: a.name }))
              ]}
            />
            <FormInput
              label={t('admin.users.form.phoneNumber')}
              type="tel"
              value={formData.phoneNumber}
              onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
            />
            <FormInput
              label={t('admin.users.form.image')}
              type="url"
              value={formData.image}
              onChange={(e) => setFormData({ ...formData, image: e.target.value })}
              placeholder="https://..."
            />
            <FormSelect
              label={t('admin.users.form.primaryAuthMethod')}
              value={formData.primaryAuthMethod}
              onChange={(e) => setFormData({ ...formData, primaryAuthMethod: e.target.value })}
              options={authMethods.map(m => ({ value: m, label: m }))}
            />
            <FormSelect
              label={t('admin.users.form.selectedLanguage')}
              value={formData.selectedLanguage}
              onChange={(e) => setFormData({ ...formData, selectedLanguage: e.target.value })}
              options={[{ value: '', label: '-' }, ...languages.map(l => ({ value: l, label: l }))]}
            />
            <FormSelect
              label={t('admin.users.form.preferredCurrency')}
              value={formData.preferredCurrency}
              onChange={(e) => setFormData({ ...formData, preferredCurrency: e.target.value })}
              options={[{ value: '', label: '-' }, ...currencies.map(c => ({ value: c, label: c }))]}
            />
            <FormSelect
              label={t('admin.users.form.registrationStep')}
              value={formData.registrationStep}
              onChange={(e) => setFormData({ ...formData, registrationStep: e.target.value })}
              options={registrationSteps.map(s => ({ value: s, label: s }))}
            />
            <FormCheckbox
              label={t('admin.users.form.emailVerified')}
              checked={formData.emailVerified}
              onChange={(e) => setFormData({ ...formData, emailVerified: e.target.checked })}
            />
            <FormCheckbox
              label={t('admin.users.form.phoneVerified')}
              checked={formData.phoneVerified}
              onChange={(e) => setFormData({ ...formData, phoneVerified: e.target.checked })}
            />
            <FormCheckbox
              label={t('admin.users.form.consentGiven')}
              checked={formData.consentGiven}
              onChange={(e) => setFormData({ ...formData, consentGiven: e.target.checked })}
            />
            <FormCheckbox
              label={t('admin.users.form.isActive')}
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
            />
            <FormCheckbox
              label={t('admin.users.form.superAdmin')}
              checked={formData.isSuperAdmin}
              onChange={(e) => setFormData({ ...formData, isSuperAdmin: e.target.checked })}
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
        title={t('admin.users.deleteConfirm.title')}
        message={t('admin.users.deleteConfirm.message', { name: selectedUser ? `${selectedUser.firstName} ${selectedUser.lastName}` : '' })}
        confirmText={t('admin.common.delete')}
        isLoading={isSubmitting}
      />
    </div>
  );
}
