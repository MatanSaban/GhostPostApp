'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert, ShieldCheck, X, Loader2 } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from './ImpersonationBanner.module.css';

const POLL_INTERVAL_MS = 30_000;

function formatRemaining(expiresAt, t) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return t('impersonation.banner.expired');
  const min = Math.floor(ms / 60000);
  if (min < 60) return t('impersonation.banner.minutesLeft', { count: min });
  const hr = Math.floor(min / 60);
  return t('impersonation.banner.hoursLeft', { count: hr });
}

function fullName(u, fallback) {
  if (!u) return fallback;
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  return name || u.email || fallback;
}

/**
 * Sticky banner that surfaces an active impersonation session in the UI.
 *
 * Mounted globally inside both the dashboard and admin layouts so the warning
 * is impossible to lose track of. Renders nothing when no session is active —
 * the polling cost is one cheap GET every 30s, which we're fine with for the
 * audit-trail value of always-correct UI state.
 *
 * The banner has a single action: end the session. We deliberately don't add
 * other controls here — keep the surface tiny so it doesn't become its own
 * misuse vector.
 */
export function ImpersonationBanner() {
  const { t } = useLocale();
  const router = useRouter();
  const [status, setStatus] = useState(null);
  const [ending, setEnding] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/impersonation/status', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setStatus(data?.active ? data : null);
    } catch {
      // Silent failure — banner just stays in its previous state. Auth errors
      // unrelated to impersonation shouldn't trigger UI noise here.
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchStatus]);

  async function handleEnd() {
    setEnding(true);
    try {
      await fetch('/api/admin/impersonation/end', { method: 'POST' });
    } catch {
      // ignore — we'll re-poll status anyway
    } finally {
      setStatus(null);
      setEnding(false);
      // Force a hard refresh so server components re-fetch with the admin's
      // real identity restored.
      router.refresh();
    }
  }

  if (!status) return null;

  const adminName = fullName(status.admin, t('impersonation.banner.unknownAdmin'));
  const targetName = fullName(status.target, t('impersonation.banner.unknownUser'));
  const isReadOnly = status.scope === 'READ_ONLY';

  return (
    <div className={`${styles.banner} ${isReadOnly ? styles.bannerReadOnly : styles.bannerFull}`}>
      <div className={styles.left}>
        {isReadOnly ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}
        <div>
          <strong>
            {t('impersonation.banner.title', { admin: adminName, target: targetName })}
          </strong>
          <span className={styles.subline}>
            {isReadOnly
              ? t('impersonation.banner.scopeReadOnly')
              : t('impersonation.banner.scopeFull')}
            {' • '}
            {formatRemaining(status.expiresAt, t)}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={handleEnd}
        disabled={ending}
        className={styles.endButton}
      >
        {ending ? <Loader2 size={14} className={styles.spin} /> : <X size={14} />}
        {t('impersonation.banner.endSession')}
      </button>
    </div>
  );
}

export default ImpersonationBanner;
