'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  AlertTriangle,
  Filter,
  Download,
  User,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useUser } from '@/app/context/user-context';
import styles from '../../admin-dashboard.module.css';

export default function UserAnalyticsPage() {
  const router = useRouter();
  const { id } = useParams();
  const searchParams = useSearchParams();
  const { t } = useLocale();
  const { isSuperAdmin, isLoading: isUserLoading } = useUser();

  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [filters, setFilters] = useState({
    from: searchParams.get('from') || '',
    to: searchParams.get('to') || '',
    minCost: searchParams.get('minCost') || '',
    maxCost: searchParams.get('maxCost') || '',
    minTokens: searchParams.get('minTokens') || '',
    maxTokens: searchParams.get('maxTokens') || '',
    minCredits: searchParams.get('minCredits') || '',
    maxCredits: searchParams.get('maxCredits') || '',
  });

  useEffect(() => {
    if (!isUserLoading && !isSuperAdmin) {
      router.push('/dashboard');
    }
  }, [isSuperAdmin, isUserLoading, router]);

  const fetchData = useCallback(async (filterOverrides) => {
    try {
      setIsLoading(true);
      const f = filterOverrides || filters;
      const params = new URLSearchParams();
      Object.entries(f).forEach(([key, val]) => {
        if (val) params.set(key, val);
      });
      const res = await fetch(`/api/admin/analytics/users/${id}?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch user analytics');
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [id, filters]);

  useEffect(() => {
    if (isSuperAdmin && id) fetchData();
  }, [isSuperAdmin, id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApplyFilters = () => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, val]) => {
      if (val) params.set(key, val);
    });
    router.replace(`/admin/users/${id}?${params.toString()}`, { scroll: false });
    fetchData(filters);
  };

  const handleClearFilters = () => {
    const cleared = { from: '', to: '', minCost: '', maxCost: '', minTokens: '', maxTokens: '', minCredits: '', maxCredits: '' };
    setFilters(cleared);
    router.replace(`/admin/users/${id}`, { scroll: false });
    fetchData(cleared);
  };

  const handleExportCSV = () => {
    if (!data?.usageData?.length) return;
    const headers = [
      t('admin.userAnalytics.usageLog.columns.date'),
      t('admin.userAnalytics.usageLog.columns.account'),
      t('admin.userAnalytics.usageLog.columns.actionType'),
      t('admin.userAnalytics.usageLog.columns.model'),
      t('admin.userAnalytics.usageLog.columns.inputTokens'),
      t('admin.userAnalytics.usageLog.columns.outputTokens'),
      t('admin.userAnalytics.usageLog.columns.credits'),
      t('admin.userAnalytics.usageLog.columns.costUsd'),
    ];
    const rows = data.usageData.map(row => [
      new Date(row.date).toISOString().slice(0, 19).replace('T', ' '),
      row.accountName,
      row.actionType,
      row.model,
      row.inputTokens,
      row.outputTokens,
      row.credits,
      row.cost.toFixed(6),
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `user-${id}-usage.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isUserLoading || (!isSuperAdmin && !isLoading)) return null;

  if (isLoading && !data) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingState}>
          <div className={styles.spinner}></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.errorState}>
          <AlertTriangle size={48} />
          <p>{error}</p>
          <button onClick={() => fetchData()} className={styles.retryButton}>{t('admin.userAnalytics.retry')}</button>
        </div>
      </div>
    );
  }

  const { user, totalAICost, usageData } = data;
  const initials = user.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';

  return (
    <div className={styles.page}>
      {/* Back link */}
      <Link href="/admin" className={styles.backLink}>
        <ArrowLeft size={18} />
        {t('admin.userAnalytics.back')}
      </Link>

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.userInfoHeader}>
            <div className={styles.userAvatar}>{initials}</div>
            <div>
              <h1 className={styles.title}>{user.name}</h1>
              <p className={styles.subtitle}>
                {t('admin.userAnalytics.header.details', { email: user.email, cost: totalAICost.toFixed(4) })}
              </p>
            </div>
          </div>
        </div>
        <button className={styles.filterButton} onClick={handleExportCSV}>
          <Download size={16} style={{ marginRight: 4, verticalAlign: 'text-bottom' }} />
          {t('admin.userAnalytics.exportCsv')}
        </button>
      </div>

      {/* Accounts */}
      {user.accounts?.length > 0 && (
        <div className={styles.profitHeader}>
          {user.accounts.map(acc => (
            <div key={acc.id} className={styles.profitItem}>
              <span className={styles.profitLabel}>{acc.name}</span>
              <Link
                href={`/admin/accounts/${acc.id}`}
                style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '0.9375rem', fontWeight: 500 }}
              >
                {acc.planName} &rarr;
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className={styles.filtersBar}>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>{t('admin.userAnalytics.filters.dateRange')}</span>
          <div className={styles.filterRow}>
            <input
              type="date"
              className={styles.filterInput}
              value={filters.from}
              onChange={e => setFilters(f => ({ ...f, from: e.target.value }))}
            />
            <span className={styles.filterSeparator}>{t('admin.userAnalytics.filters.to')}</span>
            <input
              type="date"
              className={styles.filterInput}
              value={filters.to}
              onChange={e => setFilters(f => ({ ...f, to: e.target.value }))}
            />
          </div>
        </div>

        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>{t('admin.userAnalytics.filters.cost')}</span>
          <div className={styles.filterRow}>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder={t('admin.userAnalytics.filters.min')}
              className={`${styles.filterInput} ${styles.filterInputSmall}`}
              value={filters.minCost}
              onChange={e => setFilters(f => ({ ...f, minCost: e.target.value }))}
            />
            <span className={styles.filterSeparator}>{t('admin.userAnalytics.filters.dash')}</span>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder={t('admin.userAnalytics.filters.max')}
              className={`${styles.filterInput} ${styles.filterInputSmall}`}
              value={filters.maxCost}
              onChange={e => setFilters(f => ({ ...f, maxCost: e.target.value }))}
            />
          </div>
        </div>

        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>{t('admin.userAnalytics.filters.tokens')}</span>
          <div className={styles.filterRow}>
            <input
              type="number"
              min="0"
              placeholder={t('admin.userAnalytics.filters.min')}
              className={`${styles.filterInput} ${styles.filterInputSmall}`}
              value={filters.minTokens}
              onChange={e => setFilters(f => ({ ...f, minTokens: e.target.value }))}
            />
            <span className={styles.filterSeparator}>{t('admin.userAnalytics.filters.dash')}</span>
            <input
              type="number"
              min="0"
              placeholder={t('admin.userAnalytics.filters.max')}
              className={`${styles.filterInput} ${styles.filterInputSmall}`}
              value={filters.maxTokens}
              onChange={e => setFilters(f => ({ ...f, maxTokens: e.target.value }))}
            />
          </div>
        </div>

        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>{t('admin.userAnalytics.filters.credits')}</span>
          <div className={styles.filterRow}>
            <input
              type="number"
              min="0"
              placeholder={t('admin.userAnalytics.filters.min')}
              className={`${styles.filterInput} ${styles.filterInputSmall}`}
              value={filters.minCredits}
              onChange={e => setFilters(f => ({ ...f, minCredits: e.target.value }))}
            />
            <span className={styles.filterSeparator}>{t('admin.userAnalytics.filters.dash')}</span>
            <input
              type="number"
              min="0"
              placeholder={t('admin.userAnalytics.filters.max')}
              className={`${styles.filterInput} ${styles.filterInputSmall}`}
              value={filters.maxCredits}
              onChange={e => setFilters(f => ({ ...f, maxCredits: e.target.value }))}
            />
          </div>
        </div>

        <button className={styles.filterButton} onClick={handleApplyFilters}>
          <Filter size={14} style={{ marginRight: 4, verticalAlign: 'text-bottom' }} />
          {t('admin.userAnalytics.filters.apply')}
        </button>
        <button className={styles.clearButton} onClick={handleClearFilters}>
          {t('admin.userAnalytics.filters.clear')}
        </button>
      </div>

      {/* Usage Data Table */}
      <div className={styles.tableCard}>
        <h2 className={styles.sectionTitle}>
          {t('admin.userAnalytics.usageLog.title')} ({usageData.length === 1 ? t('admin.userAnalytics.usageLog.entry') : t('admin.userAnalytics.usageLog.entries', { count: usageData.length })})
        </h2>
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead className={styles.tableHeader}>
              <tr>
                <th>{t('admin.userAnalytics.usageLog.columns.date')}</th>
                <th>{t('admin.userAnalytics.usageLog.columns.account')}</th>
                <th>{t('admin.userAnalytics.usageLog.columns.actionType')}</th>
                <th>{t('admin.userAnalytics.usageLog.columns.model')}</th>
                <th>{t('admin.userAnalytics.usageLog.columns.inputTokens')}</th>
                <th>{t('admin.userAnalytics.usageLog.columns.outputTokens')}</th>
                <th>{t('admin.userAnalytics.usageLog.columns.credits')}</th>
                <th>{t('admin.userAnalytics.usageLog.columns.costUsd')}</th>
              </tr>
            </thead>
            <tbody className={styles.tableBody}>
              {usageData.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.date).toLocaleString()}</td>
                  <td>
                    {row.accountId ? (
                      <Link
                        href={`/admin/accounts/${row.accountId}`}
                        style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}
                      >
                        {row.accountName}
                      </Link>
                    ) : (
                      row.accountName
                    )}
                  </td>
                  <td>{row.actionType}</td>
                  <td>
                    <span className={styles.planBadge}>{row.model}</span>
                  </td>
                  <td>{row.inputTokens.toLocaleString()}</td>
                  <td>{row.outputTokens.toLocaleString()}</td>
                  <td>{row.credits}</td>
                  <td>${row.cost.toFixed(6)}</td>
                </tr>
              ))}
              {usageData.length === 0 && (
                <tr>
                  <td colSpan={8} className={styles.emptyCell}>
                    {t('admin.userAnalytics.usageLog.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
