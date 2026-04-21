'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  LifeBuoy,
  Search,
  RefreshCw,
  Eye,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useUser } from '@/app/context/user-context';
import styles from './support.module.css';

const STATUS_OPTIONS = ['', 'OPEN', 'PENDING_ADMIN', 'PENDING_USER', 'RESOLVED', 'CLOSED'];
const PRIORITY_OPTIONS = ['', 'URGENT', 'HIGH', 'NORMAL', 'LOW'];
const CATEGORY_OPTIONS = ['', 'BILLING', 'TECHNICAL', 'BUG', 'FEATURE_REQUEST', 'GENERAL'];

function formatRelative(dateStr, locale) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString(locale === 'he' ? 'he-IL' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminSupportListPage() {
  const router = useRouter();
  const { t, locale } = useLocale();
  const { isSuperAdmin, isLoading: userLoading } = useUser();

  const [stats, setStats] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    status: '',
    priority: '',
    category: '',
    assignedToMe: false,
    q: '',
  });

  useEffect(() => {
    if (!userLoading && !isSuperAdmin) router.push('/dashboard');
  }, [userLoading, isSuperAdmin, router]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.priority) params.set('priority', filters.priority);
    if (filters.category) params.set('category', filters.category);
    if (filters.assignedToMe) params.set('assignedToMe', 'true');
    if (filters.q.trim()) params.set('q', filters.q.trim());
    params.set('limit', '50');
    return params.toString();
  }, [filters]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tRes, sRes] = await Promise.all([
        fetch(`/api/admin/support/tickets?${queryString}`),
        fetch('/api/admin/support/stats'),
      ]);
      if (!tRes.ok) throw new Error('tickets_failed');
      if (!sRes.ok) throw new Error('stats_failed');
      const tData = await tRes.json();
      const sData = await sRes.json();
      setTickets(tData.tickets || []);
      setStats(sData);
    } catch (err) {
      setError(t('support.admin.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [queryString, t]);

  useEffect(() => {
    if (isSuperAdmin) fetchAll();
  }, [isSuperAdmin, fetchAll]);

  if (userLoading || (!isSuperAdmin && !loading)) return null;

  return (
    <div className={styles.adminPage}>
      <div className={styles.adminHeader}>
        <h1 className={styles.adminTitle}>
          <LifeBuoy size={20} style={{ display: 'inline', marginInlineEnd: '0.5rem', verticalAlign: '-3px' }} />
          {t('support.admin.title')}
        </h1>
        <p className={styles.adminSubtitle}>{t('support.admin.subtitle')}</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{t('support.admin.stats.open')}</div>
            <div className={styles.statValue}>{stats.open}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{t('support.admin.stats.awaitingAdmin')}</div>
            <div className={styles.statValue}>{stats.awaitingAdmin}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{t('support.admin.stats.assignedToMe')}</div>
            <div className={styles.statValue}>{stats.assignedToMe}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{t('support.admin.stats.urgent')}</div>
            <div className={styles.statValue}>{stats.byPriority?.URGENT || 0}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{t('support.admin.stats.total')}</div>
            <div className={styles.statValue}>{stats.total}</div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className={styles.adminToolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.searchWrapper}>
            <Search className={styles.searchIcon} />
            <input
              type="text"
              className={styles.searchInput}
              placeholder={t('support.admin.searchPlaceholder')}
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            />
          </div>
          <select
            className={styles.filterSelect}
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s || 'any'} value={s}>
                {s ? t(`support.statuses.${s}`) : t('support.admin.filters.anyStatus')}
              </option>
            ))}
          </select>
          <select
            className={styles.filterSelect}
            value={filters.priority}
            onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))}
          >
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p || 'any'} value={p}>
                {p ? t(`support.priorities.${p}`) : t('support.admin.filters.anyPriority')}
              </option>
            ))}
          </select>
          <select
            className={styles.filterSelect}
            value={filters.category}
            onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c || 'any'} value={c}>
                {c ? t(`support.categories.${c}`) : t('support.admin.filters.anyCategory')}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={`${styles.filterButton} ${filters.assignedToMe ? styles.filterButtonActive : ''}`}
            onClick={() => setFilters((f) => ({ ...f, assignedToMe: !f.assignedToMe }))}
          >
            {t('support.admin.filters.assignedToMe')}
          </button>
        </div>
        <div className={styles.toolbarRight}>
          <button type="button" className={styles.refreshButton} onClick={fetchAll} disabled={loading}>
            <RefreshCw size={14} className={loading ? styles.spinner : undefined} />
            {t('support.admin.refresh')}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 8, marginBottom: '1rem' }}>
          <AlertTriangle size={14} style={{ display: 'inline', marginInlineEnd: 6, verticalAlign: '-2px' }} />
          {error}
        </div>
      )}

      {/* Table */}
      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead className={styles.tableHeader}>
            <tr>
              <th>{t('support.admin.columns.subject')}</th>
              <th>{t('support.admin.columns.account')}</th>
              <th>{t('support.admin.columns.status')}</th>
              <th>{t('support.admin.columns.priority')}</th>
              <th>{t('support.admin.columns.category')}</th>
              <th>{t('support.admin.columns.assigned')}</th>
              <th>{t('support.admin.columns.lastActivity')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody className={styles.tableBody}>
            {loading && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>
                  <Loader2 size={20} className={styles.spinner} />
                </td>
              </tr>
            )}
            {!loading && tickets.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted-foreground)' }}>
                  {t('support.admin.empty')}
                </td>
              </tr>
            )}
            {!loading && tickets.map((ticket) => {
              const assigneeName = ticket.assignedAdmin
                ? [ticket.assignedAdmin.firstName, ticket.assignedAdmin.lastName].filter(Boolean).join(' ') || ticket.assignedAdmin.email
                : t('support.admin.unassigned');
              return (
                <tr key={ticket.id} onClick={() => router.push(`/admin/support/${ticket.id}`)} style={{ cursor: 'pointer' }}>
                  <td>
                    <div className={styles.subjectCell}>
                      <span className={styles.subjectLine}>{ticket.subject}</span>
                      <span className={styles.ticketNumber}>#{ticket.ticketNumber}</span>
                    </div>
                  </td>
                  <td>
                    <div className={styles.cellMuted}>{ticket.account?.name || '-'}</div>
                  </td>
                  <td>
                    <span className={`${styles.statusChip} ${styles[`status_${ticket.status}`] || ''}`}>
                      {t(`support.statuses.${ticket.status}`)}
                    </span>
                  </td>
                  <td>
                    <span className={`${styles.priorityChip} ${styles[`priority_${ticket.priority}`] || ''}`}>
                      {t(`support.priorities.${ticket.priority}`)}
                    </span>
                  </td>
                  <td><span className={styles.cellMuted}>{t(`support.categories.${ticket.category}`)}</span></td>
                  <td><span className={styles.cellMuted}>{assigneeName}</span></td>
                  <td><span className={styles.cellMuted}>{formatRelative(ticket.lastMessageAt, locale)}</span></td>
                  <td>
                    <button
                      type="button"
                      className={styles.viewButton}
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/admin/support/${ticket.id}`);
                      }}
                    >
                      <Eye size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
