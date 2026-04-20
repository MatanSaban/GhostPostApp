'use client';

import { Play, X, Sparkles } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { ONBOARDING_ORDER, ONBOARDING_STEPS, getStepIndex } from '@/lib/onboarding';
import styles from './BlockingBanner.module.css';

/**
 * Persistent banner + optional dimmed-UI overlay shown during later onboarding
 * steps (from INSTALL_PLUGIN onward). It reminds the user which step is
 * active and lets them resume the tour.
 *
 * Parent decides visibility (`isBannerVisibleAt(step)`); this is dumb render.
 */
export function BlockingBanner({ step, onResume, onSkip }) {
  const { t } = useLocale();

  if (step === ONBOARDING_STEPS.FINISHED) return null;

  const index = getStepIndex(step);
  const total = ONBOARDING_ORDER.length - 1;
  const progress = Math.min(100, Math.round((index / total) * 100));
  const stepKey = `onboarding.steps.${step}`;

  return (
    <>
      <div className={styles.dim} aria-hidden="true" />
      <div className={styles.banner} role="region" aria-label={t('onboarding.banner.ariaLabel')}>
        <div className={styles.glow} />

        <div className={styles.icon}>
          <Sparkles size={18} />
        </div>

        <div className={styles.textBlock}>
          <div className={styles.topRow}>
            <span className={styles.eyebrow}>{t('onboarding.banner.eyebrow')}</span>
            <span className={styles.counter}>
              {index} / {total}
            </span>
          </div>
          <h3 className={styles.title}>{t(`${stepKey}.title`)}</h3>
          <p className={styles.subtitle}>{t(`${stepKey}.subtitle`)}</p>

          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className={styles.actions}>
          <button className={styles.primary} onClick={onResume} type="button">
            <Play size={14} />
            <span>{t('onboarding.banner.resume')}</span>
          </button>
          <button className={styles.secondary} onClick={onSkip} type="button">
            <X size={14} />
            <span>{t('onboarding.banner.skip')}</span>
          </button>
        </div>
      </div>
    </>
  );
}
