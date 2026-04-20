'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Cpu,
  Coins,
  AlertTriangle,
  BarChart3,
  Eye,
  Shield,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useLocale } from '@/app/context/locale-context';
import { useUser } from '@/app/context/user-context';
import styles from './admin-dashboard.module.css';

export default function SuperAdminDashboardPage() {
  const router = useRouter();
  const { t } = useLocale();
  const { isSuperAdmin, isLoading: isUserLoading } = useUser();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isUserLoading && !isSuperAdmin) {
      router.push('/dashboard');
    }
  }, [isSuperAdmin, isUserLoading, router]);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/admin/analytics');
      if (!res.ok) throw new Error('Failed to fetch analytics');
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) fetchData();
  }, [isSuperAdmin, fetchData]);

  if (isUserLoading || (!isSuperAdmin && !isLoading)) {
    return null;
  }

  if (isLoading) {
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
          <button onClick={fetchData} className={styles.retryButton}>Retry</button>
        </div>
      </div>
    );
  }

  const { financials, usage, topAccounts, dailyChart } = data;

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Shield className={styles.headerIcon} />
          <div>
            <h1 className={styles.title}>Super Admin Dashboard</h1>
            <p className={styles.subtitle}>Platform-wide AI cost analytics & profitability overview</p>
          </div>
        </div>
      </div>

      {/* Financial Widgets */}
      <div className={styles.widgetGrid}>
        <div className={styles.widget}>
          <div className={styles.widgetIcon} style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e' }}>
            <DollarSign size={24} />
          </div>
          <div className={styles.widgetBody}>
            <span className={styles.widgetLabel}>Monthly Recurring Revenue</span>
            <span className={styles.widgetValue}>${financials.totalMRR.toLocaleString()}</span>
          </div>
        </div>

        <div className={styles.widget}>
          <div className={styles.widgetIcon} style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
            <Cpu size={24} />
          </div>
          <div className={styles.widgetBody}>
            <span className={styles.widgetLabel}>AI Cost (30 days)</span>
            <span className={styles.widgetValue}>${financials.totalAICost.toLocaleString()}</span>
          </div>
        </div>

        <div className={styles.widget}>
          <div className={styles.widgetIcon} style={{
            background: financials.profitMargin >= 0 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            color: financials.profitMargin >= 0 ? '#22c55e' : '#ef4444',
          }}>
            {financials.profitMargin >= 0 ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
          </div>
          <div className={styles.widgetBody}>
            <span className={styles.widgetLabel}>Profit Margin</span>
            <span className={styles.widgetValue}>{financials.profitMargin}%</span>
          </div>
        </div>

        <div className={styles.widget}>
          <div className={styles.widgetIcon} style={{
            background: (financials.totalMRR - financials.totalAICost) >= 0 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            color: (financials.totalMRR - financials.totalAICost) >= 0 ? '#22c55e' : '#ef4444',
          }}>
            <DollarSign size={24} />
          </div>
          <div className={styles.widgetBody}>
            <span className={styles.widgetLabel}>Profit Margin ($)</span>
            <span className={styles.widgetValue}>${(financials.totalMRR - financials.totalAICost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className={styles.widgetMeta}>
              Revenue: ${financials.totalMRR.toLocaleString()} − Cost: ${financials.totalAICost.toLocaleString()}
            </span>
          </div>
        </div>

        <div className={styles.widget}>
          <div className={styles.widgetIcon} style={{ background: 'rgba(123, 44, 191, 0.1)', color: '#7b2cbf' }}>
            <Coins size={24} />
          </div>
          <div className={styles.widgetBody}>
            <span className={styles.widgetLabel}>AI Credits Consumed</span>
            <span className={styles.widgetValue}>{usage.totalCredits.toLocaleString()}</span>
          </div>
        </div>

        <div className={styles.widget}>
          <div className={styles.widgetIcon} style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
            <BarChart3 size={24} />
          </div>
          <div className={styles.widgetBody}>
            <span className={styles.widgetLabel}>Total Tokens (Input + Output)</span>
            <span className={styles.widgetValue}>{usage.totalTokens.toLocaleString()}</span>
            <span className={styles.widgetMeta}>
              In: {usage.totalInputTokens.toLocaleString()} | Out: {usage.totalOutputTokens.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className={styles.chartCard}>
        <h2 className={styles.sectionTitle}>AI Cost vs Revenue (Last 30 Days)</h2>
        <div className={styles.chartContainer}>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={dailyChart} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="date"
                tick={{ fill: 'var(--muted-foreground)', fontSize: '0.75rem' }}
                tickFormatter={(v) => v.slice(5)}
              />
              <YAxis
                tick={{ fill: 'var(--muted-foreground)', fontSize: '0.75rem' }}
                tickFormatter={(v) => `$${v.toFixed(2)}`}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--foreground)',
                }}
                formatter={(value) => `$${value.toFixed(4)}`}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="#22c55e"
                name="Revenue"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="cost"
                stroke="#ef4444"
                name="AI Cost"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Consumers Table */}
      <div className={styles.tableCard}>
        <h2 className={styles.sectionTitle}>Top 5 Accounts by AI Cost</h2>
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead className={styles.tableHeader}>
              <tr>
                <th>Account</th>
                <th>Plan</th>
                <th>Monthly Revenue</th>
                <th>AI Cost (30d)</th>
                <th>Credits Used</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody className={styles.tableBody}>
              {topAccounts.map((acc) => (
                <tr key={acc.id}>
                  <td>
                    <span className={styles.accountName}>{acc.name}</span>
                  </td>
                  <td>
                    <span className={styles.planBadge}>{acc.planName}</span>
                  </td>
                  <td>${acc.monthlyRevenue.toFixed(2)}</td>
                  <td>${acc.aiCost.toFixed(4)}</td>
                  <td>{acc.credits.toLocaleString()}</td>
                  <td>
                    {acc.costExceedsRevenue ? (
                      <span className={styles.dangerBadge}>
                        <AlertTriangle size={14} />
                        Cost &gt; Revenue
                      </span>
                    ) : (
                      <span className={styles.successBadge}>Profitable</span>
                    )}
                  </td>
                  <td>
                    <button
                      className={styles.viewButton}
                      onClick={() => router.push(`/dashboard/admin/accounts/${acc.id}`)}
                    >
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {topAccounts.length === 0 && (
                <tr>
                  <td colSpan={7} className={styles.emptyCell}>No AI usage data found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
