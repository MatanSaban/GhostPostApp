'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DollarSign, TrendingUp, TrendingDown, Cpu, AlertTriangle, BarChart3, Eye, Shield, Users, Building2, Globe, FileText, CreditCard, LifeBuoy, Activity, UserPlus, XCircle, RefreshCw, ArrowUpRight } from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useLocale } from '@/app/context/locale-context';
import styles from './admin-dashboard.module.css';
import GCoinIcon from '@/app/components/ui/GCoinIcon';

function formatNumber(n) {
  return (n ?? 0).toLocaleString();
}
function formatUSD(n, digits = 2) {
  return `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}
function relTime(iso, t) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return t('time.justNow');
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function SuperAdminDashboardPage() {
  const router = useRouter();
  const { t } = useLocale();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
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

  useEffect(() => { fetchData(); }, [fetchData]);

  const healthWarn = useMemo(() => {
    if (!data) return false;
    const h = data.health;
    return h.contentFailed7d > 0 || h.supportTicketsOpen > 0 || h.paymentsFailed30d > 0 || h.backgroundJobsFailed24h > 0;
  }, [data]);

  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingState}><div className={styles.spinner}></div></div>
      </div>
    );
  }
  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.errorState}>
          <AlertTriangle size={48} />
          <p>{error}</p>
          <button onClick={fetchData} className={styles.retryButton}>{t('admin.dashboard.retry')}</button>
        </div>
      </div>
    );
  }
  if (!data) return null;

  const { financials, usage, platform, health, topAccounts, costExceedsRevenueAccounts, recentSignups, recentFailedPublishes, openSupportTickets, dailyChart } = data;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Shield className={styles.headerIcon} />
          <div>
            <h1 className={styles.title}>{t('admin.dashboard.title')}</h1>
            <p className={styles.subtitle}>{t('admin.dashboard.subtitle')}</p>
          </div>
        </div>
        <button onClick={fetchData} className={styles.retryButton} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
          <RefreshCw size={14} /> {t('admin.dashboard.refresh')}
        </button>
      </div>

      {/* ===== FINANCIAL ===== */}
      <h2 className={styles.sectionTitle} style={{ marginBottom: '0.75rem' }}>{t('admin.dashboard.groups.financial')}</h2>
      <div className={styles.widgetGrid}>
        <Widget icon={<DollarSign size={24} />} color="#22c55e" label={t('admin.dashboard.widgets.mrr')} value={formatUSD(financials.totalMRR)} meta={`${t('admin.dashboard.widgets.arr')} ${formatUSD(financials.totalARR, 0)}`} />
        <Widget icon={<Cpu size={24} />} color="#ef4444" label={t('admin.dashboard.widgets.aiCost30d')} value={formatUSD(financials.totalAICost)} />
        <Widget
          icon={financials.netProfit >= 0 ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
          color={financials.netProfit >= 0 ? '#22c55e' : '#ef4444'}
          label={t('admin.dashboard.widgets.netProfit')}
          value={formatUSD(financials.netProfit)}
          meta={`${financials.profitMargin}% ${t('admin.dashboard.widgets.margin')}`}
        />
        <Widget icon={<BarChart3 size={24} />} color="#3b82f6" label={t('admin.dashboard.widgets.avgRevPerAccount')} value={formatUSD(financials.avgRevenuePerAccount)} />
        <Widget icon={<GCoinIcon size={24} />} color="#7b2cbf" label={t('admin.dashboard.widgets.creditsConsumed')} value={formatNumber(usage.totalCredits)} />
        <Widget icon={<BarChart3 size={24} />} color="#0ea5e9" label={t('admin.dashboard.widgets.totalTokens')} value={formatNumber(usage.totalTokens)} meta={t('admin.dashboard.widgets.inOut', { input: formatNumber(usage.totalInputTokens), output: formatNumber(usage.totalOutputTokens) })} />
      </div>

      {/* ===== PLATFORM ===== */}
      <h2 className={styles.sectionTitle} style={{ marginBottom: '0.75rem' }}>{t('admin.dashboard.groups.platform')}</h2>
      <div className={styles.widgetGrid}>
        <Widget icon={<Building2 size={24} />} color="#7b2cbf" label={t('admin.dashboard.widgets.totalAccounts')} value={formatNumber(platform.totalAccounts)} meta={`+${platform.newAccounts30d} ${t('admin.dashboard.widgets.last30d')}`} />
        <Widget icon={<Users size={24} />} color="#3b82f6" label={t('admin.dashboard.widgets.totalUsers')} value={formatNumber(platform.totalUsers)} meta={`+${platform.newUsers30d} ${t('admin.dashboard.widgets.last30d')}`} />
        <Widget icon={<CreditCard size={24} />} color="#22c55e" label={t('admin.dashboard.widgets.activeSubs')} value={formatNumber(platform.activeSubscriptions)} />
        <Widget icon={<Globe size={24} />} color="#0ea5e9" label={t('admin.dashboard.widgets.totalSites')} value={formatNumber(platform.totalSites)} />
        <Widget icon={<FileText size={24} />} color="#7b2cbf" label={t('admin.dashboard.widgets.publishedLast30d')} value={formatNumber(platform.contentPublished30d)} meta={`${platform.contentPublishedToday} ${t('admin.dashboard.widgets.today')}`} />
        <Widget icon={<Activity size={24} />} color="#f59e0b" label={t('admin.dashboard.widgets.activeImpersonations')} value={formatNumber(health.activeImpersonations)} />
      </div>

      {/* ===== SYSTEM HEALTH ===== */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <h2 className={styles.sectionTitle} style={{ margin: 0 }}>{t('admin.dashboard.groups.health')}</h2>
        {healthWarn && <AlertTriangle size={18} style={{ color: '#f59e0b' }} />}
      </div>
      <div className={styles.widgetGrid}>
        <HealthWidget icon={<XCircle size={24} />} bad={health.contentFailed7d > 0} label={t('admin.dashboard.widgets.contentFailed7d')} value={formatNumber(health.contentFailed7d)} />
        <HealthWidget icon={<LifeBuoy size={24} />} bad={health.supportTicketsOpen > 0} label={t('admin.dashboard.widgets.supportOpen')} value={formatNumber(health.supportTicketsOpen)} />
        <HealthWidget icon={<CreditCard size={24} />} bad={health.paymentsFailed30d > 0} label={t('admin.dashboard.widgets.paymentsFailed30d')} value={formatNumber(health.paymentsFailed30d)} />
        <HealthWidget icon={<Activity size={24} />} bad={health.backgroundJobsFailed24h > 0} label={t('admin.dashboard.widgets.jobsFailed24h')} value={formatNumber(health.backgroundJobsFailed24h)} />
      </div>

      {/* ===== CHART: Revenue vs Cost ===== */}
      <div className={styles.chartCard}>
        <h2 className={styles.sectionTitle}>{t('admin.dashboard.chart.title')}</h2>
        <div className={styles.chartContainer}>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dailyChart} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fill: 'var(--muted-foreground)', fontSize: '0.75rem' }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: '0.75rem' }} tickFormatter={(v) => `$${v.toFixed(2)}`} />
              <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--foreground)' }} formatter={(v) => `$${v.toFixed(4)}`} />
              <Legend />
              <Line type="monotone" dataKey="revenue" stroke="#22c55e" name={t('admin.dashboard.chart.revenue')} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="cost" stroke="#ef4444" name={t('admin.dashboard.chart.aiCost')} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ===== CHART: Signups + Published ===== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div className={styles.chartCard} style={{ marginBottom: 0 }}>
          <h2 className={styles.sectionTitle}>{t('admin.dashboard.chart.signups')}</h2>
          <div className={styles.chartContainer}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dailyChart} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fill: 'var(--muted-foreground)', fontSize: '0.7rem' }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: '0.7rem' }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--foreground)' }} />
                <Bar dataKey="signups" fill="#3b82f6" name={t('admin.dashboard.chart.signupsLabel')} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className={styles.chartCard} style={{ marginBottom: 0 }}>
          <h2 className={styles.sectionTitle}>{t('admin.dashboard.chart.published')}</h2>
          <div className={styles.chartContainer}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dailyChart} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fill: 'var(--muted-foreground)', fontSize: '0.7rem' }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: '0.7rem' }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--foreground)' }} />
                <Bar dataKey="published" fill="#7b2cbf" name={t('admin.dashboard.chart.publishedLabel')} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ===== Cost > Revenue alerts ===== */}
      {costExceedsRevenueAccounts.length > 0 && (
        <div className={styles.tableCard} style={{ borderColor: 'rgba(239, 68, 68, 0.4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertTriangle size={18} style={{ color: '#ef4444' }} />
            <h2 className={styles.sectionTitle} style={{ margin: 0 }}>{t('admin.dashboard.costOverRevenue.title')}</h2>
          </div>
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead className={styles.tableHeader}>
                <tr>
                  <th>{t('admin.dashboard.topAccounts.columns.account')}</th>
                  <th>{t('admin.dashboard.topAccounts.columns.plan')}</th>
                  <th>{t('admin.dashboard.topAccounts.columns.monthlyRevenue')}</th>
                  <th>{t('admin.dashboard.topAccounts.columns.aiCost30d')}</th>
                  <th>{t('admin.dashboard.costOverRevenue.delta')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody className={styles.tableBody}>
                {costExceedsRevenueAccounts.map((acc) => (
                  <tr key={acc.id}>
                    <td><span className={styles.accountName}>{acc.name}</span></td>
                    <td><span className={styles.planBadge}>{acc.planName}</span></td>
                    <td>${acc.monthlyRevenue.toFixed(2)}</td>
                    <td>${acc.aiCost.toFixed(4)}</td>
                    <td style={{ color: '#ef4444', fontWeight: 600 }}>-${(acc.aiCost - acc.monthlyRevenue).toFixed(2)}</td>
                    <td>
                      <button className={styles.viewButton} onClick={() => router.push(`/admin/accounts/${acc.id}`)}>
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== Top accounts ===== */}
      <div className={styles.tableCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className={styles.sectionTitle}>{t('admin.dashboard.topAccounts.title')}</h2>
          <Link href="/admin/accounts" className={styles.backLink} style={{ margin: 0 }}>
            {t('admin.dashboard.viewAll')} <ArrowUpRight size={14} />
          </Link>
        </div>
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead className={styles.tableHeader}>
              <tr>
                <th>{t('admin.dashboard.topAccounts.columns.account')}</th>
                <th>{t('admin.dashboard.topAccounts.columns.plan')}</th>
                <th>{t('admin.dashboard.topAccounts.columns.monthlyRevenue')}</th>
                <th>{t('admin.dashboard.topAccounts.columns.aiCost30d')}</th>
                <th>{t('admin.dashboard.topAccounts.columns.creditsUsed')}</th>
                <th>{t('admin.dashboard.topAccounts.columns.status')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody className={styles.tableBody}>
              {topAccounts.map((acc) => (
                <tr key={acc.id}>
                  <td><span className={styles.accountName}>{acc.name}</span></td>
                  <td><span className={styles.planBadge}>{acc.planName}</span></td>
                  <td>${acc.monthlyRevenue.toFixed(2)}</td>
                  <td>${acc.aiCost.toFixed(4)}</td>
                  <td>{acc.credits.toLocaleString()}</td>
                  <td>
                    {acc.costExceedsRevenue
                      ? <span className={styles.dangerBadge}><AlertTriangle size={14} />{t('admin.dashboard.topAccounts.costOverRevenue')}</span>
                      : <span className={styles.successBadge}>{t('admin.dashboard.topAccounts.profitable')}</span>}
                  </td>
                  <td>
                    <button className={styles.viewButton} onClick={() => router.push(`/admin/accounts/${acc.id}`)}>
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {topAccounts.length === 0 && (
                <tr><td colSpan={7} className={styles.emptyCell}>{t('admin.dashboard.topAccounts.empty')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== Two-col: Signups + Failed publishes ===== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div className={styles.tableCard} style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <UserPlus size={18} />
              <h2 className={styles.sectionTitle} style={{ margin: 0 }}>{t('admin.dashboard.recentSignups.title')}</h2>
            </div>
            <Link href="/admin/users" className={styles.backLink} style={{ margin: 0 }}>
              {t('admin.dashboard.viewAll')} <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <tbody className={styles.tableBody}>
                {recentSignups.map((u) => (
                  <tr key={u.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/admin/users/${u.id}`)}>
                    <td><span className={styles.accountName}>{u.name}</span><div style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)' }}>{u.email}</div></td>
                    <td style={{ textAlign: 'end', color: 'var(--muted-foreground)' }}>{relTime(u.createdAt, t)}</td>
                  </tr>
                ))}
                {recentSignups.length === 0 && (
                  <tr><td colSpan={2} className={styles.emptyCell}>{t('admin.dashboard.recentSignups.empty')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className={styles.tableCard} style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <XCircle size={18} style={{ color: '#ef4444' }} />
            <h2 className={styles.sectionTitle} style={{ margin: 0 }}>{t('admin.dashboard.failedPublishes.title')}</h2>
          </div>
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <tbody className={styles.tableBody}>
                {recentFailedPublishes.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <span className={styles.accountName}>{c.title}</span>
                      <div style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)' }}>{c.accountName} · {c.siteDomain}</div>
                      {c.errorMessage && <div style={{ fontSize: '0.7rem', color: '#ef4444', marginTop: 2 }}>{c.errorMessage}</div>}
                    </td>
                    <td style={{ textAlign: 'end', color: 'var(--muted-foreground)' }}>{relTime(c.updatedAt, t)}</td>
                  </tr>
                ))}
                {recentFailedPublishes.length === 0 && (
                  <tr><td colSpan={2} className={styles.emptyCell}>{t('admin.dashboard.failedPublishes.empty')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ===== Open support tickets ===== */}
      <div className={styles.tableCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <LifeBuoy size={18} />
            <h2 className={styles.sectionTitle} style={{ margin: 0 }}>{t('admin.dashboard.openTickets.title')}</h2>
          </div>
          <Link href="/admin/support" className={styles.backLink} style={{ margin: 0 }}>
            {t('admin.dashboard.viewAll')} <ArrowUpRight size={14} />
          </Link>
        </div>
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead className={styles.tableHeader}>
              <tr>
                <th>#</th>
                <th>{t('admin.dashboard.openTickets.subject')}</th>
                <th>{t('admin.dashboard.openTickets.account')}</th>
                <th>{t('admin.dashboard.openTickets.priority')}</th>
                <th>{t('admin.dashboard.openTickets.status')}</th>
                <th>{t('admin.dashboard.openTickets.lastMessage')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody className={styles.tableBody}>
              {openSupportTickets.map((tk) => (
                <tr key={tk.id}>
                  <td>#{tk.ticketNumber}</td>
                  <td><span className={styles.accountName}>{tk.subject}</span><div style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)' }}>{tk.createdByName}</div></td>
                  <td>{tk.accountName}</td>
                  <td><span className={styles.planBadge}>{tk.priority}</span></td>
                  <td><span className={tk.status === 'OPEN' ? styles.dangerBadge : styles.planBadge}>{tk.status}</span></td>
                  <td style={{ color: 'var(--muted-foreground)' }}>{relTime(tk.lastMessageAt, t)}</td>
                  <td>
                    <button className={styles.viewButton} onClick={() => router.push(`/admin/support/${tk.id}`)}>
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {openSupportTickets.length === 0 && (
                <tr><td colSpan={7} className={styles.emptyCell}>{t('admin.dashboard.openTickets.empty')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Widget({ icon, color, label, value, meta }) {
  return (
    <div className={styles.widget}>
      <div className={styles.widgetIcon} style={{ background: `${color}1a`, color }}>{icon}</div>
      <div className={styles.widgetBody}>
        <span className={styles.widgetLabel}>{label}</span>
        <span className={styles.widgetValue}>{value}</span>
        {meta && <span className={styles.widgetMeta}>{meta}</span>}
      </div>
    </div>
  );
}

function HealthWidget({ icon, bad, label, value }) {
  const color = bad ? '#ef4444' : '#22c55e';
  return (
    <div className={styles.widget} style={bad ? { borderColor: 'rgba(239, 68, 68, 0.3)' } : undefined}>
      <div className={styles.widgetIcon} style={{ background: `${color}1a`, color }}>{icon}</div>
      <div className={styles.widgetBody}>
        <span className={styles.widgetLabel}>{label}</span>
        <span className={styles.widgetValue} style={{ color: bad ? '#ef4444' : undefined }}>{value}</span>
      </div>
    </div>
  );
}
