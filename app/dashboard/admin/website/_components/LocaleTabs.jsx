'use client';

import styles from './LocaleTabs.module.css';

const LOCALES = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'he', name: 'עברית', flag: '🇮🇱' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' }
];

export default function LocaleTabs({ activeLocale, onChange, draftStatus = {} }) {
  return (
    <div className={styles.tabs}>
      {LOCALES.map(locale => (
        <button
          key={locale.code}
          className={`${styles.tab} ${activeLocale === locale.code ? styles.active : ''}`}
          onClick={() => onChange(locale.code)}
        >
          <span className={styles.flag}>{locale.flag}</span>
          <span className={styles.name}>{locale.name}</span>
          {draftStatus[locale.code] && (
            <span className={styles.draftBadge}>Draft</span>
          )}
        </button>
      ))}
    </div>
  );
}
