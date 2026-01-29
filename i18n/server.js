// Server-side i18n utilities for Ghost Post Platform
import { cookies } from 'next/headers';
import { defaultLocale, locales, isRtlLocale, getDirection } from './config';

// Dictionary cache for server-side
const dictionaryCache = {};

/**
 * Get dictionary for a locale (server-side)
 */
export async function getDictionary(locale) {
  const validLocale = locales.includes(locale) ? locale : defaultLocale;
  
  if (dictionaryCache[validLocale]) {
    return dictionaryCache[validLocale];
  }
  
  try {
    const dict = await import(`./dictionaries/${validLocale}.json`);
    dictionaryCache[validLocale] = dict.default;
    return dict.default;
  } catch (error) {
    console.error(`Failed to load dictionary for locale: ${validLocale}`, error);
    if (validLocale !== 'en') {
      return getDictionary('en');
    }
    return {};
  }
}

/**
 * Get current locale from cookies (server-side)
 */
export async function getLocale() {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get('ghost-post-locale');
  const locale = localeCookie?.value || defaultLocale;
  return locales.includes(locale) ? locale : defaultLocale;
}

/**
 * Get locale info including dictionary, direction, etc. (server-side)
 */
export async function getLocaleInfo() {
  const locale = await getLocale();
  const dictionary = await getDictionary(locale);
  const direction = getDirection(locale);
  const isRtl = isRtlLocale(locale);
  
  return {
    locale,
    dictionary,
    direction,
    isRtl,
  };
}

/**
 * Create a translation function from a dictionary
 */
export function createTranslator(dictionary) {
  return function t(key, params = {}) {
    const keys = key.split('.');
    let value = dictionary;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        // Return key if translation not found
        return key;
      }
    }
    
    // Handle string interpolation
    if (typeof value === 'string' && Object.keys(params).length > 0) {
      return value.replace(/\{\{(\w+)\}\}/g, (_, paramKey) => {
        return params[paramKey] !== undefined ? params[paramKey] : `{{${paramKey}}}`;
      });
    }
    
    return typeof value === 'string' ? value : key;
  };
}

/**
 * Get translation function for server components
 */
export async function getTranslations() {
  const { dictionary } = await getLocaleInfo();
  return createTranslator(dictionary);
}
