'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Coins,
  Cpu,
  Filter,
  Download,
  AlertTriangle,
} from 'lucide-react';
import { useUser } from '@/app/context/user-context';
import styles from '../../admin-dashboard.module.css';

export default function AccountAnalyticsPage() {
  const router = useRouter();
  const { id } = useParams();
  const searchParams = useSearchParams();
  const { isSuperAdmin, isLoading: isUserLoading } = useUser();

  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter state initialized from URL params
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
      const res = await fetch(`/api/admin/analytics/accounts/${id}?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch account analytics');
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
    // Update URL with filter params
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, val]) => {
      if (val) params.set(key, val);
    });
    router.replace(`/dashboard/admin/accounts/${id}?${params.toString()}`, { scroll: false });
    fetchData(filters);
  };

  const handleClearFilters = () => {
    const cleared = { from: '', to: '', minCost: '', maxCost: '', minTokens: '', maxTokens: '', minCredits: '', maxCredits: '' };
    setFilters(cleared);
    router.replace(`/dashboard/admin/accounts/${id}`, { scroll: false });
    fetchData(cleared);
  };

  const handleExportCSV = () => {
    if (!data?.usageData?.length) return;
    const headers = ['Date', 'User', 'Action Type', 'Model', 'Input Tokens', 'Output Tokens', 'Credits', 'Cost (USD)'];
    const rows = data.usageData.map(row => [
      new Date(row.date).toISOString().slice(0, 19).replace('T', ' '),
      row.userName,
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
    a.download = `account-${data.account?.slug || id}-usage.csv`;
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
          <button onClick={() => fetchData()} className={styles.retryButton}>Retry</button>
        </div>
      </div>
    );
  }

  const { account, profitability, usageData } = data;

  return (
    <div className={styles.page}>
      {/* Back link */}
      <Link href="/dashboard/admin" className={styles.backLink}>
        <ArrowLeft size={18} />
        Back to Admin Dashboard
      </Link>

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div>
            <h1 className={styles.title}>{account.name}</h1>
            <p className={styles.subtitle}>
              {account.planName} &middot; {account.subscriptionStatus} &middot; 
              Credits Balance: {account.creditsBalance.toLocaleString()} &middot;
              Total Used: {account.creditsUsedTotal.toLocaleString()}
            </p>
          </div>
        </div>
        <button className={styles.filterButton} onClick={handleExportCSV}>
          <Download size={16} style={{ marginRight: 4, verticalAlign: 'text-bottom' }} />
          Export CSV
        </button>
      </div>

      {/* Profitability Header */}
      <div className={styles.profitHeader}>
        <div className={styles.profitItem}>
          <span className={styles.profitLabel}>Plan Revenue</span>
          <span className={styles.profitValue}>${profitability.planRevenue.toFixed(2)}</span>
        </div>
        <div className={styles.profitItem}>
          <span className={styles.profitLabel}>Add-on Revenue</span>
          <span className={styles.profitValue}>${profitability.addOnRevenue.toFixed(2)}</span>
        </div>
        <div className={styles.profitItem}>
          <span className={styles.profitLabel}>Total Revenue</span>
          <span className={`${styles.profitValue} ${styles.profitPositive}`}>
            ${profitability.totalRevenue.toFixed(2)}
          </span>
        </div>
        <div className={styles.profitItem}>
          <span className={styles.profitLabel}>AI Cost</span>
          <span className={styles.profitValue}>${profitability.totalAICost.toFixed(4)}</span>
        </div>
        <div className={styles.profitItem}>
          <span className={styles.profitLabel}>Net Profit</span>
          <span className={`${styles.profitValue} ${profitability.netProfit >= 0 ? styles.profitPositive : styles.profitNegative}`}>
            ${profitability.netProfit.toFixed(2)}
          </span>
        </div>
        <div className={styles.profitItem}>
          <span className={styles.profitLabel}>Margin</span>
          <span className={`${styles.profitValue} ${profitability.margin >= 0 ? styles.profitPositive : styles.profitNegative}`}>
            {profitability.margin}%
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filtersBar}>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>Date Range</span>
          <div className={styles.filterRow}>
            <input
              type="date"
              className={styles.filterInput}
              value={filters.from}
              onChange={e => setFilters(f => ({ ...f, from: e.target.value }))}
            />
            <span className={styles.filterSeparator}>to</span>
            <input
              type="date"
              className={styles.filterInput}
              value={filters.to}
              onChange={e => setFilters(f => ({ ...f, to: e.target.value }))}
            />
          </div>
        </div>

        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>Cost ($)</span>
          <div className={styles.filterRow}>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Min"
              className={`${styles.filterInput} ${styles.filterInputSmall}`}
              value={filters.minCost}
              onChange={e => setFilters(f => ({ ...f, minCost: e.target.value }))}
            />
            <span className={styles.filterSeparator}>-</span>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Max"
              className={`${styles.filterInput} ${styles.filterInputSmall}`}
              value={filters.maxCost}
              onChange={e => setFilters(f => ({ ...f, maxCost: e.target.value }))}
            />
          </div>
        </div>

        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>Tokens</span>
          <div className={styles.filterRow}>
            <input
              type="number"
              min="0"
              placeholder="Min"
              className={`${styles.filterInput} ${styles.filterInputSmall}`}
              value={filters.minTokens}
              onChange={e => setFilters(f => ({ ...f, minTokens: e.target.value }))}
            />
            <span className={styles.filterSeparator}>-</span>
            <input
              type="number"
              min="0"
              placeholder="Max"
              className={`${styles.filterInput} ${styles.filterInputSmall}`}
              value={filters.maxTokens}
              onChange={e => setFilters(f => ({ ...f, maxTokens: e.target.value }))}
            />
          </div>
        </div>

        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>Credits</span>
          <div className={styles.filterRow}>
            <input
              type="number"
              min="0"
              placeholder="Min"
              className={`${styles.filterInput} ${styles.filterInputSmall}`}
              value={filters.minCredits}
              onChange={e => setFilters(f => ({ ...f, minCredits: e.target.value }))}
            />
            <span className={styles.filterSeparator}>-</span>
            <input
              type="number"
              min="0"
              placeholder="Max"
              className={`${styles.filterInput} ${styles.filterInputSmall}`}
              value={filters.maxCredits}
              onChange={e => setFilters(f => ({ ...f, maxCredits: e.target.value }))}
            />
          </div>
        </div>

        <button className={styles.filterButton} onClick={handleApplyFilters}>
          <Filter size={14} style={{ marginRight: 4, verticalAlign: 'text-bottom' }} />
          Apply
        </button>
        <button className={styles.clearButton} onClick={handleClearFilters}>
          Clear
        </button>
      </div>

      {/* Usage Data Table */}
      <div className={styles.tableCard}>
        <h2 className={styles.sectionTitle}>
          AI Usage Log ({usageData.length} {usageData.length === 1 ? 'entry' : 'entries'})
        </h2>
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead className={styles.tableHeader}>
              <tr>
                <th>Date</th>
                <th>User</th>
                <th>Action Type</th>
                <th>Model</th>
                <th>Input Tokens</th>
                <th>Output Tokens</th>
                <th>Credits</th>
                <th>Cost (USD)</th>
              </tr>
            </thead>
            <tbody className={styles.tableBody}>
              {usageData.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.date).toLocaleString()}</td>
                  <td>
                    {row.userId ? (
                      <Link
                        href={`/dashboard/admin/users/${row.userId}`}
                        style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}
                      >
                        {row.userName}
                      </Link>
                    ) : (
                      row.userName
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
                    No usage data found for the selected filters
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
