'use client';

import {
  FileStack,
  Check,
  X,
  Users,
  Sparkles,
  Edit2,
  Trash2,
  Copy,
  Archive,
  RotateCcw,
  Languages,
  Globe,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { TableSkeleton } from '@/app/dashboard/components';
import styles from '../../admin.module.css';

export default function PlansTable({
  filteredPlans,
  isLoading,
  expandedPlan,
  onToggleExpand,
  onEdit,
  onDuplicate,
  onDelete,
  onToggleActive,
  onTranslate,
  getPlanName,
  getPlanDescription,
  getPlanFeatures,
}) {
  const { t } = useLocale();
  
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };
  
  if (isLoading) {
    return <TableSkeleton rows={8} columns={6} hasActions />;
  }
  
  if (filteredPlans.length === 0) {
    return (
      <div className={styles.emptyState}>
        <FileStack className={styles.emptyIcon} />
        <h3 className={styles.emptyTitle}>{t('admin.plans.noPlans')}</h3>
        <p className={styles.emptyMessage}>{t('admin.common.noResults')}</p>
      </div>
    );
  }
  
  return (
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
                onClick={() => onToggleExpand(plan.id)}
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
                  onClick={() => onTranslate(plan)}
                >
                  <Languages size={16} />
                </button>
                <button 
                  className={styles.actionButton} 
                  title={t('admin.plans.actions.edit')}
                  onClick={() => onEdit(plan)}
                >
                  <Edit2 size={16} />
                </button>
                <button 
                  className={styles.actionButton} 
                  title={t('admin.plans.actions.duplicate')}
                  onClick={() => onDuplicate(plan)}
                >
                  <Copy size={16} />
                </button>
                {plan.status === 'active' ? (
                  <button 
                    className={styles.actionButton} 
                    title={t('admin.plans.actions.archive')}
                    onClick={() => onToggleActive(plan)}
                  >
                    <Archive size={16} />
                  </button>
                ) : (
                  <>
                    <button 
                      className={styles.actionButton} 
                      title={t('admin.common.reactivate')}
                      onClick={() => onToggleActive(plan)}
                    >
                      <RotateCcw size={16} />
                    </button>
                    <button 
                      className={`${styles.actionButton} ${styles.danger}`} 
                      title={t('admin.plans.actions.delete')}
                      onClick={() => onDelete(plan)}
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
  );
}
