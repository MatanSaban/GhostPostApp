'use client';

import { CheckCircle2, Sparkles } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useUser } from '@/app/context/user-context';
import styles from './FinishedModal.module.css';

export function FinishedModal({ onClose }) {
  const { t } = useLocale();
  const { user } = useUser();
  const firstName = user?.firstName || '';

  return (
    <div className={styles.backdrop}>
      <div className={styles.modal} role="dialog" aria-modal="true">
        <div className={styles.glow} />

        <div className={styles.iconWrapper}>
          <CheckCircle2 size={40} />
        </div>

        <h2 className={styles.title}>
          {firstName
            ? t('onboarding.finished.titleWithName', { name: firstName })
            : t('onboarding.finished.title')}
        </h2>
        <p className={styles.subtitle}>{t('onboarding.finished.subtitle')}</p>

        <ul className={styles.highlights}>
          <li>{t('onboarding.finished.highlight1')}</li>
          <li>{t('onboarding.finished.highlight2')}</li>
          <li>{t('onboarding.finished.highlight3')}</li>
        </ul>

        <div className={styles.actions}>
          <button className={styles.primaryButton} onClick={onClose}>
            <Sparkles size={16} />
            <span>{t('onboarding.finished.closeButton')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
