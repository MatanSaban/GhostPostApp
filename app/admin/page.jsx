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

const SECTION_KEYS = ['fin', 'plat', 'health', 'chart', 'accounts', 'signups', 'failed', 'tickets'];
const PRESETS = ['today', 'yesterday', 'thisWeek', 'thisMonth', 'last3Months', 'last6Months', 'lastYear', 'yearToDate', 'custom'];
const DEFAULT_PRESET = 'thisMonth';

const fmtDate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

function presetToRange(preset) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case 'today':
      return { from: fmtDate(today), to: fmtDate(today) };
    case 'yesterday': {
      const y = new Date(today); y.setDate(y.getDate() - 1);
      return { from: fmtDate(y), to: fmtDate(y) };
    }
    case 'thisWeek': {
      // Monday-start week
      const d = new Date(today);
      const dow = d.getDay(); // 0=Sun..6=Sat
      const diff = dow === 0 ? -6 : 1 - dow;
      d.setDate(d.getDate() + diff);
      return { from: fmtDate(d), to: fmtDate(today) };
    }
    case 'thisMonth': {
      const d = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: fmtDate(d), to: fmtDate(today) };
    }
    case 'last3Months': {
      const d = new Date(today); d.setMonth(d.getMonth() - 3);
      return { from: fmtDate(d), to: fmtDate(today) };
    }
    case 'last6Months': {
      const d = new Date(today); d.setMonth(d.getMonth() - 6);
      return { from: fmtDate(d), to: fmtDate(today) };
    }
    case 'lastYear': {
      const d = new Date(today); d.setFullYear(d.getFullYear() - 1);
      return { from: fmtDate(d), to: fmtDate(today) };
    }
    case 'yearToDate': {
      const d = new Date(today.getFullYear(), 0, 1);
      return { from: fmtDate(d), to: fmtDate(today) };
    }
    default:
      return null;
  }
}

function makeDefaultRanges() {
  const r = presetToRange(DEFAULT_PRESET);
  return SECTION_KEYS.reduce((acc, k) => {
    acc[k] = { preset: DEFAULT_PRESET, from: r.from, to: r.to };
    return acc;
  }, {});
}

export default function SuperAdminDashboardPage() {
  const router = useRouter();
  const { t } = useLocale();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [ranges, setRanges] = useState(makeDefaultRanges);

  const fetchData = useCallback(async (currentRanges) => {
    try {
      setIsLoading(true);
      setError(null);
      const params = new URLSearchParams();
      for (const key of SECTION_KEYS) {
        const r = currentRanges[key];
        if (r?.from) params.set(`${key}From`, r.from);
        if (r?.to) params.set(`${key}To`, r.to);
      }
      const qs = params.toString();
      const res = await fetch(`/api/admin/analytics${qs ? `?${qs}` : ''}`);
      if (!res.ok) throw new Error('Failed to fetch analytics');
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(ranges); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const updateSection = useCallback((sectionKey, next) => {
    setRanges(prev => {
      const updated = { ...prev, [sectionKey]: next };
      // Only refetch when there are concrete dates (custom mode without both dates: skip).
      if (next.from && next.to) fetchData(updated);
      return updated;
    });
  }, [fetchData]);

  const healthWarn = useMemo(() => {
    if (!data) return false;
    const h = data.health;
    return h.contentFailed > 0 || h.supportTicketsOpen > 0 || h.paymentsFailed > 0 || h.backgroundJobsFailed > 0;
  }, [data]);

  if (isLoading && !data) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingState}><div className={styles.spinner}></div></div>
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className={styles.page}>
        <div className={styles.errorState}>
          <AlertTriangle size={48} />
          <p>{error}</p>
          <button onClick={() => fetchData(ranges)} className={styles.retryButton}>{t('admin.dashboard.retry')}</button>
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
        <button onClick={() => fetchData(ranges)} className={styles.retryButton} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
          <RefreshCw size={14} /> {t('admin.dashboard.refresh')}
        </button>
      </div>

      {/* ===== FINANCIAL ===== */}
      <SectionHeader
        title={t('admin.dashboard.groups.financial')}
        sectionKey="fin"
        ranges={ranges}
        onChange={updateSection}
        t={t}
      />
      <div className={styles.widgetGrid}>
        <Widget icon={<DollarSign size={24} />} color="#22c55e" label={t('admin.dashboard.widgets.mrr')} value={formatUSD(financials.totalMRR)} meta={`${t('admin.dashboard.widgets.arr')} ${formatUSD(financials.totalARR, 0)}`} />
        <Widget icon={<Cpu size={24} />} color="#ef4444" label={t('admin.dashboard.widgets.aiCost')} value={formatUSD(financials.totalAICost)} />
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
      <SectionHeader
        title={t('admin.dashboard.groups.platform')}
        sectionKey="plat"
        ranges={ranges}
        onChange={updateSection}
        t={t}
      />
      <div className={styles.widgetGrid}>
        <Widget icon={<Building2 size={24} />} color="#7b2cbf" label={t('admin.dashboard.widgets.totalAccounts')} value={formatNumber(platform.totalAccounts)} meta={`+${platform.newAccounts} ${t('admin.dashboard.widgets.inRange')}`} />
        <Widget icon={<Users size={24} />} color="#3b82f6" label={t('admin.dashboard.widgets.totalUsers')} value={formatNumber(platform.totalUsers)} meta={`+${platform.newUsers} ${t('admin.dashboard.widgets.inRange')}`} />
        <Widget icon={<CreditCard size={24} />} color="#22c55e" label={t('admin.dashboard.widgets.activeSubs')} value={formatNumber(platform.activeSubscriptions)} />
        <Widget icon={<Globe size={24} />} color="#0ea5e9" label={t('admin.dashboard.widgets.totalSites')} value={formatNumber(platform.totalSites)} />
        <Widget icon={<FileText size={24} />} color="#7b2cbf" label={t('admin.dashboard.widgets.published')} value={formatNumber(platform.contentPublished)} meta={`${platform.contentPublishedToday} ${t('admin.dashboard.widgets.today')}`} />
        <Widget icon={<Activity size={24} />} color="#f59e0b" label={t('admin.dashboard.widgets.activeImpersonations')} value={formatNumber(health.activeImpersonations)} />
      </div>

      {/* ===== SYSTEM HEALTH ===== */}
      <SectionHeader
        title={t('admin.dashboard.groups.health')}
        sectionKey="health"
        ranges={ranges}
        onChange={updateSection}
        t={t}
        rightOfTitle={healthWarn ? <AlertTriangle size={18} style={{ color: '#f59e0b' }} /> : null}
      />
      <div className={styles.widgetGrid}>
        <HealthWidget icon={<XCircle size={24} />} bad={health.contentFailed > 0} label={t('admin.dashboard.widgets.contentFailed')} value={formatNumber(health.contentFailed)} />
        <HealthWidget icon={<LifeBuoy size={24} />} bad={health.supportTicketsOpen > 0} label={t('admin.dashboard.widgets.supportOpen')} value={formatNumber(health.supportTicketsOpen)} />
        <HealthWidget icon={<CreditCard size={24} />} bad={health.paymentsFailed > 0} label={t('admin.dashboard.widgets.paymentsFailed')} value={formatNumber(health.paymentsFailed)} />
        <HealthWidget icon={<Activity size={24} />} bad={health.backgroundJobsFailed > 0} label={t('admin.dashboard.widgets.jobsFailed')} value={formatNumber(health.backgroundJobsFailed)} />
      </div>

      {/* ===== CHART: Revenue vs Cost (drives all 3 daily charts) ===== */}
      <div className={styles.chartCard}>
        <div className={styles.sectionHeader} style={{ marginBottom: '0.5rem' }}>
          <div className={styles.sectionHeaderLeft}>
            <h2 className={styles.sectionTitle} style={{ margin: 0 }}>{t('admin.dashboard.chart.title')}</h2>
          </div>
          <DateRangeSelect value={ranges.chart} onChange={(v) => updateSection('chart', v)} t={t} />
        </div>
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

      {/* ===== CHART: Signups + Published (driven by chart filter above) ===== */}
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

      {/* ===== Cost > Revenue alerts (uses accounts filter) ===== */}
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
                  <th>{t('admin.dashboard.topAccounts.columns.aiCost')}</th>
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

      {/* ===== Top accounts (drives the accounts filter shared with cost-over-revenue) ===== */}
      <div className={styles.tableCard}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionHeaderLeft}>
            <h2 className={styles.sectionTitle} style={{ margin: 0 }}>{t('admin.dashboard.topAccounts.title')}</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <DateRangeSelect value={ranges.accounts} onChange={(v) => updateSection('accounts', v)} t={t} />
            <Link href="/admin/accounts" className={styles.backLink} style={{ margin: 0 }}>
              {t('admin.dashboard.viewAll')} <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead className={styles.tableHeader}>
              <tr>
                <th>{t('admin.dashboard.topAccounts.columns.account')}</th>
                <th>{t('admin.dashboard.topAccounts.columns.plan')}</th>
                <th>{t('admin.dashboard.topAccounts.columns.monthlyRevenue')}</th>
                <th>{t('admin.dashboard.topAccounts.columns.aiCost')}</th>
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
          <div className={styles.sectionHeader}>
            <div className={styles.sectionHeaderLeft}>
              <UserPlus size={18} />
              <h2 className={styles.sectionTitle} style={{ margin: 0 }}>{t('admin.dashboard.recentSignups.title')}</h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <DateRangeSelect value={ranges.signups} onChange={(v) => updateSection('signups', v)} t={t} />
              <Link href="/admin/users" className={styles.backLink} style={{ margin: 0 }}>
                {t('admin.dashboard.viewAll')} <ArrowUpRight size={14} />
              </Link>
            </div>
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
          <div className={styles.sectionHeader}>
            <div className={styles.sectionHeaderLeft}>
              <XCircle size={18} style={{ color: '#ef4444' }} />
              <h2 className={styles.sectionTitle} style={{ margin: 0 }}>{t('admin.dashboard.failedPublishes.title')}</h2>
            </div>
            <DateRangeSelect value={ranges.failed} onChange={(v) => updateSection('failed', v)} t={t} />
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
        <div className={styles.sectionHeader}>
          <div className={styles.sectionHeaderLeft}>
            <LifeBuoy size={18} />
            <h2 className={styles.sectionTitle} style={{ margin: 0 }}>{t('admin.dashboard.openTickets.title')}</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <DateRangeSelect value={ranges.tickets} onChange={(v) => updateSection('tickets', v)} t={t} />
            <Link href="/admin/support" className={styles.backLink} style={{ margin: 0 }}>
              {t('admin.dashboard.viewAll')} <ArrowUpRight size={14} />
            </Link>
          </div>
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

function SectionHeader({ title, sectionKey, ranges, onChange, t, rightOfTitle }) {
  return (
    <div className={styles.sectionHeader}>
      <div className={styles.sectionHeaderLeft}>
        <h2 className={styles.sectionTitle} style={{ margin: 0 }}>{title}</h2>
        {rightOfTitle}
      </div>
      <DateRangeSelect value={ranges[sectionKey]} onChange={(v) => onChange(sectionKey, v)} t={t} />
    </div>
  );
}

function DateRangeSelect({ value, onChange, t }) {
  const today = useMemo(() => fmtDate(new Date()), []);
  const handlePresetChange = (e) => {
    const preset = e.target.value;
    if (preset === 'custom') {
      onChange({ ...value, preset });
      return;
    }
    const r = presetToRange(preset);
    onChange({ preset, from: r.from, to: r.to });
  };

  return (
    <div className={styles.dateRangeSelect}>
      <select
        className={styles.dateRangePreset}
        value={value.preset}
        onChange={handlePresetChange}
        aria-label={t('admin.dashboard.filter.dateRange')}
      >
        {PRESETS.map(p => (
          <option key={p} value={p}>{t(`admin.dashboard.filter.presets.${p}`)}</option>
        ))}
      </select>
      {value.preset === 'custom' && (
        <>
          <input
            type="date"
            className={styles.dateRangeDate}
            value={value.from}
            max={value.to || today}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
            aria-label={t('common.from')}
          />
          <span className={styles.dateRangeSep}>–</span>
          <input
            type="date"
            className={styles.dateRangeDate}
            value={value.to}
            min={value.from}
            max={today}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
            aria-label={t('common.to')}
          />
        </>
      )}
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
