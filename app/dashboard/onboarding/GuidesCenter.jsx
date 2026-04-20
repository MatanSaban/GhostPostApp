'use client';

import { X, PlayCircle } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useOnboarding } from './OnboardingProvider';
import styles from './GuidesCenter.module.css';

export function GuidesCenter({ isOpen, onClose }) {
  const { t } = useLocale();
  const { restart, closeGuide } = useOnboarding();

  if (!isOpen) return null;

  const handleReplayFirstRun = async () => {
    await restart();
    closeGuide();
    onClose();
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>{t('onboarding.guidesCenter.title')}</h2>
          <button className={styles.closeButton} onClick={onClose} aria-label={t('onboarding.common.close')}>
            <X size={20} />
          </button>
        </div>
        <p className={styles.subtitle}>{t('onboarding.guidesCenter.subtitle')}</p>

        <div className={styles.list}>
          <button className={styles.guideItem} onClick={handleReplayFirstRun}>
            <PlayCircle size={20} className={styles.guideIcon} />
            <div className={styles.guideText}>
              <span className={styles.guideTitle}>{t('onboarding.guidesCenter.replayFirstRun')}</span>
              <span className={styles.guideHint}>{t('onboarding.guidesCenter.replayFirstRunHint')}</span>
            </div>
          </button>

          <div className={styles.comingSoon}>
            {t('onboarding.guidesCenter.comingSoon')}
          </div>
        </div>
      </div>
    </div>
  );
}
