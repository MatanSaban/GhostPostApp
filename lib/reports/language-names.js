/**
 * Shared language-name lookup used by both the PDF and the in-platform
 * preview. Accepts a single code or an array of codes; returns either
 * a comma-separated string ("English, Hebrew") or a single name.
 *
 * The label is rendered in the *display* locale (the locale of the
 * preview/PDF), not the language being labeled — so a Hebrew report
 * shows "אנגלית, עברית" while an English one shows "English, Hebrew".
 */

const NAMES = {
  en: { en: 'English', he: 'אנגלית' },
  he: { en: 'Hebrew', he: 'עברית' },
  ar: { en: 'Arabic', he: 'ערבית' },
  fr: { en: 'French', he: 'צרפתית' },
  es: { en: 'Spanish', he: 'ספרדית' },
  de: { en: 'German', he: 'גרמנית' },
  ru: { en: 'Russian', he: 'רוסית' },
  it: { en: 'Italian', he: 'איטלקית' },
  pt: { en: 'Portuguese', he: 'פורטוגזית' },
  nl: { en: 'Dutch', he: 'הולנדית' },
  pl: { en: 'Polish', he: 'פולנית' },
  tr: { en: 'Turkish', he: 'טורקית' },
  ja: { en: 'Japanese', he: 'יפנית' },
  zh: { en: 'Chinese', he: 'סינית' },
  ko: { en: 'Korean', he: 'קוריאנית' },
  uk: { en: 'Ukrainian', he: 'אוקראינית' },
};

function normalizeCode(code) {
  if (!code) return null;
  return String(code).toLowerCase().replace('_', '-').split('-')[0];
}

export function languageNameFromCode(code, displayLocale = 'en') {
  const short = normalizeCode(code);
  if (!short) return null;
  return NAMES[short]?.[displayLocale] || NAMES[short]?.en || code;
}

/**
 * Render an array of codes as a single display string in the chosen
 * locale. Dedupes by normalized short code so passing ['he', 'he-IL']
 * yields one entry.
 */
export function languageNamesFromCodes(codes, displayLocale = 'en') {
  if (!codes) return null;
  const list = Array.isArray(codes) ? codes : [codes];
  const seen = new Set();
  const out = [];
  for (const c of list) {
    const short = normalizeCode(c);
    if (!short || seen.has(short)) continue;
    seen.add(short);
    const name = languageNameFromCode(c, displayLocale);
    if (name) out.push(name);
  }
  return out.length > 0 ? out.join(displayLocale === 'he' ? ', ' : ', ') : null;
}
