'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Key,
  ShieldCheck,
  ShieldAlert,
  Plus,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  Trash2,
  ArrowLeft,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from '../page.module.css';
import accessStyles from './access.module.css';

const TTL_OPTIONS = [
  { value: '15m', labelKey: 'support.access.ttl.m15' },
  { value: '1h', labelKey: 'support.access.ttl.h1' },
  { value: '4h', labelKey: 'support.access.ttl.h4' },
  { value: '24h', labelKey: 'support.access.ttl.h24' },
];

const SCOPE_OPTIONS = [
  { value: 'READ_ONLY', labelKey: 'support.access.scopeReadOnly', descKey: 'support.access.scopeReadOnlyDesc' },
  { value: 'FULL', labelKey: 'support.access.scopeFull', descKey: 'support.access.scopeFullDesc' },
];

function formatDate(dateStr, locale) {
  return new Date(dateStr).toLocaleString(locale === 'he' ? 'he-IL' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function relativeRemaining(expiresAt, t) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return t('support.access.expired');
  const min = Math.floor(ms / 60000);
  if (min < 60) return t('support.access.expiresInMinutes', { count: min });
  const hr = Math.floor(min / 60);
  if (hr < 48) return t('support.access.expiresInHours', { count: hr });
  const days = Math.floor(hr / 24);
  return t('support.access.expiresInDays', { count: days });
}

function statusLabel(status, t) {
  switch (status) {
    case 'ACTIVE': return t('support.access.status.active');
    case 'USED': return t('support.access.status.used');
    case 'EXPIRED': return t('support.access.status.expired');
    case 'REVOKED': return t('support.access.status.revoked');
    default: return status;
  }
}

export default function SupportAccessPage() {
  const { t, locale } = useLocale();

  const [grants, setGrants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [scope, setScope] = useState('READ_ONLY');
  const [ttl, setTtl] = useState('1h');
  const [reason, setReason] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  const [freshCode, setFreshCode] = useState(null);
  const [copied, setCopied] = useState(false);

  async function loadGrants() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/support/impersonation-grants');
      if (!res.ok) throw new Error('load_failed');
      const data = await res.json();
      setGrants(data.grants || []);
    } catch (err) {
      setError(t('support.access.loadFailed'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadGrants();
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/support/impersonation-grants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, ttl, reason: reason.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCreateError(data.error || t('support.access.createFailed'));
        return;
      }
      setFreshCode(data.code);
      setReason('');
      await loadGrants();
    } catch (err) {
      setCreateError(t('support.access.createFailed'));
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id) {
    if (!confirm(t('support.access.revokeConfirm'))) return;
    try {
      const res = await fetch(`/api/support/impersonation-grants/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('revoke_failed');
      await loadGrants();
    } catch (err) {
      alert(t('support.access.revokeFailed'));
    }
  }

  async function copyCode() {
    if (!freshCode) return;
    try {
      await navigator.clipboard.writeText(freshCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be blocked - user can still select+copy manually.
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>
            <Key />
          </div>
          <div>
            <h1 className={styles.pageTitle}>{t('support.access.title')}</h1>
            <p className={styles.pageSubtitle}>{t('support.access.subtitle')}</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <Link href="/dashboard/support" className={styles.secondaryAction}>
            <ArrowLeft size={16} />
            {t('support.access.backToSupport')}
          </Link>
        </div>
      </div>

      <div className={accessStyles.warningBanner}>
        <ShieldAlert />
        <div>
          <strong>{t('support.access.howItWorks')}</strong>
          <p>{t('support.access.howItWorksDesc')}</p>
        </div>
      </div>

      <section className={accessStyles.card}>
        <header className={accessStyles.cardHeader}>
          <h2>{t('support.access.generateTitle')}</h2>
          <p>{t('support.access.generateDesc')}</p>
        </header>

        <form onSubmit={handleCreate} className={accessStyles.form}>
          <div className={accessStyles.fieldRow}>
            <label className={accessStyles.fieldLabel}>{t('support.access.scopeLabel')}</label>
            <div className={accessStyles.scopeGrid}>
              {SCOPE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`${accessStyles.scopeOption} ${scope === opt.value ? accessStyles.scopeOptionActive : ''}`}
                >
                  <input
                    type="radio"
                    name="scope"
                    value={opt.value}
                    checked={scope === opt.value}
                    onChange={() => setScope(opt.value)}
                  />
                  <div>
                    <div className={accessStyles.scopeOptionTitle}>
                      {opt.value === 'READ_ONLY' ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
                      {t(opt.labelKey)}
                    </div>
                    <p className={accessStyles.scopeOptionDesc}>{t(opt.descKey)}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className={accessStyles.fieldRow}>
            <label className={accessStyles.fieldLabel}>{t('support.access.ttlLabel')}</label>
            <div className={accessStyles.ttlGrid}>
              {TTL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTtl(opt.value)}
                  className={`${accessStyles.ttlChip} ${ttl === opt.value ? accessStyles.ttlChipActive : ''}`}
                >
                  {t(opt.labelKey)}
                </button>
              ))}
            </div>
          </div>

          <div className={accessStyles.fieldRow}>
            <label className={accessStyles.fieldLabel} htmlFor="reason">
              {t('support.access.reasonLabel')}
            </label>
            <textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('support.access.reasonPlaceholder')}
              className={accessStyles.textarea}
              maxLength={500}
              rows={2}
            />
            <span className={accessStyles.fieldHint}>{t('support.access.reasonHint')}</span>
          </div>

          {createError && (
            <div className={accessStyles.formError}>
              <AlertCircle size={14} />
              <span>{createError}</span>
            </div>
          )}

          <div className={accessStyles.formActions}>
            <button type="submit" disabled={creating} className={styles.primaryAction}>
              {creating ? <Loader2 size={16} className={styles.spinner} /> : <Plus size={16} />}
              {t('support.access.generateButton')}
            </button>
          </div>
        </form>
      </section>

      {freshCode && (
        <div className={accessStyles.codeBanner}>
          <div className={accessStyles.codeBannerHeader}>
            <ShieldCheck />
            <strong>{t('support.access.codeReady')}</strong>
          </div>
          <p>{t('support.access.codeReadyDesc')}</p>
          <div className={accessStyles.codeRow}>
            <code className={accessStyles.code}>{freshCode}</code>
            <button type="button" onClick={copyCode} className={styles.secondaryAction}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? t('support.access.copied') : t('support.access.copy')}
            </button>
          </div>
          <button
            type="button"
            onClick={() => { setFreshCode(null); setCopied(false); }}
            className={accessStyles.dismissButton}
          >
            {t('support.access.dismissCode')}
          </button>
        </div>
      )}

      <section className={accessStyles.card}>
        <header className={accessStyles.cardHeader}>
          <h2>{t('support.access.historyTitle')}</h2>
          <p>{t('support.access.historyDesc')}</p>
        </header>

        {loading ? (
          <div className={styles.stateBox}>
            <Loader2 className={styles.spinner} />
            <span>{t('support.access.loading')}</span>
          </div>
        ) : error ? (
          <div className={styles.stateBox}>
            <AlertCircle />
            <span>{error}</span>
          </div>
        ) : grants.length === 0 ? (
          <div className={styles.emptyState}>
            <Key className={styles.emptyIcon} />
            <h2>{t('support.access.noGrants')}</h2>
            <p>{t('support.access.noGrantsHint')}</p>
          </div>
        ) : (
          <ul className={accessStyles.grantList}>
            {grants.map((grant) => {
              const isActive = grant.status === 'ACTIVE';
              const expired = isActive && new Date(grant.expiresAt).getTime() <= Date.now();
              const effectiveStatus = expired ? 'EXPIRED' : grant.status;
              return (
                <li key={grant.id} className={accessStyles.grantRow}>
                  <div className={accessStyles.grantMain}>
                    <div className={accessStyles.grantTopLine}>
                      <span className={accessStyles.grantPrefix}>{grant.codePrefix}…</span>
                      <span className={`${accessStyles.statusChip} ${accessStyles[`status_${effectiveStatus}`]}`}>
                        {statusLabel(effectiveStatus, t)}
                      </span>
                      <span className={accessStyles.scopeBadge}>
                        {grant.scope === 'READ_ONLY'
                          ? t('support.access.scopeReadOnly')
                          : t('support.access.scopeFull')}
                      </span>
                    </div>
                    <div className={accessStyles.grantMeta}>
                      <span>{t('support.access.createdAt', { date: formatDate(grant.createdAt, locale) })}</span>
                      {isActive && !expired && (
                        <span>{relativeRemaining(grant.expiresAt, t)}</span>
                      )}
                      {grant.reason && (
                        <span className={accessStyles.grantReason}>"{grant.reason}"</span>
                      )}
                    </div>
                    {grant.sessions && grant.sessions.length > 0 && (
                      <div className={accessStyles.sessionsList}>
                        <strong>{t('support.access.sessionsLabel')}</strong>
                        {grant.sessions.map((s) => {
                          const adminName = [s.adminUser?.firstName, s.adminUser?.lastName].filter(Boolean).join(' ')
                            || s.adminUser?.email
                            || t('support.access.unknownAdmin');
                          return (
                            <div key={s.id} className={accessStyles.sessionRow}>
                              <span>{adminName}</span>
                              <span>{formatDate(s.startedAt, locale)}</span>
                              <span>
                                {s.endedAt
                                  ? t('support.access.sessionEnded', { reason: s.endReason || 'closed' })
                                  : t('support.access.sessionLive')}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {isActive && !expired && (
                    <button
                      type="button"
                      onClick={() => handleRevoke(grant.id)}
                      className={accessStyles.revokeButton}
                      title={t('support.access.revoke')}
                    >
                      <Trash2 size={14} />
                      {t('support.access.revoke')}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
