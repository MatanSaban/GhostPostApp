'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Archive, Loader2, RotateCcw, LogOut, Building2 } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useUser } from '@/app/context/user-context';
import styles from './page.module.css';

export default function RestoreAccountPage() {
  const { t, locale } = useLocale();
  const router = useRouter();
  const { clearUser } = useUser();

  const [isLoading, setIsLoading] = useState(true);
  const [accounts, setAccounts] = useState([]);
  const [restoringId, setRestoringId] = useState(null);
  const [error, setError] = useState(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/account/archived-owned');
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        if (!cancelled) setAccounts(data.accounts || []);
      } catch (err) {
        if (!cancelled) setError(t('restoreAccount.loadError'));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const handleRestore = async (accountId) => {
    setRestoringId(accountId);
    setError(null);
    try {
      const res = await fetch(`/api/account/${accountId}/restore`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t('restoreAccount.restoreError'));
      }
      // Force a fresh dashboard load so useUser picks up the restored account.
      window.location.href = '/dashboard';
    } catch (err) {
      setError(err.message || t('restoreAccount.restoreError'));
      setRestoringId(null);
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore - continue to client-side logout regardless.
    }
    clearUser();
    router.push('/auth/login');
  };

  const formatDateTime = (iso) =>
    new Date(iso).toLocaleString(locale || undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <Loader2 size={32} className={styles.spin} />
          <span>{t('common.loading')}</span>
        </div>
      </div>
    );
  }

  if (!isLoading && accounts.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.header}>
            <Archive className={styles.icon} />
            <h1 className={styles.title}>{t('restoreAccount.noneTitle')}</h1>
          </div>
          <p className={styles.description}>{t('restoreAccount.noneDescription')}</p>
          <div className={styles.actions}>
            <button className={styles.secondaryButton} onClick={() => router.push('/dashboard')}>
              {t('restoreAccount.goToDashboard')}
            </button>
            <button
              className={styles.primaryButton}
              onClick={handleLogout}
              disabled={isLoggingOut}
            >
              <LogOut size={16} />
              {isLoggingOut ? t('auth.loggingOut') : t('auth.logout')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <Archive className={styles.icon} />
          <div>
            <h1 className={styles.title}>{t('restoreAccount.title')}</h1>
            <p className={styles.description}>{t('restoreAccount.description')}</p>
          </div>
        </div>

        {error && (
          <div className={styles.errorBox}>
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        <ul className={styles.accountList}>
          {accounts.map((acc) => (
            <li key={acc.id} className={styles.accountItem}>
              <div className={styles.accountInfo}>
                <div className={styles.accountLogo}>
                  {acc.logo ? (
                    <img src={acc.logo} alt="" />
                  ) : (
                    <Building2 size={24} />
                  )}
                </div>
                <div className={styles.accountMeta}>
                  <div className={styles.accountName}>{acc.name}</div>
                  <div className={styles.accountDetail}>
                    {t('restoreAccount.siteCount', { count: acc.siteCount })}
                  </div>
                  <div className={styles.accountDetail}>
                    {t('restoreAccount.archivedOn')}: {formatDateTime(acc.archivedAt)}
                  </div>
                  <div className={styles.accountDeadline}>
                    {t('restoreAccount.restoreDeadline')}: {formatDateTime(acc.restoreExpiresAt)}
                  </div>
                </div>
              </div>
              <button
                className={styles.primaryButton}
                onClick={() => handleRestore(acc.id)}
                disabled={restoringId === acc.id}
              >
                {restoringId === acc.id ? (
                  <>
                    <Loader2 size={16} className={styles.spin} />
                    {t('restoreAccount.restoring')}
                  </>
                ) : (
                  <>
                    <RotateCcw size={16} />
                    {t('restoreAccount.restoreButton')}
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>

        <div className={styles.actions}>
          <button
            className={styles.secondaryButton}
            onClick={handleLogout}
            disabled={isLoggingOut}
          >
            <LogOut size={16} />
            {isLoggingOut ? t('auth.loggingOut') : t('auth.logout')}
          </button>
        </div>
      </div>
    </div>
  );
}
