'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Filter,
  Download,
  RefreshCw,
  Eye,
  Edit2,
  XCircle,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  DollarSign,
  Calendar,
  RotateCcw,
  X,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useUser } from '@/app/context/user-context';
import styles from '../admin.module.css';

export default function SubscriptionsPage() {
  const router = useRouter();
  const { t, locale } = useLocale();
  const { isSuperAdmin, isLoading: isUserLoading } = useUser();
  const [subscriptions, setSubscriptions] = useState([]);
  const [plans, setPlans] = useState([]);
  const [stats, setStats] = useState({ total: 0, active: 0, trialing: 0, canceled: 0, pastDue: 0, mrr: 0, arr: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Modal states
  const [viewModal, setViewModal] = useState({ open: false, subscription: null });
  const [editModal, setEditModal] = useState({ open: false, subscription: null, selectedPlanId: '' });
  const [confirmModal, setConfirmModal] = useState({ open: false, subscription: null, action: null });
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Redirect non-admin users
  useEffect(() => {
    if (!isUserLoading && !isSuperAdmin) {
      router.push('/dashboard');
    }
  }, [isSuperAdmin, isUserLoading, router]);

  // Load subscriptions from API
  const loadSubscriptions = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/subscriptions');
      if (!response.ok) {
        throw new Error('Failed to fetch subscriptions');
      }
      const data = await response.json();
      setSubscriptions(data.subscriptions || []);
      setStats(data.stats || { total: 0, active: 0, trialing: 0, canceled: 0, pastDue: 0, mrr: 0, arr: 0 });
    } catch (error) {
      console.error('Failed to load subscriptions:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load plans for plan change dropdown
  const loadPlans = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/plans');
      if (response.ok) {
        const data = await response.json();
        setPlans(data.plans || []);
      }
    } catch (error) {
      console.error('Failed to load plans:', error);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) {
      loadSubscriptions();
      loadPlans();
    }
  }, [isSuperAdmin, loadSubscriptions, loadPlans]);

  // Handle view subscription
  const handleView = async (sub) => {
    try {
      const response = await fetch(`/api/admin/subscriptions/${sub.id}`);
      if (response.ok) {
        const data = await response.json();
        setViewModal({ open: true, subscription: data.subscription });
      }
    } catch (error) {
      console.error('Failed to fetch subscription details:', error);
    }
  };

  // Handle edit subscription (open plan change modal)
  const handleEdit = (sub) => {
    setEditModal({ 
      open: true, 
      subscription: sub, 
      selectedPlanId: plans.find(p => p.name === sub.plan.name)?.id || '' 
    });
  };

  // Handle cancel subscription
  const handleCancel = (sub) => {
    setConfirmModal({ open: true, subscription: sub, action: 'cancel' });
  };

  // Handle reactivate subscription
  const handleReactivate = (sub) => {
    setConfirmModal({ open: true, subscription: sub, action: 'reactivate' });
  };

  // Execute subscription action
  const executeAction = async (action, subscriptionId, planId = null) => {
    setIsActionLoading(true);
    try {
      const body = { action };
      if (planId) body.planId = planId;

      const response = await fetch(`/api/admin/subscriptions/${subscriptionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Action failed');
      }

      // Refresh subscriptions list
      await loadSubscriptions();
      
      // Close modals
      setConfirmModal({ open: false, subscription: null, action: null });
      setEditModal({ open: false, subscription: null, selectedPlanId: '' });
    } catch (error) {
      console.error('Action failed:', error);
      alert(error.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  // Filter subscriptions by search query
  const filteredSubscriptions = subscriptions.filter(sub =>
    sub.account.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    sub.plan.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Pagination
  const totalPages = Math.ceil(filteredSubscriptions.length / itemsPerPage);
  const paginatedSubscriptions = filteredSubscriptions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString();
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  // Get translated plan name
  const getPlanName = (plan) => {
    if (!plan) return '-';
    const langKey = locale.toUpperCase();
    return plan.translations?.[langKey]?.name || plan.name;
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
        <h1 className={styles.adminTitle}>{t('admin.subscriptions.title')}</h1>
        <p className={styles.adminSubtitle}>{t('admin.subscriptions.subtitle')}</p>
      </div>

      {/* Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t('admin.subscriptions.totalSubscriptions')}</div>
          <div className={styles.statValue}>{stats.total}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t('admin.subscriptions.mrr')}</div>
          <div className={styles.statValue}>{formatCurrency(stats.mrr)}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t('admin.subscriptions.arr')}</div>
          <div className={styles.statValue}>{formatCurrency(stats.arr)}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t('admin.subscriptions.statuses.active')}</div>
          <div className={styles.statValue}>{stats.active}</div>
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
              placeholder={t('admin.subscriptions.searchPlaceholder')}
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
          <button className={styles.refreshButton} onClick={loadSubscriptions}>
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className={styles.tableContainer}>
        {isLoading ? (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
          </div>
        ) : paginatedSubscriptions.length === 0 ? (
          <div className={styles.emptyState}>
            <CreditCard className={styles.emptyIcon} />
            <h3 className={styles.emptyTitle}>{t('admin.subscriptions.noSubscriptions')}</h3>
            <p className={styles.emptyMessage}>{t('admin.common.noResults')}</p>
          </div>
        ) : (
          <>
            <table className={styles.table}>
              <thead className={styles.tableHeader}>
                <tr>
                  <th>{t('admin.subscriptions.columns.account')}</th>
                  <th>{t('admin.subscriptions.columns.plan')}</th>
                  <th>{t('admin.subscriptions.columns.status')}</th>
                  <th>{t('admin.subscriptions.columns.billing')}</th>
                  <th>{t('admin.subscriptions.columns.amount')}</th>
                  <th>{t('admin.subscriptions.columns.nextBilling')}</th>
                  <th>{t('admin.subscriptions.columns.actions')}</th>
                </tr>
              </thead>
              <tbody className={styles.tableBody}>
                {paginatedSubscriptions.map((sub) => (
                  <tr key={sub.id}>
                    <td>
                      <div>
                        <div className={styles.userName}>{sub.account.name}</div>
                        <div className={styles.userEmail}>/{sub.account.slug}</div>
                      </div>
                    </td>
                    <td>
                      <span className={styles.planBadge}>
                        <CreditCard size={12} />
                        {getPlanName(sub.plan)}
                      </span>
                    </td>
                    <td>
                      <span className={`${styles.statusBadge} ${styles[sub.status]}`}>
                        {t(`admin.subscriptions.statuses.${sub.status}`)}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Calendar size={14} style={{ color: 'var(--muted-foreground)' }} />
                        {t(`admin.subscriptions.billingCycles.${sub.billingCycle}`)}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <DollarSign size={14} style={{ color: 'var(--muted-foreground)' }} />
                        {sub.plan.price}{sub.billingCycle === 'yearly' ? t('admin.subscriptions.billingCycles.perYear') : t('admin.subscriptions.billingCycles.perMonth')}
                      </div>
                    </td>
                    <td>
                      {sub.status === 'trialing' 
                        ? t('admin.common.trialEnds').replace('{date}', formatDate(sub.trialEnd))
                        : sub.status === 'canceled'
                        ? t('admin.common.canceledOn').replace('{date}', formatDate(sub.canceledAt))
                        : formatDate(sub.currentPeriodEnd)
                      }
                    </td>
                    <td>
                      <div className={styles.actionsCell}>
                        <button 
                          className={styles.actionButton} 
                          title={t('admin.subscriptions.actions.view')}
                          onClick={() => handleView(sub)}
                        >
                          <Eye size={16} />
                        </button>
                        <button 
                          className={styles.actionButton} 
                          title={t('admin.subscriptions.actions.modify')}
                          onClick={() => handleEdit(sub)}
                        >
                          <Edit2 size={16} />
                        </button>
                        {sub.status === 'canceled' || sub.cancelAtPeriodEnd ? (
                          <button 
                            className={styles.actionButton} 
                            title={t('admin.common.reactivate')}
                            onClick={() => handleReactivate(sub)}
                          >
                            <RotateCcw size={16} />
                          </button>
                        ) : (
                          <button 
                            className={`${styles.actionButton} ${styles.danger}`} 
                            title={t('admin.subscriptions.actions.cancel')}
                            onClick={() => handleCancel(sub)}
                          >
                            <XCircle size={16} />
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
                {Math.min(currentPage * itemsPerPage, filteredSubscriptions.length)} {t('admin.common.pagination.of')}{' '}
                {filteredSubscriptions.length} {t('admin.common.pagination.items.subscriptions')}
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

      {/* View Subscription Modal */}
      {viewModal.open && viewModal.subscription && (
        <div className={styles.modalOverlay} onClick={() => setViewModal({ open: false, subscription: null })}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>{t('admin.subscriptions.viewTitle')}</h2>
              <button 
                className={styles.modalClose}
                onClick={() => setViewModal({ open: false, subscription: null })}
                title={t('admin.common.close')}
              >
                <X size={20} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.detailGrid}>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>{t('admin.subscriptions.columns.account')}</span>
                  <span className={styles.detailValue}>{viewModal.subscription.account.name}</span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>{t('admin.subscriptions.columns.plan')}</span>
                  <span className={styles.detailValue}>{getPlanName(viewModal.subscription.plan)}</span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>{t('admin.subscriptions.columns.status')}</span>
                  <span className={`${styles.statusBadge} ${styles[viewModal.subscription.status?.toLowerCase()]}`}>
                    {t(`admin.subscriptions.statuses.${viewModal.subscription.status?.toLowerCase()}`)}
                  </span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>{t('admin.subscriptions.columns.amount')}</span>
                  <span className={styles.detailValue}>
                    {formatCurrency(viewModal.subscription.plan.price)} / {t(`admin.subscriptions.billingCycles.${viewModal.subscription.plan.interval?.toLowerCase() || 'monthly'}`)}
                  </span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>{t('admin.subscriptions.periodStart')}</span>
                  <span className={styles.detailValue}>{formatDate(viewModal.subscription.currentPeriodStart)}</span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>{t('admin.subscriptions.periodEnd')}</span>
                  <span className={styles.detailValue}>{formatDate(viewModal.subscription.currentPeriodEnd)}</span>
                </div>
                {viewModal.subscription.cancelAtPeriodEnd && (
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>{t('admin.subscriptions.cancelScheduled')}</span>
                    <span className={styles.detailValue} style={{ color: 'var(--destructive)' }}>
                      {t('admin.common.yes')}
                    </span>
                  </div>
                )}
                {viewModal.subscription.payments && viewModal.subscription.payments.length > 0 && (
                  <div className={styles.detailItem} style={{ gridColumn: '1 / -1' }}>
                    <span className={styles.detailLabel}>{t('admin.subscriptions.recentPayments')}</span>
                    <div style={{ marginTop: '0.5rem' }}>
                      {viewModal.subscription.payments.map((payment) => (
                        <div key={payment.id} style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          padding: '0.5rem 0',
                          borderBottom: '1px solid var(--border)'
                        }}>
                          <span>{formatDate(payment.createdAt)}</span>
                          <span>{formatCurrency(payment.amount)}</span>
                          <span className={`${styles.statusBadge} ${styles[payment.status?.toLowerCase()]}`}>
                            {t(`admin.subscriptions.paymentStatuses.${payment.status?.toLowerCase()}`) || payment.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button 
                className={styles.secondaryButton}
                onClick={() => setViewModal({ open: false, subscription: null })}
              >
                {t('admin.common.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Subscription Modal */}
      {editModal.open && editModal.subscription && (
        <div className={styles.modalOverlay} onClick={() => setEditModal({ open: false, subscription: null, selectedPlanId: '' })}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>{t('admin.subscriptions.changePlan')}</h2>
              <button 
                className={styles.modalClose}
                onClick={() => setEditModal({ open: false, subscription: null, selectedPlanId: '' })}
                title={t('admin.common.close')}
              >
                <X size={20} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <p style={{ marginBottom: '1rem' }}>
                {t('admin.subscriptions.changePlanDescription').replace('{account}', editModal.subscription.account.name)}
              </p>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>{t('admin.subscriptions.selectNewPlan')}</label>
                <select
                  className={styles.formSelect}
                  value={editModal.selectedPlanId}
                  onChange={(e) => setEditModal({ ...editModal, selectedPlanId: e.target.value })}
                >
                  <option value="">{t('admin.subscriptions.selectPlan')}</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {getPlanName(plan)} - {formatCurrency(plan.monthlyPrice)}{t('admin.subscriptions.billingCycles.perMonth')}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button 
                className={styles.secondaryButton}
                onClick={() => setEditModal({ open: false, subscription: null, selectedPlanId: '' })}
              >
                {t('admin.common.close')}
              </button>
              <button 
                className={styles.primaryButton}
                onClick={() => executeAction('change_plan', editModal.subscription.id, editModal.selectedPlanId)}
                disabled={!editModal.selectedPlanId || isActionLoading}
              >
                {isActionLoading ? t('admin.common.saving') : t('admin.common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Action Modal */}
      {confirmModal.open && confirmModal.subscription && (
        <div className={styles.modalOverlay} onClick={() => setConfirmModal({ open: false, subscription: null, action: null })}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>
                {confirmModal.action === 'cancel' 
                  ? t('admin.subscriptions.confirmCancel') 
                  : t('admin.subscriptions.confirmReactivate')}
              </h2>
              <button 
                className={styles.modalClose}
                onClick={() => setConfirmModal({ open: false, subscription: null, action: null })}
                title={t('admin.common.close')}
              >
                <X size={20} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ 
                  width: '48px', 
                  height: '48px', 
                  borderRadius: '50%', 
                  backgroundColor: confirmModal.action === 'cancel' ? 'var(--destructive-muted)' : 'var(--success-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {confirmModal.action === 'cancel' 
                    ? <AlertTriangle size={24} style={{ color: 'var(--destructive)' }} />
                    : <Check size={24} style={{ color: 'var(--success)' }} />
                  }
                </div>
                <div>
                  <p style={{ fontWeight: 500 }}>
                    {confirmModal.action === 'cancel' 
                      ? t('admin.subscriptions.cancelWarning')
                      : t('admin.subscriptions.reactivateInfo')}
                  </p>
                  <p style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem' }}>
                    {t('admin.subscriptions.accountLabel')}: {confirmModal.subscription.account.name}
                  </p>
                </div>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button 
                className={styles.secondaryButton}
                onClick={() => setConfirmModal({ open: false, subscription: null, action: null })}
              >
                {t('admin.common.close')}
              </button>
              <button 
                className={confirmModal.action === 'cancel' ? styles.dangerButton : styles.primaryButton}
                onClick={() => executeAction(confirmModal.action, confirmModal.subscription.id)}
                disabled={isActionLoading}
              >
                {isActionLoading 
                  ? t('admin.common.processing') 
                  : confirmModal.action === 'cancel' 
                    ? t('admin.subscriptions.actions.cancel')
                    : t('admin.common.reactivate')
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
