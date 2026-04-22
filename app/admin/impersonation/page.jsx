'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Eye,
  ShieldAlert,
  ShieldCheck,
  Loader2,
  AlertCircle,
  Clock,
  X,
  ChevronRight,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from './impersonation.module.css';

function fullName(u) {
  if (!u) return '';
  return [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.email || '';
}

function formatDate(dateStr, locale) {
  return new Date(dateStr).toLocaleString(locale === 'he' ? 'he-IL' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminImpersonationPage() {
  const { t, locale } = useLocale();
  const router = useRouter();

  const [code, setCode] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [activeStatus, setActiveStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  async function loadStatus() {
    setStatusLoading(true);
    try {
      const res = await fetch('/api/impersonation/status', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setActiveStatus(data?.active ? data : null);
      }
    } catch {
      // ignore
    } finally {
      setStatusLoading(false);
    }
  }

  async function loadSessions() {
    setSessionsLoading(true);
    try {
      const res = await fetch('/api/admin/impersonation/sessions?limit=25', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setSessions(Array.isArray(data?.sessions) ? data.sessions : []);
      }
    } catch {
      // ignore
    } finally {
      setSessionsLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
    loadSessions();
  }, []);

  async function handleStart(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/impersonation/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, reason: reason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || t('impersonation.admin.startFailed'));
        return;
      }
      setCode('');
      setReason('');
      // Bounce to the user dashboard so the admin lands inside the impersonated
      // session immediately. The banner will surface the active session.
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError(t('impersonation.admin.startFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEnd() {
    if (!confirm(t('impersonation.admin.endConfirm'))) return;
    try {
      await fetch('/api/admin/impersonation/end', { method: 'POST' });
    } catch {
      // ignore — we'll re-poll and reflect reality
    }
    await Promise.all([loadStatus(), loadSessions()]);
    router.refresh();
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerIcon}>
          <Eye />
        </div>
        <div>
          <h1 className={styles.title}>{t('impersonation.admin.title')}</h1>
          <p className={styles.subtitle}>{t('impersonation.admin.subtitle')}</p>
        </div>
      </div>

      <div className={styles.warningBanner}>
        <ShieldAlert />
        <div>
          <strong>{t('impersonation.admin.warningTitle')}</strong>
          <p>{t('impersonation.admin.warningDesc')}</p>
        </div>
      </div>

      {statusLoading ? (
        <div className={styles.stateBox}>
          <Loader2 className={styles.spin} />
          <span>{t('impersonation.admin.loading')}</span>
        </div>
      ) : activeStatus ? (
        <section className={styles.activeCard}>
          <header className={styles.activeCardHeader}>
            {activeStatus.scope === 'READ_ONLY' ? <ShieldCheck /> : <ShieldAlert />}
            <h2>{t('impersonation.admin.activeTitle')}</h2>
          </header>
          <dl className={styles.activeMeta}>
            <div>
              <dt>{t('impersonation.admin.target')}</dt>
              <dd>
                {fullName(activeStatus.target)}
                <span className={styles.email}>{activeStatus.target?.email}</span>
              </dd>
            </div>
            <div>
              <dt>{t('impersonation.admin.scope')}</dt>
              <dd>
                <span className={`${styles.scopeChip} ${styles[`scope_${activeStatus.scope}`]}`}>
                  {activeStatus.scope === 'READ_ONLY'
                    ? t('impersonation.admin.scopeReadOnly')
                    : t('impersonation.admin.scopeFull')}
                </span>
              </dd>
            </div>
            <div>
              <dt>{t('impersonation.admin.startedAt')}</dt>
              <dd>{formatDate(activeStatus.startedAt, locale)}</dd>
            </div>
            <div>
              <dt>{t('impersonation.admin.expiresAt')}</dt>
              <dd>
                <Clock size={14} className={styles.metaIcon} />
                {formatDate(activeStatus.expiresAt, locale)}
              </dd>
            </div>
          </dl>
          <div className={styles.activeActions}>
            <button type="button" onClick={handleEnd} className={styles.endButton}>
              <X size={14} />
              {t('impersonation.admin.endNow')}
            </button>
          </div>
        </section>
      ) : null}

      <section className={styles.card}>
        <header className={styles.cardHeader}>
          <h2>{t('impersonation.admin.startTitle')}</h2>
          <p>{t('impersonation.admin.startDesc')}</p>
        </header>

        <form onSubmit={handleStart} className={styles.form}>
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel} htmlFor="code">
              {t('impersonation.admin.codeLabel')}
            </label>
            <input
              id="code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="AB7K-9XQR-MN3P-T5VW"
              autoComplete="off"
              spellCheck={false}
              className={styles.input}
              required
            />
            <span className={styles.fieldHint}>{t('impersonation.admin.codeHint')}</span>
          </div>

          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel} htmlFor="reason">
              {t('impersonation.admin.reasonLabel')}
            </label>
            <textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('impersonation.admin.reasonPlaceholder')}
              className={styles.textarea}
              rows={3}
              maxLength={500}
              required
            />
            <span className={styles.fieldHint}>{t('impersonation.admin.reasonHint')}</span>
          </div>

          {error && (
            <div className={styles.formError}>
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          <div className={styles.formActions}>
            <button type="submit" disabled={submitting || !code || reason.trim().length < 10} className={styles.primaryButton}>
              {submitting ? <Loader2 size={16} className={styles.spin} /> : <Eye size={16} />}
              {t('impersonation.admin.startButton')}
            </button>
          </div>
        </form>
      </section>

      <section className={styles.card}>
        <header className={styles.cardHeader}>
          <h2>{t('impersonation.admin.historyTitle')}</h2>
          <p>{t('impersonation.admin.historyDesc')}</p>
        </header>

        {sessionsLoading ? (
          <div className={styles.stateBox}>
            <Loader2 className={styles.spin} />
            <span>{t('impersonation.admin.loading')}</span>
          </div>
        ) : sessions.length === 0 ? (
          <div className={styles.stateBox}>
            <span>{t('impersonation.admin.historyEmpty')}</span>
          </div>
        ) : (
          <ul className={styles.sessionList}>
            {sessions.map((s) => (
              <li key={s.id}>
                <Link href={`/admin/impersonation/sessions/${s.id}`} className={styles.sessionRow}>
                  <div className={styles.sessionRowMain}>
                    <div className={styles.sessionRowTop}>
                      <span className={styles.sessionTarget}>
                        {fullName(s.target) || s.target?.email || '—'}
                      </span>
                      <span className={`${styles.scopeChip} ${styles[`scope_${s.scope}`]}`}>
                        {s.scope === 'READ_ONLY'
                          ? t('impersonation.admin.scopeReadOnly')
                          : t('impersonation.admin.scopeFull')}
                      </span>
                      {s.active && (
                        <span className={styles.liveChip}>
                          {t('impersonation.admin.liveTag')}
                        </span>
                      )}
                    </div>
                    <div className={styles.sessionRowMeta}>
                      <span>{t('impersonation.admin.byAdmin', { name: fullName(s.admin) || s.admin?.email || '—' })}</span>
                      <span>•</span>
                      <span>{formatDate(s.startedAt, locale)}</span>
                      <span>•</span>
                      <span>{t('impersonation.admin.actionCount', { count: s.actionCount })}</span>
                    </div>
                  </div>
                  <ChevronRight size={16} className={styles.metaIcon} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
