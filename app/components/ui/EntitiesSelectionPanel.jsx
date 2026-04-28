'use client';

import { useEffect, useRef } from 'react';
import { Check, Loader2, Layers, ArrowRight, SkipForward } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from './EntitiesSelectionPanel.module.css';

/**
 * Structured-panel sub-step that renders the entity-type selection UI inside
 * a chat (registration onboarding chat or site-profile interview chat).
 *
 * Behavior:
 * - When the parent's scan is in flight, shows a spinner and races a 10s
 *   timeout. If the timeout fires first, calls `onSkip()` silently.
 * - When the scan finishes COMPLETED with at least one type, shows a list
 *   the user can toggle.
 * - When the scan finishes EMPTY or FAILED, calls `onSkip()` silently - the
 *   user shouldn't see anything went wrong, per product spec.
 *
 * The actual scan trigger is the parent's responsibility; this panel only
 * consumes the scan state. That keeps the panel reusable across both chats.
 */
export function EntitiesSelectionPanel({
  scan,           // result of useEntitiesScan() - { status, entityTypes, selectedSlugs, ... }
  onConfirm,      // called with the final selectedSlugs array when the user clicks Continue
  onSkip,         // called silently on timeout/empty/failed (no UI shown)
  waitTimeoutMs = 10000,
}) {
  const { t, locale } = useLocale();
  const isRTL = locale === 'he';
  const hasSkippedRef = useRef(false);
  const hasMountedRef = useRef(false);

  // 10-second wait/skip behavior - the panel is reached either after the
  // scan has already finished (in which case the wait resolves immediately)
  // or while it's still running (in which case we wait up to waitTimeoutMs
  // and then skip silently).
  //
  // Also auto-triggers the scan when status is IDLE: this matters for the
  // site-profile wizard, where the panel is reached without any prior
  // explicit trigger (unlike the registration chat, which fires the scan in
  // handleLanguageSelect). Calling triggerScan with no args works for both
  // contexts - the tempReg adapter falls back to URL/language stored on
  // draftInterviewData, the site adapter uses the closure-captured siteId.
  useEffect(() => {
    let cancelled = false;
    hasMountedRef.current = true;

    const checkAndMaybeSkip = async () => {
      if (hasSkippedRef.current) return;

      // Failed or empty: skip silently. Spec: "if the scan failed or returned
      // empty, skip silently - no UI, no message."
      if (scan.status === 'FAILED' || scan.status === 'EMPTY') {
        hasSkippedRef.current = true;
        onSkip?.();
        return;
      }

      if (scan.status === 'COMPLETED' && (scan.entityTypes?.length || 0) === 0) {
        hasSkippedRef.current = true;
        onSkip?.();
        return;
      }

      if (scan.status === 'IDLE') {
        // No scan ever triggered. Auto-fire one - for the site-profile chat
        // this is the only place a scan gets kicked off. For the registration
        // chat the scan typically already fired earlier, but this is a safe
        // fallback (the hook short-circuits if a scan is already in flight).
        scan.triggerScan?.();
        return;
      }

      if (scan.status === 'SCANNING') {
        const result = await scan.awaitScan(waitTimeoutMs);
        if (cancelled || hasSkippedRef.current) return;
        if (result === 'TIMEOUT' || result === 'FAILED' || result === 'EMPTY') {
          hasSkippedRef.current = true;
          onSkip?.();
        }
        // If result === 'COMPLETED' the parent will re-render with new state
        // and the next pass through this effect will do the right thing.
      }
    };

    checkAndMaybeSkip();
    return () => { cancelled = true; };
    // We intentionally re-run when status changes so that a SCANNING -> EMPTY
    // transition (rare but possible if cached state arrives just after mount)
    // still triggers the skip.
  }, [scan.status, scan.entityTypes?.length]);

  // While we're scanning OR before we've even reached the panel logic, show
  // a loading state. The parent can also choose not to render us until the
  // scan is COMPLETED - but rendering us during SCANNING is fine because we
  // race the timeout internally.
  if (scan.status === 'SCANNING' || scan.status === 'IDLE') {
    return (
      <div className={styles.panel}>
        <div className={styles.loadingState}>
          <Loader2 size={18} className={styles.spinningIcon} />
          <span>{t('entitiesSelection.scanning') || (locale === 'he' ? 'סורק את האתר שלך לזיהוי תכנים...' : 'Scanning your site for content types...')}</span>
        </div>
      </div>
    );
  }

  // EMPTY/FAILED: render nothing visible - onSkip() was already fired in the
  // effect above and the parent will move on.
  if (scan.status !== 'COMPLETED' || (scan.entityTypes?.length || 0) === 0) {
    return null;
  }

  const entityTypes = scan.entityTypes || [];
  const selectedSet = new Set(scan.selectedSlugs || []);

  const handleConfirm = () => {
    onConfirm?.(scan.selectedSlugs || []);
  };

  return (
    <div className={styles.panel} dir={isRTL ? 'rtl' : 'ltr'}>
      <div className={styles.header}>
        <Layers size={20} className={styles.headerIcon} />
        <div className={styles.headerText}>
          <h3 className={styles.title}>
            {t('entitiesSelection.title') || (locale === 'he' ? 'איזה סוגי תוכן יש באתר שלך?' : 'What types of content does your site have?')}
          </h3>
          <p className={styles.subtitle}>
            {t('entitiesSelection.subtitle') || (locale === 'he' ? 'בחר את סוגי התוכן שברצונך לנהל ולעקוב אחריהם.' : 'Select the content types you want to manage and track.')}
          </p>
        </div>
      </div>

      <div className={styles.typesList}>
        {entityTypes.map((type) => {
          const isSelected = selectedSet.has(type.slug);
          const displayName = locale === 'he' && type.nameHe ? type.nameHe : type.name;
          const count = type.entityCount || 0;
          return (
            <div
              key={type.slug}
              className={`${styles.typeRow} ${isSelected ? styles.selected : ''}`}
              onClick={() => scan.toggleSlug(type.slug)}
              role="checkbox"
              aria-checked={isSelected}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  scan.toggleSlug(type.slug);
                }
              }}
            >
              <div className={styles.checkbox}>
                {isSelected && <Check size={14} />}
              </div>
              <div className={styles.typeInfo}>
                <span className={styles.typeName}>{displayName}</span>
                {count > 0 && (
                  <span className={styles.typeMeta}>
                    {locale === 'he' ? `${count} פריטים` : `${count} items`}
                  </span>
                )}
              </div>
              {type.isCore && (
                <span className={styles.coreBadge}>
                  {locale === 'he' ? 'בסיסי' : 'Core'}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.skipButton}
          onClick={onSkip}
        >
          <SkipForward size={14} />
          <span>{t('entitiesSelection.skip') || (locale === 'he' ? 'דלג' : 'Skip')}</span>
        </button>
        <button
          type="button"
          className={styles.confirmButton}
          onClick={handleConfirm}
          disabled={(scan.selectedSlugs || []).length === 0}
        >
          <span>{t('entitiesSelection.continue') || (locale === 'he' ? 'המשך' : 'Continue')}</span>
          <ArrowRight size={14} style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} />
        </button>
      </div>
    </div>
  );
}

export default EntitiesSelectionPanel;
