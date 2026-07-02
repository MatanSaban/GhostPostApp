/**
 * DataForSEO SERP API client — live Google rank checks for tracked keywords.
 *
 * Auth: HTTP Basic — DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD (same creds as
 * the backlinks client).
 * Docs: https://docs.dataforseo.com/v3/serp/google/organic/live/regular
 *
 * One live request per keyword (the live endpoint takes a single task), so
 * callers are expected to cache results and cap batch sizes — see
 * /api/keywords/serp-position.
 */

const BASE_URL = 'https://api.dataforseo.com';
const SERP_DEPTH = 100; // top-100 results; beyond that we report "not found"

export function isDataForSEOConfigured() {
  return Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
}

function authHeader() {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) {
    throw new Error('DataForSEO credentials missing (DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD)');
  }
  return `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`;
}

// DataForSEO country location_code (for countries these equal Google's geo
// target constant = 2000 + ISO 3166-1 numeric code). Covers the geos the
// platform targets.
const LOCATION_CODES = {
  IL: 2376, US: 2840, GB: 2826, CA: 2124, AU: 2036, NZ: 2554,
  FR: 2250, DE: 2276, ES: 2724, IT: 2380, NL: 2528, BE: 2056, PT: 2620,
  IE: 2372, CH: 2756, AT: 2040, SE: 2752, NO: 2578, DK: 2208, FI: 2246,
  PL: 2616, CZ: 2203, RO: 2642, GR: 2300, HU: 2348, UA: 2804, TR: 2792,
  AE: 2784, SA: 2682, IN: 2356, SG: 2702, JP: 2392, KR: 2410, BR: 2076,
  MX: 2484, AR: 2032, ZA: 2710, RU: 2643,
};

// English labels for the resolved country, shown to the user so they can see
// (and trust) which market a rank check ran against.
const COUNTRY_LABELS = {
  IL: 'Israel', US: 'United States', GB: 'United Kingdom', CA: 'Canada',
  AU: 'Australia', NZ: 'New Zealand', FR: 'France', DE: 'Germany',
  ES: 'Spain', IT: 'Italy', NL: 'Netherlands', BE: 'Belgium',
  PT: 'Portugal', IE: 'Ireland', CH: 'Switzerland', AT: 'Austria',
  SE: 'Sweden', NO: 'Norway', DK: 'Denmark', FI: 'Finland', PL: 'Poland',
  CZ: 'Czechia', RO: 'Romania', GR: 'Greece', HU: 'Hungary', UA: 'Ukraine',
  TR: 'Turkey', AE: 'United Arab Emirates', SA: 'Saudi Arabia', IN: 'India',
  SG: 'Singapore', JP: 'Japan', KR: 'South Korea', BR: 'Brazil',
  MX: 'Mexico', AR: 'Argentina', ZA: 'South Africa', RU: 'Russia',
};

// Free-text → ISO-2. The site-profile interview stores whatever the user (or
// the AI) wrote, so an answer of "Israel" / "ישראל" / "ISR" must all resolve.
// Includes English + Hebrew country names, ISO-3 codes, and aliases.
const NAME_TO_ISO2 = {
  israel: 'IL', ישראל: 'IL', isr: 'IL',
  'united states': 'US', usa: 'US', america: 'US', 'ארצות הברית': 'US', us: 'US',
  'united kingdom': 'GB', uk: 'GB', britain: 'GB', england: 'GB', 'בריטניה': 'GB', 'אנגליה': 'GB', gbr: 'GB',
  canada: 'CA', 'קנדה': 'CA', can: 'CA',
  australia: 'AU', 'אוסטרליה': 'AU', aus: 'AU',
  france: 'FR', 'צרפת': 'FR', fra: 'FR',
  germany: 'DE', 'גרמניה': 'DE', deu: 'DE', ger: 'DE',
  spain: 'ES', 'ספרד': 'ES', esp: 'ES',
  italy: 'IT', 'איטליה': 'IT', ita: 'IT',
  netherlands: 'NL', holland: 'NL', 'הולנד': 'NL', nld: 'NL',
  belgium: 'BE', 'בלגיה': 'BE',
  switzerland: 'CH', 'שווייץ': 'CH', che: 'CH',
  austria: 'AT', 'אוסטריה': 'AT',
  ireland: 'IE', 'אירלנד': 'IE',
  portugal: 'PT', 'פורטוגל': 'PT',
  sweden: 'SE', 'שוודיה': 'SE',
  poland: 'PL', 'פולין': 'PL',
  greece: 'GR', 'יוון': 'GR',
  turkey: 'TR', 'טורקיה': 'TR', tur: 'TR',
  'united arab emirates': 'AE', uae: 'AE', emirates: 'AE', 'איחוד האמירויות': 'AE', dubai: 'AE',
  'saudi arabia': 'SA', 'ערב הסעודית': 'SA',
  india: 'IN', 'הודו': 'IN', ind: 'IN',
  singapore: 'SG', 'סינגפור': 'SG',
  japan: 'JP', 'יפן': 'JP', jpn: 'JP',
  brazil: 'BR', 'ברזיל': 'BR', bra: 'BR',
  mexico: 'MX', 'מקסיקו': 'MX', mex: 'MX',
  'south africa': 'ZA', 'דרום אפריקה': 'ZA',
  russia: 'RU', 'רוסיה': 'RU', rus: 'RU',
};

// ccTLD → ISO-2 (only ccTLDs we have a location_code for). Generic TLDs like
// .com/.org carry no country signal and are intentionally absent.
const TLD_TO_ISO2 = {
  il: 'IL', us: 'US', uk: 'GB', ca: 'CA', au: 'AU', nz: 'NZ', fr: 'FR',
  de: 'DE', es: 'ES', it: 'IT', nl: 'NL', be: 'BE', pt: 'PT', ie: 'IE',
  ch: 'CH', at: 'AT', se: 'SE', no: 'NO', dk: 'DK', fi: 'FI', pl: 'PL',
  cz: 'CZ', ro: 'RO', gr: 'GR', hu: 'HU', ua: 'UA', tr: 'TR', ae: 'AE',
  sa: 'SA', in: 'IN', sg: 'SG', jp: 'JP', kr: 'KR', br: 'BR', mx: 'MX',
  ar: 'AR', za: 'ZA', ru: 'RU',
};

// Language (ISO-639-1) → the country that language most plausibly targets,
// used as a fallback when neither the profile nor the domain names a country.
const LANG_TO_ISO2 = {
  he: 'IL', iw: 'IL', en: 'US', fr: 'FR', de: 'DE', es: 'ES', it: 'IT',
  nl: 'NL', pt: 'PT', pl: 'PL', sv: 'SE', no: 'NO', da: 'DK', fi: 'FI',
  el: 'GR', hu: 'HU', uk: 'UA', tr: 'TR', ar: 'AE', hi: 'IN', ja: 'JP',
  ko: 'KR', ru: 'RU', cs: 'CZ', ro: 'RO',
};

const DEFAULT_LOCATION = 'US'; // only reached when language is also unknown

/**
 * Resolve a site's target geo (ISO-2 country code, e.g. from
 * Site.targetLocations) to a DataForSEO location_code.
 */
export function getLocationCode(geo) {
  return LOCATION_CODES[String(geo || '').toUpperCase()] || LOCATION_CODES[DEFAULT_LOCATION];
}

// Normalize one free-text location answer to an ISO-2 country we support.
function toIso2(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return null;
  // "worldwide"/"global" name no country — let later signals decide.
  if (/^(worldwide|global|international|כל העולם|בינלאומי|עולמי)$/.test(s)) return null;
  if (NAME_TO_ISO2[s]) return NAME_TO_ISO2[s];
  const upper = s.toUpperCase();
  if (LOCATION_CODES[upper]) return upper; // already an ISO-2 we support
  return null;
}

// Extract the ccTLD country from a site URL ("https://x.co.il" → "IL").
function iso2FromTld(siteUrl) {
  let host;
  try { host = new URL(siteUrl).hostname; }
  catch { host = String(siteUrl || '').replace(/^https?:\/\//i, '').split('/')[0]; }
  const tld = host.toLowerCase().split('.').pop();
  return TLD_TO_ISO2[tld] || null;
}

function langKey(contentLanguage) {
  return String(contentLanguage || '').toLowerCase().slice(0, 2);
}

// DataForSEO accepts language_code as a lowercase ISO-639-1 code ("he", "en").
export function getLanguageCode(contentLanguage, geo) {
  const lang = langKey(contentLanguage);
  if (/^[a-z]{2}$/.test(lang)) return lang === 'iw' ? 'he' : lang;
  return geo === 'IL' ? 'he' : 'en';
}

/**
 * Decide which Google market (country + language) a site competes in, in
 * priority order:
 *   1. an explicit answer from the site-profile interview (targetLocations)
 *   2. the domain's ccTLD (.co.il → Israel)
 *   3. the content language's primary country (he → Israel, en → US)
 *   4. a final default
 *
 * Returns everything the SERP call and the UI need, including a human label
 * and which signal won, so the choice is transparent to the user.
 *
 * @returns {{ countryCode: string, locationCode: number, languageCode: string,
 *   label: string, source: 'profile'|'tld'|'language'|'default' }}
 */
export function resolveGeo({ targetLocations, contentLanguage, siteUrl } = {}) {
  let countryCode = null;
  let source = 'default';

  for (const raw of targetLocations || []) {
    const iso = toIso2(raw);
    if (iso) { countryCode = iso; source = 'profile'; break; }
  }
  if (!countryCode) {
    const tld = iso2FromTld(siteUrl);
    if (tld) { countryCode = tld; source = 'tld'; }
  }
  if (!countryCode) {
    const fromLang = LANG_TO_ISO2[langKey(contentLanguage)];
    if (fromLang) { countryCode = fromLang; source = 'language'; }
  }
  if (!countryCode) { countryCode = DEFAULT_LOCATION; source = 'default'; }

  return {
    countryCode,
    locationCode: LOCATION_CODES[countryCode],
    languageCode: getLanguageCode(contentLanguage, countryCode),
    label: COUNTRY_LABELS[countryCode] || countryCode,
    source,
  };
}

// Thrown when DataForSEO rejects a task for lack of account balance (40200).
// Surfaced to the user instead of being swallowed as a generic failure.
export class DataForSEOBillingError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DataForSEOBillingError';
    this.isBilling = true;
  }
}

// Strips scheme/www/path so "https://www.example.com/x" becomes "example.com".
function normalizeHost(url) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return String(url)
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .split('/')[0]
      .toLowerCase() || null;
  }
}

// True when an organic item's domain is the target host or a subdomain of it.
function domainMatches(itemDomain, targetHost) {
  const host = String(itemDomain || '').replace(/^www\./i, '').toLowerCase();
  if (!host || !targetHost) return false;
  return host === targetHost || host.endsWith(`.${targetHost}`);
}

/**
 * Check where `siteUrl`'s domain ranks in Google organic results for one
 * keyword. Returns { position, url } where position is rank_absolute of the
 * site's best organic result, or { position: null, url: null } when the site
 * is not in the top SERP_DEPTH results. Throws on API/network failure.
 */
export async function checkKeywordRank({ keyword, siteUrl, locationCode, languageCode }) {
  const targetHost = normalizeHost(siteUrl);
  if (!targetHost) {
    throw new Error(`Cannot derive target host from site URL: ${siteUrl}`);
  }

  const body = [{
    keyword,
    location_code: locationCode,
    language_code: languageCode,
    device: 'desktop',
    depth: SERP_DEPTH,
  }];

  const res = await fetch(`${BASE_URL}/v3/serp/google/organic/live/regular`, {
    method: 'POST',
    headers: {
      'Authorization': authHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`DataForSEO HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  // DataForSEO wraps every response in a tasks array. A non-zero status_code
  // at either tasks[0] or root level means logical failure even on HTTP 200.
  if (json.status_code !== 20000) {
    if (json.status_code === 40200) throw new DataForSEOBillingError(json.status_message);
    throw new Error(`DataForSEO error ${json.status_code}: ${json.status_message}`);
  }
  const task = Array.isArray(json.tasks) ? json.tasks[0] : null;
  if (!task) return { position: null, url: null };
  if (task.status_code !== 20000) {
    // 40200 Payment Required = account out of balance. The task didn't run, so
    // this isn't "site not found" — bubble it up distinctly.
    if (task.status_code === 40200) throw new DataForSEOBillingError(task.status_message);
    throw new Error(`DataForSEO task error ${task.status_code}: ${task.status_message}`);
  }
  const result = Array.isArray(task.result) ? task.result[0] : null;
  const items = Array.isArray(result?.items) ? result.items : [];

  for (const item of items) {
    if (item.type !== 'organic') continue;
    if (domainMatches(item.domain, targetHost)) {
      // rank_group is the position counting organic results only (what a user
      // scrolling the page sees as "1st, 2nd…"); rank_absolute also counts ads
      // and SERP features, inflating the number. Prefer organic; fall back.
      const pos = typeof item.rank_group === 'number'
        ? item.rank_group
        : (typeof item.rank_absolute === 'number' ? item.rank_absolute : null);
      return { position: pos, url: item.url || null };
    }
  }
  return { position: null, url: null };
}

export const __testables = { normalizeHost, domainMatches, getLocationCode, getLanguageCode, resolveGeo, toIso2, iso2FromTld };
