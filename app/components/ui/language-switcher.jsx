'use client';

import { useState, useRef, useEffect } from 'react';
import { Globe, Check, ChevronDown } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from './language-switcher.module.css';

export function LanguageSwitcher({ variant = 'default' }) {
  const { locale, setLocale, locales, localeNames, isRtl, t } = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLocaleChange = (newLocale) => {
    setLocale(newLocale);
    setIsOpen(false);
  };

  return (
    <div className={styles.container} ref={dropdownRef}>
      <button
        className={`${styles.button} ${variant === 'compact' ? styles.buttonCompact : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={t('language.changeLanguage')}
        aria-expanded={isOpen}
      >
        <Globe className={styles.icon} />
        {variant !== 'compact' && (
          <>
            <span className={styles.label}>{localeNames[locale]}</span>
            <ChevronDown className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`} />
          </>
        )}
      </button>

      {isOpen && (
        <div className={`${styles.dropdown} ${isRtl ? styles.dropdownRtl : ''}`}>
          {locales.map((loc) => (
            <button
              key={loc}
              className={`${styles.option} ${locale === loc ? styles.optionActive : ''}`}
              onClick={() => handleLocaleChange(loc)}
            >
              <span className={styles.optionLabel}>{localeNames[loc]}</span>
              {locale === loc && <Check className={styles.checkIcon} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
