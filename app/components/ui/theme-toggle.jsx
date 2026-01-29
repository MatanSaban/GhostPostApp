'use client';

import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/app/context/theme-context';
import { useLocale } from '@/app/context/locale-context';
import styles from './theme-toggle.module.css';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const { t } = useLocale();

  return (
    <button
      onClick={toggleTheme}
      className={styles.themeToggle}
      aria-label={theme === 'dark' ? t('theme.switchToLight') : t('theme.switchToDark')}
    >
      {theme === 'dark' ? (
        <Sun className={styles.icon} />
      ) : (
        <Moon className={styles.icon} />
      )}
    </button>
  );
}
