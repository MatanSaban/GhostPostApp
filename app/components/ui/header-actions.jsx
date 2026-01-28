'use client';

import { ThemeToggle } from '@/app/components/ui/theme-toggle';
import { LanguageSwitcher } from '@/app/components/ui/language-switcher';
import styles from './header-actions.module.css';

export function HeaderActions() {
  return (
    <div className={styles.headerActions}>
      <LanguageSwitcher variant="compact" />
      <ThemeToggle />
    </div>
  );
}
