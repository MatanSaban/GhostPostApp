// Internationalization configuration for GhostSEO Platform

export const locales = ['en', 'he'];
export const defaultLocale = 'en';

export const localeNames = {
  en: 'English',
  he: 'עברית'
};

export const rtlLocales = ['he'];

export function isRtlLocale(locale) {
  return rtlLocales.includes(locale);
}

export function getDirection(locale) {
  return isRtlLocale(locale) ? 'rtl' : 'ltr';
}

export function getDateLocale(locale) {
  return locale === 'he' ? 'he-IL' : 'en-US';
}
