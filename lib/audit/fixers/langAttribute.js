/**
 * <html lang="..."> Fix Handler
 *
 * Issue handled: audit.issues.noLangAttribute
 *
 * Theme-template change. WordPress emits this via `language_attributes()` in
 * `header.php`; if it's missing, the theme is using a hardcoded `<html>`.
 * Apply is a no-op.
 */

import { snippet as snippetOutput } from '@/lib/audit/fix-manual-output';
import { localeName } from './_shared';

const LOCALE_TO_LANG = {
  he: 'he',
  en: 'en',
  es: 'es',
  fr: 'fr',
  de: 'de',
};

export async function preview({ site, payload = {}, wpAuto: _wpAuto }) {
  const { locale } = payload;
  const langCode = LOCALE_TO_LANG[locale] || (site.wpLocale?.split('_')[0]) || 'en';
  const langName = localeName(langCode);
  const isRtl = ['he', 'ar', 'fa', 'ur'].includes(langCode);

  return {
    manualOutputs: [snippetOutput({
      title: `Add lang="${langCode}" to the <html> element`,
      why: 'The `lang` attribute tells screen readers which language to pronounce content in, helps browsers offer the right translation, and influences Google\'s language-targeted indexing. Detected language: ' + langName + '.',
      instructions: 'Edit your theme\'s `header.php` and replace the bare `<html>` tag with the snippet below. In a stock WordPress theme, the right way is `<html <?php language_attributes(); ?>>` - that emits the lang attribute automatically based on Settings → General → Site Language.',
      language: 'html',
      code: isRtl
        ? `<html lang="${langCode}" dir="rtl">`
        : `<html lang="${langCode}">`,
      where: 'top of the document, replacing the bare <html> tag',
    })],
    usage: null,
  };
}

export async function apply({ payload = {} }) {
  const fixes = Array.isArray(payload.fixes) ? payload.fixes : [];
  return {
    results: fixes.map((f) => ({
      ...f,
      pushed: false,
      pushError: 'lang attribute lives on the <html> tag in your theme template - see the snippet.',
    })),
    auditUpdated: false,
  };
}
