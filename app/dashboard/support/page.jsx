'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { LifeBuoy, Plus, Loader2, AlertCircle, Key } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from './page.module.css';

const FILTERS = [
  { key: 'all',            statusParam: null,             labelKey: 'support.filters.all' },
  { key: 'pendingAdmin',   statusParam: 'PENDING_ADMIN',  labelKey: 'support.filters.pendingAdmin' },
  { key: 'pendingUser',    statusParam: 'PENDING_USER',   labelKey: 'support.filters.pendingUser' },
  { key: 'resolved',       statusParam: 'RESOLVED',       labelKey: 'support.filters.resolved' },
  { key: 'closed',         statusParam: 'CLOSED',         labelKey: 'support.filters.closed' },
];

function formatDate(dateStr, locale) {
  return new Date(dateStr).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SupportPage() {
  const { t, locale } = useLocale();
  const [activeFilter, setActiveFilter] = useState('all');
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const activeStatusParam = useMemo(
    () => FILTERS.find((f) => f.key === activeFilter)?.statusParam ?? null,
    [activeFilter],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const url = new URL('/api/support/tickets', window.location.origin);
        if (activeStatusParam) url.searchParams.set('status', activeStatusParam);
        const res = await fetch(url.toString());
        if (!res.ok) throw new Error('load_failed');
        const data = await res.json();
        if (!cancelled) setTickets(data.tickets || []);
      } catch (err) {
        if (!cancelled) setError(t('support.loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [activeStatusParam, t]);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>
            <LifeBuoy />
          </div>
          <div>
            <h1 className={styles.pageTitle}>{t('support.title')}</h1>
            <p className={styles.pageSubtitle}>{t('support.subtitle')}</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <Link href="/dashboard/support/access" className={styles.secondaryAction}>
            <Key size={16} />
            {t('support.accessCodes')}
          </Link>
          <Link href="/dashboard/support/new" className={styles.primaryAction}>
            <Plus size={16} />
            {t('support.newTicket')}
          </Link>
        </div>
      </div>

      <div className={styles.filterBar}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setActiveFilter(f.key)}
            className={`${styles.filterChip} ${activeFilter === f.key ? styles.filterChipActive : ''}`}
          >
            {t(f.labelKey)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={styles.stateBox}>
          <Loader2 className={styles.spinner} />
          <span>{t('support.loading')}</span>
        </div>
      ) : error ? (
        <div className={styles.stateBox}>
          <AlertCircle />
          <span>{error}</span>
        </div>
      ) : tickets.length === 0 ? (
        <div className={styles.emptyState}>
          <LifeBuoy className={styles.emptyIcon} />
          <h2>{t('support.noTickets')}</h2>
          <p>{t('support.noTicketsHint')}</p>
          <Link href="/dashboard/support/new" className={styles.primaryAction}>
            <Plus size={16} />
            {t('support.newTicket')}
          </Link>
        </div>
      ) : (
        <ul className={styles.ticketList}>
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <Link href={`/dashboard/support/${ticket.id}`} className={styles.ticketRow}>
                <div className={styles.ticketRowMain}>
                  <div className={styles.ticketRowHeader}>
                    <span className={styles.ticketNumber}>
                      {t('support.ticketNumber', { number: ticket.ticketNumber })}
                    </span>
                    <span className={`${styles.statusBadge} ${styles[`status_${ticket.status}`] || ''}`}>
                      {t(`support.statuses.${ticket.status}`)}
                    </span>
                  </div>
                  <div className={styles.ticketSubject}>{ticket.subject}</div>
                  <div className={styles.ticketMeta}>
                    <span>{t(`support.categories.${ticket.category}`)}</span>
                    <span>·</span>
                    <span>{formatDate(ticket.lastMessageAt, locale)}</span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
