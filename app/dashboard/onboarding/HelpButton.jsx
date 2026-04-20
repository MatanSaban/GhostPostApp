'use client';

import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { GuidesCenter } from './GuidesCenter';
import styles from './HelpButton.module.css';

export function HelpButton() {
  const { t } = useLocale();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        className={styles.button}
        onClick={() => setIsOpen(true)}
        aria-label={t('onboarding.helpButton.ariaLabel')}
        title={t('onboarding.helpButton.ariaLabel')}
      >
        <HelpCircle size={20} />
      </button>
      <GuidesCenter isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
