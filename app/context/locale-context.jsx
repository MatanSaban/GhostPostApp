'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { locales, defaultLocale, isRtlLocale, getDirection, localeNames } from '@/i18n/config';

const LocaleContext = createContext(undefined);

// Cookie utility functions
function getCookie(name) {
  if (typeof document === 'undefined') return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

function setCookie(name, value, days = 365) {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${value}; expires=${expires}; path=/; SameSite=Lax`;
}

// Dictionary cache
const dictionaryCache = {};

// Fetch dictionary from API (database-driven translations)
async function loadDictionary(locale) {
  if (dictionaryCache[locale]) {
    return dictionaryCache[locale];
  }
  
  try {
    // Try fetching from API (database)
    const res = await fetch(`/api/translations/${locale}`);
    if (res.ok) {
      const dict = await res.json();
      dictionaryCache[locale] = dict;
      return dict;
    }
    throw new Error('API fetch failed');
  } catch (error) {
    console.error(`Failed to load dictionary for locale: ${locale}`, error);
    
    // Fallback to JSON file
    try {
      const dict = await import(`@/i18n/dictionaries/${locale}.json`);
      dictionaryCache[locale] = dict.default;
      return dict.default;
    } catch {
      // Fallback to English
      if (locale !== 'en') {
        return loadDictionary('en');
      }
      return {};
    }
  }
}

export function LocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(defaultLocale);
  const [dictionary, setDictionary] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  const direction = getDirection(locale);
  const isRtl = isRtlLocale(locale);

  // Load dictionary when locale changes
  const loadLocale = useCallback(async (newLocale) => {
    setIsLoading(true);
    const dict = await loadDictionary(newLocale);
    setDictionary(dict);
    setIsLoading(false);
  }, []);

  // Initialize from cookie (syncs with server)
  useEffect(() => {
    setMounted(true);
    const savedLocale = getCookie('ghost-post-locale');
    if (savedLocale && locales.includes(savedLocale)) {
      setLocaleState(savedLocale);
      loadLocale(savedLocale);
    } else {
      loadLocale(defaultLocale);
    }
  }, [loadLocale]);

  // Update document attributes when locale changes
  useEffect(() => {
    if (mounted) {
      document.documentElement.lang = locale;
      document.documentElement.dir = direction;
    }
  }, [locale, direction, mounted]);

  const setLocale = useCallback((newLocale) => {
    if (locales.includes(newLocale)) {
      // Set cookie synchronously so it's available immediately for server requests
      setCookie('ghost-post-locale', newLocale);
      document.documentElement.lang = newLocale;
      document.documentElement.dir = getDirection(newLocale);
      setLocaleState(newLocale);
      loadLocale(newLocale);
    }
  }, [loadLocale]);

  // Force refresh translations from server (clears cache)
  const refreshTranslations = useCallback(async () => {
    // Clear cached dictionary for current locale
    delete dictionaryCache[locale];
    await loadLocale(locale);
  }, [locale, loadLocale]);

  // Translation function
  const t = useCallback((key, params = {}) => {
    const keys = key.split('.');
    let value = dictionary;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        // Return the key if translation not found
        return key;
      }
    }
    
    if (typeof value !== 'string') {
      return key;
    }
    
    // Replace parameters in the string
    let result = value;
    Object.entries(params).forEach(([paramKey, paramValue]) => {
      result = result.replace(new RegExp(`{${paramKey}}`, 'g'), String(paramValue));
    });
    
    return result;
  }, [dictionary]);

  // Prevent flash of wrong direction
  if (!mounted) {
    return null;
  }

  return (
    <LocaleContext.Provider
      value={{
        locale,
        setLocale,
        direction,
        isRtl,
        t,
        dictionary,
        isLoading,
        locales,
        localeNames,
        refreshTranslations,
      }}
    >
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (context === undefined) {
    throw new Error('useLocale must be used within a LocaleProvider');
  }
  return context;
}

// Helper hook for just getting the translation function
export function useTranslation() {
  const { t, locale, direction, isRtl } = useLocale();
  return { t, locale, direction, isRtl };
}
