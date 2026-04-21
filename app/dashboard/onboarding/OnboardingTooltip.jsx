'use client';

import { Sparkles, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from './OnboardingTooltip.module.css';

/**
 * Custom Joyride tooltip that matches the GhostPost visual language.
 * Joyride passes us everything we need as props.
 *
 * Extra fields supported on `step`:
 *   - hideFooter: boolean - hide the primary/Next button. The user's actual
 *     action (clicking the spotlighted button) becomes the advance trigger.
 *   - actionHint: string - short message shown in place of the primary button
 *     (e.g. "Waiting for scan to finish…"). Also shows a pulsing indicator.
 */
export function OnboardingTooltip({
  backProps,
  closeProps,
  continuous,
  index,
  isLastStep,
  primaryProps,
  skipProps,
  step,
  size,
  tooltipProps,
}) {
  const { isRtl, t } = useLocale();
  const BackIcon = isRtl ? ChevronRight : ChevronLeft;
  const hint = step.hideFooter
    ? step.actionHint || t('onboarding.common.waitingForAction')
    : null;

  return (
    <div {...tooltipProps} className={styles.tooltip}>
      <div className={styles.glow} />

      <div className={styles.header}>
        <div className={styles.iconWrap}>
          <Sparkles size={14} />
        </div>
        {step.title && <h3 className={styles.title}>{step.title}</h3>}
        <button
          type="button"
          className={styles.closeBtn}
          {...skipProps}
          aria-label={skipProps['aria-label']}
        >
          <X size={16} />
        </button>
      </div>

      <div className={styles.content}>{step.content}</div>

      <div className={styles.footer}>
        <span className={styles.progress}>
          {index + 1} / {size}
        </span>
        <div className={styles.actions}>
          {index > 0 && !step.hideBackButton && (
            <button type="button" className={styles.secondary} {...backProps}>
              <BackIcon size={14} />
              <span>{backProps.title}</span>
            </button>
          )}
          {step.hideFooter ? (
            <div className={styles.actionHint}>
              <span className={styles.pulseDot} />
              <span>{hint}</span>
            </div>
          ) : continuous ? (
            <button type="button" className={styles.primary} {...primaryProps}>
              {primaryProps.title}
            </button>
          ) : (
            <button type="button" className={styles.primary} {...closeProps}>
              {closeProps.title}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
