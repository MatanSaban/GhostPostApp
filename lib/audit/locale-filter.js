/**
 * Locale Filter for Site Audit URL Discovery
 *
 * Filters out URLs that belong to alternate language versions of a site.
 * Keeps only URLs in the site's default/primary language.
 *
 * Detection patterns:
 * - Path prefixes: /en/, /fr/, /es/, /ar/, /de/, etc.
 * - Subdomain variants: en.example.com, fr.example.com
 * - Query parameters: ?lang=en, ?hl=fr
 *
 * The site's content language (from Site.contentLanguage) is used to
 * determine which URLs are "default" and should be kept.
 */

// ISO 639-1 language codes (2-letter)
const LANG_CODES = new Set([
  'aa','ab','af','ak','am','an','ar','as','av','ay','az',
  'ba','be','bg','bh','bi','bm','bn','bo','br','bs',
  'ca','ce','ch','co','cr','cs','cu','cv','cy',
  'da','de','dv','dz',
  'ee','el','en','eo','es','et','eu',
  'fa','ff','fi','fj','fo','fr','fy',
  'ga','gd','gl','gn','gu','gv',
  'ha','he','hi','ho','hr','ht','hu','hy',
  'ia','id','ie','ig','ii','ik','io','is','it','iu',
  'ja','jv',
  'ka','kg','ki','kj','kk','kl','km','kn','ko','kr','ks','ku','kv','kw','ky',
  'la','lb','lg','li','ln','lo','lt','lu','lv',
  'mg','mh','mi','mk','ml','mn','mr','ms','mt','my',
  'na','nb','nd','ne','ng','nl','nn','no','nr','nv','ny',
  'oc','oj','om','or','os',
  'pa','pi','pl','ps','pt',
  'qu',
  'rm','rn','ro','ru','rw',
  'sa','sc','sd','se','sg','si','sk','sl','sm','sn','so','sq','sr','ss','st','su','sv','sw',
  'ta','te','tg','th','ti','tk','tl','tn','to','tr','ts','tt','tw','ty',
  'ug','uk','ur','uz',
  've','vi','vo',
  'wa','wo',
  'xh',
  'yi','yo',
  'za','zh','zu',
]);

// Extended locale patterns (xx-YY or xx_YY)
const LOCALE_REGEX = /^([a-z]{2})[-_]([a-z]{2,4})$/i;

/**
 * Check if a path segment looks like a language code.
 * Matches: "en", "fr", "he", "pt-br", "zh-tw", "en_US"
 */
function isLangSegment(segment) {
  const lower = segment.toLowerCase();
  if (LANG_CODES.has(lower)) return lower;
  const m = lower.match(LOCALE_REGEX);
  if (m && LANG_CODES.has(m[1])) return m[1];
  return null;
}

/**
 * Extract the language from a URL if it contains a language path prefix.
 * e.g., "https://example.com/en/about" → "en"
 *       "https://example.com/about" → null
 */
function getUrlLangFromPath(url) {
  try {
    const pathname = new URL(url).pathname;
    // First path segment after /
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length === 0) return null;
    return isLangSegment(segments[0]);
  } catch {
    return null;
  }
}

/**
 * Extract the language from a URL subdomain.
 * e.g., "https://en.example.com/about" → "en"
 *       "https://www.example.com/about" → null
 */
function getUrlLangFromSubdomain(url, baseDomain) {
  try {
    const hostname = new URL(url).hostname;
    const baseHost = new URL(baseDomain.startsWith('http') ? baseDomain : `https://${baseDomain}`).hostname;

    // Remove www from both for comparison
    const cleanHost = hostname.replace(/^www\./, '');
    const cleanBase = baseHost.replace(/^www\./, '');

    if (cleanHost === cleanBase) return null;

    // Check if hostname is subdomain.basedomain
    if (cleanHost.endsWith(`.${cleanBase}`)) {
      const sub = cleanHost.slice(0, -(cleanBase.length + 1));
      return isLangSegment(sub);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Extract the language from URL query parameters.
 * Checks: ?lang=xx, ?hl=xx, ?locale=xx
 */
function getUrlLangFromQuery(url) {
  try {
    const params = new URL(url).searchParams;
    for (const key of ['lang', 'hl', 'locale', 'language']) {
      const val = params.get(key);
      if (val) {
        const lang = isLangSegment(val);
        if (lang) return lang;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Determines the detected language of a URL, if any.
 * Returns the 2-letter language code or null if no language indicator found.
 */
export function detectUrlLanguage(url, baseUrl) {
  return getUrlLangFromPath(url)
    || getUrlLangFromSubdomain(url, baseUrl)
    || getUrlLangFromQuery(url);
}

/**
 * Check if a URL belongs to an alternate (non-default) language version of the site.
 *
 * @param {string} url - The URL to check
 * @param {string} baseUrl - The site's base URL
 * @param {string|null} contentLanguage - The site's content language code (e.g., "he", "en")
 * @returns {boolean} True if URL should be EXCLUDED (it's an alternate language)
 */
export function isAlternateLanguageUrl(url, baseUrl, contentLanguage) {
  const detectedLang = detectUrlLanguage(url, baseUrl);

  // No language indicator in URL — keep it (it's the default)
  if (!detectedLang) return false;

  // If we know the site's content language, keep URLs matching it
  if (contentLanguage) {
    const siteLang = contentLanguage.toLowerCase().slice(0, 2);
    return detectedLang !== siteLang;
  }

  // No content language set — any URL with a language prefix is suspect,
  // but we keep it to avoid false positives
  return false;
}

/**
 * Filter a list of URLs to only keep default-language URLs.
 *
 * @param {string[]} urls - URLs to filter
 * @param {string} baseUrl - The site's base URL
 * @param {string|null} contentLanguage - The site's content language code
 * @returns {string[]} Filtered URLs (default language only)
 */
export function filterToDefaultLanguage(urls, baseUrl, contentLanguage) {
  if (!contentLanguage) return urls; // Can't filter without knowing the language
  return urls.filter(url => !isAlternateLanguageUrl(url, baseUrl, contentLanguage));
}
