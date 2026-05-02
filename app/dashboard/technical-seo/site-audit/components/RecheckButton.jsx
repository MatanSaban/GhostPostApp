'use client';

import { RotateCw, Loader2, AlertCircle } from 'lucide-react';
import { ConfirmModal } from '@/app/components/ui/ConfirmModal';
import GCoinIcon from '@/app/components/ui/GCoinIcon';
import { useLocale } from '@/app/context/locale-context';
import styles from './RecheckButton.module.css';

/**
 * Sources whose issues the recheck endpoint can actually re-evaluate. Mirror
 * of RECHECKABLE_SOURCES on the server. Used to hide the Recheck button for
 * issues whose detection requires the heavy pipeline (axe, playwright, ai-vision)
 * — clicking them would burn GCoins without ever resolving anything.
 */
const RECHECKABLE_SOURCES = new Set(['html', 'psi', 'pagespeed', 'fetch', 'system', null, undefined]);

export function isIssueRecheckable(sourceOrIssue) {
  const src = typeof sourceOrIssue === 'object' && sourceOrIssue !== null
    ? sourceOrIssue.source
    : sourceOrIssue;
  return RECHECKABLE_SOURCES.has(src ?? null);
}

/**
 * Small "Recheck" button used on aggregated issue rows, the drill-down header,
 * and individual issue rows in the page-detail modal. Stays visually subtle so
 * it doesn't crowd the existing FixButton.
 *
 * The button itself does not own the recheck flow — it just calls
 * `onRequestRecheck` which the page wires to `useRecheck.requestRecheck()`.
 */
export function RecheckButton({
  count = 1,
  busy = false,
  disabled = false,
  variant = 'default', // 'default' | 'small' | 'inline'
  onClick,
  stopPropagation = false,
}) {
  const { t } = useLocale();

  const handleClick = (e) => {
    if (stopPropagation) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (busy || disabled) return;
    onClick?.(e);
  };

  const label = count > 1
    ? (t('siteAudit.recheck.recheckN') || 'Recheck {n}').replace('{n}', count)
    : (t('siteAudit.recheck.recheck') || 'Recheck');

  return (
    <button
      type="button"
      className={`${styles.btn} ${styles[`btn_${variant}`]}`}
      onClick={handleClick}
      disabled={busy || disabled}
      title={t('siteAudit.recheck.tooltip') || 'Re-fetch the page(s) and verify if this issue is still present.'}
    >
      {busy ? <Loader2 size={12} className={styles.spinning} /> : <RotateCw size={12} />}
      <span className={styles.label}>{label}</span>
      <span className={styles.cost}>
        <GCoinIcon size={11} className={styles.coinIcon} />
        {count}
      </span>
    </button>
  );
}

/**
 * Confirmation modal for recheck. Wraps the shared ConfirmModal with copy
 * specific to the recheck flow + balance display.
 *
 * `onConfirm` is fire-and-forget — closing the modal and starting the recheck
 * is the caller's job (see useRecheck.confirmRecheck). The modal itself never
 * shows a pending spinner; the floating background-task bar takes over once
 * the user confirms.
 */
export function RecheckConfirmModal({
  pending,                // { urls, label, key, issueKey } | null
  creditsRemaining,
  onConfirm,
  onCancel,
}) {
  const { t } = useLocale();
  if (!pending) return null;

  const cost = pending.urls.length;
  const insufficient = creditsRemaining != null && creditsRemaining < cost;

  const title = cost > 1
    ? (t('siteAudit.recheck.confirmTitleN') || 'Recheck {n} pages?').replace('{n}', cost)
    : (t('siteAudit.recheck.confirmTitleOne') || 'Recheck this page?');

  // Description carries: cost, balance, a reminder that the recheck runs
  // in the background, and a stale-score caveat.
  const costLine = (t('siteAudit.recheck.costLine') || 'This will cost {cost} GCoins. You have {balance}.')
    .replace('{cost}', cost)
    .replace('{balance}', creditsRemaining ?? '—');
  const backgroundLine = t('siteAudit.recheck.backgroundLine')
    || 'The recheck will run in the background — you can keep working on the platform while it completes.';
  const stalenessLine = t('siteAudit.recheck.stalenessLine')
    || 'Resolved issues will be marked fixed, but the audit score and AI summary will only refresh when you run a new full audit.';

  const description = `${costLine}\n\n${backgroundLine}\n\n${stalenessLine}`;

  return (
    <ConfirmModal
      isOpen
      onClose={onCancel}
      onConfirm={onConfirm}
      title={title}
      description={description}
      confirmLabel={
        insufficient
          ? (t('siteAudit.recheck.insufficient') || 'Not enough GCoins')
          : (t('siteAudit.recheck.confirm') || 'Recheck')
      }
      cancelLabel={t('common.cancel') || 'Cancel'}
      variant="primary"
      isPending={insufficient}
    />
  );
}

/**
 * One-line yellow banner that surfaces once *any* recheck has resolved an
 * issue (or even just been attempted) in the current session. Reminds the
 * user that the score / summary are stale relative to the current issues.
 */
export function StaleScoreBanner({ visible, onDismiss }) {
  const { t } = useLocale();
  if (!visible) return null;
  return (
    <div className={styles.staleBanner} role="status">
      <AlertCircle size={14} />
      <span className={styles.staleText}>
        {t('siteAudit.recheck.staleBanner')
          || 'You\'ve rechecked some issues. Run a new audit to update your score and AI summary.'}
      </span>
      {onDismiss && (
        <button
          type="button"
          className={styles.staleDismiss}
          onClick={onDismiss}
          aria-label={t('common.dismiss') || 'Dismiss'}
        >
          ×
        </button>
      )}
    </div>
  );
}
