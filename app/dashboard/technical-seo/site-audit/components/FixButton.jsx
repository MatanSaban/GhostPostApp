'use client';

/**
 * FixButton — single component that renders the right button based on the
 * registry classification for the issue. Replaces the previously-duplicated
 * inline AI/Free button logic.
 *
 * Visual variants:
 *   - kind="ai"   → outlined primary, wand icon, label includes credit price
 *   - kind="free" → outlined accent, wrench icon, "Free" suffix
 *
 * Size variants:
 *   - "default" — used in aggregated rows / drill-down headers
 *   - "small"   — used in page-detail modal issue list
 *
 * The label is composed from i18n keys plus the static fixed price the registry
 * holds for AI handlers. Showing the price up front (not after the call) is
 * intentional — users decide before paying. Real deduction may differ slightly
 * from the displayed price; we adjust the registry over time as usage data
 * accumulates.
 */

import { Wand2, Wrench, Loader2 } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from '../site-audit.module.css';

export default function FixButton({
  fixer,                // registry entry: { kind, handler, credits?, bulk? }
  size = 'default',     // 'default' | 'small'
  busy = false,         // show spinner
  disabled = false,
  onClick,
  stopPropagation = false,
}) {
  const { t } = useLocale();

  if (!fixer) return null;

  const isAi = fixer.kind === 'ai';
  const isSmall = size === 'small';

  const cls = isAi
    ? (isSmall ? styles.aiFixBtnSmall : styles.aiFixBtn)
    : (isSmall ? styles.fixBtnSmall : styles.fixBtn);

  const iconSize = isSmall ? 12 : 13;
  const Icon = busy ? Loader2 : (isAi ? Wand2 : Wrench);

  const label = (() => {
    if (busy) return t('siteAudit.fix.fixing') || 'Fixing...';
    if (isAi) {
      const credits = fixer.credits || 1;
      // siteAudit.aiFix.labelWithCredits: "AI Fix · {credits} credits"
      const tpl = t('siteAudit.aiFix.labelWithCredits');
      if (tpl && tpl !== 'siteAudit.aiFix.labelWithCredits') {
        return tpl.replace('{credits}', String(credits));
      }
      // Fallback: bare label
      return `${t('siteAudit.aiFix.label')} · ${credits}`;
    }
    // Free fix
    const free = t('siteAudit.quickFix.free');
    const lbl = t('siteAudit.fix.label');
    return free && free !== 'siteAudit.quickFix.free' ? `${lbl} · ${free}` : lbl;
  })();

  const title = isAi ? t('siteAudit.aiFix.title') : t('siteAudit.fix.title');

  const handleClick = (e) => {
    if (stopPropagation) e.stopPropagation();
    if (busy || disabled) return;
    onClick?.(e);
  };

  return (
    <button
      type="button"
      className={cls}
      onClick={handleClick}
      disabled={busy || disabled}
      title={title}
      style={busy || disabled ? { opacity: 0.6 } : undefined}
    >
      <Icon size={iconSize} className={busy ? styles.spinning : undefined} />
      <span>{label}</span>
    </button>
  );
}
