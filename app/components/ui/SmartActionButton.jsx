'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import LimitReachedModal from './LimitReachedModal';
import styles from './SmartActionButton.module.css';

/**
 * SmartActionButton
 *
 * Wraps any action that has a plan-enforced limit (audits, sites, content, etc.).
 * Shows "{label} (3/5 Used)" with a colour-coded micro progress bar.
 * When the limit is reached it opens the LimitReachedModal instead of
 * executing the action.
 *
 * Props:
 *  - resourceKey    : string   – e.g. 'siteAudits', 'maxSites', 'aiCredits'
 *  - accountId      : string   – current account id
 *  - label          : string   – visible button text (translated by caller)
 *  - icon           : Element  – lucide icon component (optional)
 *  - iconSize       : number   – icon width/height (default 18)
 *  - onAction       : () => void | Promise – executed when limit is NOT reached
 *  - disabled       : boolean  – additional disable flag from parent
 *  - busy           : boolean  – shows spinner (e.g. while action runs)
 *  - busyLabel      : string   – text while busy (optional)
 *  - className      : string   – additional className
 *  - variant        : 'primary' | 'secondary' | 'ghost' (default 'primary')
 *  - showUsage      : boolean  – show "(3/5)" badge (default true)
 *  - children       : ReactNode – overrides label+icon if provided
 */
export default function SmartActionButton({
  resourceKey,
  accountId,
  label,
  icon: Icon,
  iconSize = 18,
  onAction,
  disabled = false,
  busy = false,
  busyLabel,
  className = '',
  variant = 'primary',
  showUsage = true,
  children,
}) {
  const { t } = useLocale();

  const [usage, setUsage] = useState(null);
  const [isLoadingUsage, setIsLoadingUsage] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // ── Fetch usage from lightweight API ────────────────────────
  useEffect(() => {
    if (!accountId || !resourceKey) return;
    let cancelled = false;

    (async () => {
      try {
        setIsLoadingUsage(true);
        const res = await fetch(
          `/api/account/usage?resourceKey=${resourceKey}`
        );
        if (!res.ok) throw new Error('Failed to fetch usage');
        const data = await res.json();
        if (!cancelled) setUsage(data);
      } catch {
        // Fail silently – button still works, just no badge
        if (!cancelled) setUsage(null);
      } finally {
        if (!cancelled) setIsLoadingUsage(false);
      }
    })();

    return () => { cancelled = true; };
  }, [accountId, resourceKey]);

  // Refresh usage after modal closes (in case add-on was purchased)
  const refreshUsage = async () => {
    try {
      const res = await fetch(
        `/api/account/usage?resourceKey=${resourceKey}`
      );
      if (res.ok) {
        const data = await res.json();
        setUsage(data);
      }
    } catch { /* ignore */ }
  };

  // ── Click handler ──────────────────────────────────────────
  const handleClick = () => {
    if (busy || disabled) return;

    if (usage?.isLimitReached) {
      setShowModal(true);
      return;
    }

    onAction?.();
  };

  // ── Derived state ──────────────────────────────────────────
  const isLimited = usage?.isLimitReached;
  const percentUsed = usage?.percentUsed ?? 0;
  const isWarning = percentUsed >= 80 && !isLimited;
  const hasUsageData = usage && usage.limit !== null;

  const variantClass =
    variant === 'secondary'
      ? styles.secondary
      : variant === 'ghost'
        ? styles.ghost
        : styles.primary;

  return (
    <>
      <button
        className={`${styles.smartButton} ${variantClass} ${isLimited ? styles.limitReached : ''} ${isWarning ? styles.warning : ''} ${className}`}
        onClick={handleClick}
        disabled={disabled || busy}
        title={
          isLimited
            ? t('limits.limitReached')
            : undefined
        }
      >
        {/* Icon or spinner */}
        {busy ? (
          <Loader2 className={`${styles.icon} ${styles.spinning}`} size={iconSize} />
        ) : Icon ? (
          <Icon className={styles.icon} size={iconSize} />
        ) : null}

        {/* Label */}
        <span className={styles.label}>
          {busy && busyLabel ? busyLabel : (children || label)}
        </span>

        {/* Usage badge */}
        {showUsage && hasUsageData && !busy && (
          <span className={`${styles.usageBadge} ${isLimited ? styles.usageBadgeLimited : ''} ${isWarning ? styles.usageBadgeWarning : ''}`}>
            {usage.used}/{usage.limit}
          </span>
        )}

        {/* Micro progress bar */}
        {showUsage && hasUsageData && !busy && (
          <span className={styles.microBar}>
            <span
              className={`${styles.microBarFill} ${isLimited ? styles.microBarFillLimited : ''} ${isWarning ? styles.microBarFillWarning : ''}`}
              style={{ width: `${Math.min(100, percentUsed)}%` }}
            />
          </span>
        )}
      </button>

      {/* Limit Reached Modal */}
      {showModal && (
        <LimitReachedModal
          isOpen={showModal}
          onClose={() => {
            setShowModal(false);
            refreshUsage();
          }}
          resourceKey={resourceKey}
          accountId={accountId}
          usage={usage}
        />
      )}
    </>
  );
}
