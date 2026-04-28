'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Eye,
  ChevronLeft,
  Loader2,
  AlertCircle,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from '../../impersonation.module.css';

function fullName(u) {
  if (!u) return '';
  return [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.email || '';
}

function formatDate(dateStr, locale) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString(locale === 'he' ? 'he-IL' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function statusClass(code) {
  if (code == null) return '';
  if (code >= 200 && code < 300) return styles.statusOk;
  if (code >= 300 && code < 500) return styles.statusWarn;
  return styles.statusErr;
}

export default function ImpersonationSessionDetailPage() {
  const { t, locale } = useLocale();
  const params = useParams();
  const id = params?.id;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/impersonation/sessions/${id}`, { cache: 'no-store' });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (!cancelled) setError(body.error || t('impersonation.admin.detailLoadFailed'));
          return;
        }
        const body = await res.json();
        if (!cancelled) setData(body);
      } catch {
        if (!cancelled) setError(t('impersonation.admin.detailLoadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, t]);

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.stateBox}>
          <Loader2 className={styles.spin} />
          <span>{t('impersonation.admin.loading')}</span>
        </div>
      </div>
    );
  }

  if (error || !data?.session) {
    return (
      <div className={styles.page}>
        <Link href="/admin/impersonation" className={styles.backLink}>
          <ChevronLeft size={14} />
          {t('impersonation.admin.backToList')}
        </Link>
        <div className={styles.formError}>
          <AlertCircle size={14} />
          <span>{error || t('impersonation.admin.detailLoadFailed')}</span>
        </div>
      </div>
    );
  }

  const s = data.session;
  const actions = data.actions || [];
  const isReadOnly = s.scope === 'READ_ONLY';

  return (
    <div className={styles.page}>
      <Link href="/admin/impersonation" className={styles.backLink}>
        <ChevronLeft size={14} />
        {t('impersonation.admin.backToList')}
      </Link>

      <div className={styles.header}>
        <div className={styles.headerIcon}>
          <Eye />
        </div>
        <div>
          <h1 className={styles.title}>
            {t('impersonation.admin.detailTitle', {
              admin: fullName(s.admin) || s.admin?.email || '-',
              target: fullName(s.target) || s.target?.email || '-',
            })}
          </h1>
          <p className={styles.subtitle}>
            {formatDate(s.startedAt, locale)}
            {s.endedAt ? ` → ${formatDate(s.endedAt, locale)}` : ''}
          </p>
        </div>
      </div>

      <section className={styles.card}>
        <header className={styles.cardHeader}>
          <h2>
            {isReadOnly ? <ShieldCheck size={16} style={{ verticalAlign: 'text-bottom' }} /> : <ShieldAlert size={16} style={{ verticalAlign: 'text-bottom' }} />}
            {' '}
            {t('impersonation.admin.detailMetaTitle')}
          </h2>
        </header>
        <dl className={styles.detailGrid}>
          <div>
            <dt>{t('impersonation.admin.scope')}</dt>
            <dd>
              <span className={`${styles.scopeChip} ${styles[`scope_${s.scope}`]}`}>
                {isReadOnly ? t('impersonation.admin.scopeReadOnly') : t('impersonation.admin.scopeFull')}
              </span>
            </dd>
          </div>
          <div>
            <dt>{t('impersonation.admin.target')}</dt>
            <dd>
              {fullName(s.target) || '-'}
              {s.target?.email && <span className={styles.email}>{s.target.email}</span>}
            </dd>
          </div>
          <div>
            <dt>{t('impersonation.admin.adminUser')}</dt>
            <dd>
              {fullName(s.admin) || '-'}
              {s.admin?.email && <span className={styles.email}>{s.admin.email}</span>}
            </dd>
          </div>
          <div>
            <dt>{t('impersonation.admin.startedAt')}</dt>
            <dd>{formatDate(s.startedAt, locale)}</dd>
          </div>
          <div>
            <dt>{t('impersonation.admin.expiresAt')}</dt>
            <dd>{formatDate(s.expiresAt, locale)}</dd>
          </div>
          <div>
            <dt>{t('impersonation.admin.endedAt')}</dt>
            <dd>{s.endedAt ? formatDate(s.endedAt, locale) : t('impersonation.admin.stillActive')}</dd>
          </div>
          {s.endReason && (
            <div>
              <dt>{t('impersonation.admin.endReason')}</dt>
              <dd>{s.endReason}</dd>
            </div>
          )}
          <div>
            <dt>{t('impersonation.admin.ipAddress')}</dt>
            <dd>{s.ipAddress || '-'}</dd>
          </div>
        </dl>
        {s.reason && (
          <div className={styles.reasonBox}>
            <strong>{t('impersonation.admin.reasonLabel')}:</strong> {s.reason}
          </div>
        )}
      </section>

      <section className={styles.card}>
        <header className={styles.cardHeader}>
          <h2>{t('impersonation.admin.actionsTitle', { count: actions.length })}</h2>
          <p>{t('impersonation.admin.actionsDesc')}</p>
        </header>

        {actions.length === 0 ? (
          <div className={styles.stateBox}>
            <span>{t('impersonation.admin.noActions')}</span>
          </div>
        ) : (
          <table className={styles.actionTable}>
            <thead>
              <tr>
                <th>{t('impersonation.admin.col.time')}</th>
                <th>{t('impersonation.admin.col.method')}</th>
                <th>{t('impersonation.admin.col.path')}</th>
                <th>{t('impersonation.admin.col.status')}</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((a) => (
                <tr key={a.id}>
                  <td>{formatDate(a.createdAt, locale)}</td>
                  <td>
                    <span className={`${styles.methodChip} ${styles[a.method] || ''}`}>{a.method}</span>
                  </td>
                  <td>
                    <div className={styles.pathCell}>{a.path}</div>
                    {a.bodyPreview && <div className={styles.bodyPreview}>{a.bodyPreview}</div>}
                  </td>
                  <td className={statusClass(a.statusCode)}>
                    {a.statusCode ?? '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {data.truncated && (
          <div className={styles.truncatedNote}>
            {t('impersonation.admin.actionsTruncated')}
          </div>
        )}
      </section>
    </div>
  );
}
