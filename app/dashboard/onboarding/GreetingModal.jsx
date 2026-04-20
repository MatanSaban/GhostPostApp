'use client';

import { Sparkles, SkipForward } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useUser } from '@/app/context/user-context';
import styles from './GreetingModal.module.css';

const PLACEHOLDER_VIDEO_URL = '';

export function GreetingModal({ onStart, onSkip, isStarting = false }) {
  const { t } = useLocale();
  const { user } = useUser();
  const firstName = user?.firstName || '';

  return (
    <div className={styles.backdrop}>
      <div className={styles.modal} role="dialog" aria-modal="true">
        <div className={styles.glow} />

        <div className={styles.header}>
          <div className={styles.iconWrapper}>
            <Sparkles size={22} />
          </div>
          <div>
            <h2 className={styles.title}>
              {firstName
                ? t('onboarding.greeting.titleWithName', { name: firstName })
                : t('onboarding.greeting.title')}
            </h2>
            <p className={styles.subtitle}>{t('onboarding.greeting.subtitle')}</p>
          </div>
        </div>

        <div className={styles.videoFrame}>
          {PLACEHOLDER_VIDEO_URL ? (
            <video
              className={styles.video}
              src={PLACEHOLDER_VIDEO_URL}
              controls
              playsInline
            />
          ) : (
            <div className={styles.videoPlaceholder}>
              <Sparkles size={28} />
              <span>{t('onboarding.greeting.videoPlaceholder')}</span>
            </div>
          )}
        </div>

        <ul className={styles.highlights}>
          <li>{t('onboarding.greeting.highlight1')}</li>
          <li>{t('onboarding.greeting.highlight2')}</li>
          <li>{t('onboarding.greeting.highlight3')}</li>
        </ul>

        <div className={styles.actions}>
          <button
            className={styles.primaryButton}
            onClick={onStart}
            disabled={isStarting}
          >
            <Sparkles size={16} />
            <span>
              {isStarting
                ? t('onboarding.greeting.starting')
                : t('onboarding.greeting.startTour')}
            </span>
          </button>
          <button className={styles.secondaryButton} onClick={onSkip}>
            <SkipForward size={14} />
            <span>{t('onboarding.greeting.skipForNow')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
