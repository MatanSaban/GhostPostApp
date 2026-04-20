'use client';

import { Sparkles, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from './OnboardingTooltip.module.css';

/**
 * Custom Joyride tooltip that matches the GhostPost visual language.
 * Joyride passes us everything we need as props.
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
  const { isRtl } = useLocale();
  const BackIcon = isRtl ? ChevronRight : ChevronLeft;
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
          {continuous && (
            <button type="button" className={styles.primary} {...primaryProps}>
              {isLastStep ? primaryProps.title : primaryProps.title}
            </button>
          )}
          {!continuous && (
            <button type="button" className={styles.primary} {...closeProps}>
              {closeProps.title}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
