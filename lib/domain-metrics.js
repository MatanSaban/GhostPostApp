/**
 * Domain Metrics Fetcher
 * Fetches DA (Authority Score), DR (Domain Rating), and monthly organic traffic
 * from SEMrush and Ahrefs APIs. Falls back gracefully if keys are missing.
 *
 * Env vars required:
 *   SEMRUSH_API_KEY   – SEMrush API key  (provides Authority Score as DA + organic traffic)
 *   AHREFS_API_TOKEN  – Ahrefs API token (provides Domain Rating + organic traffic)
 */

const SEMRUSH_API_KEY = process.env.SEMRUSH_API_KEY;
const AHREFS_API_TOKEN = process.env.AHREFS_API_TOKEN;

/**
 * Master toggle – set ENABLE_DOMAIN_METRICS=true in .env to activate.
 * When false the API returns immediately and the UI lets users type manually.
 */
export function isMetricsEnabled() {
  return process.env.ENABLE_DOMAIN_METRICS === 'true';
}

/**
 * Fetch SEMrush domain overview
 * Returns { authorityScore, organicTraffic } or null
 * API: https://developer.semrush.com/api/v3/analytics/domain-overview/
 */
async function fetchSemrush(domain) {
  if (!SEMRUSH_API_KEY) return null;

  try {
    // SEMrush Analytics API – domain_rank report
    // Columns: Dn=domain, Rk=rank, Or=organic keywords, Ot=organic traffic, Ac=Adwords cost
    const url = new URL('https://api.semrush.com/');
    url.searchParams.set('type', 'domain_rank');
    url.searchParams.set('key', SEMRUSH_API_KEY);
    url.searchParams.set('export_columns', 'Dn,Rk,Or,Ot');
    url.searchParams.set('domain', domain);
    url.searchParams.set('database', 'us');

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
    const text = await res.text();

    if (!res.ok || text.startsWith('ERROR')) {
      console.warn('SEMrush API error:', text.substring(0, 200));
      return null;
    }

    // Response is CSV: header line + data line
    const lines = text.trim().split('\n');
    if (lines.length < 2) return null;

    const headers = lines[0].split(';');
    const values = lines[1].split(';');
    const data = {};
    headers.forEach((h, i) => { data[h.trim()] = values[i]?.trim(); });

    return {
      authorityScore: data.Rk ? parseInt(data.Rk, 10) : null,
      organicTraffic: data.Ot ? parseInt(data.Ot, 10) : null,
    };
  } catch (err) {
    console.warn('SEMrush fetch failed:', err.message);
    return null;
  }
}

/**
 * Fetch SEMrush Authority Score via the v3 API (if available)
 * Newer endpoint that directly provides Authority Score (0-100)
 */
async function fetchSemrushAuthority(domain) {
  if (!SEMRUSH_API_KEY) return null;

  try {
    const url = `https://api.semrush.com/analytics/v1/?type=domain_rank&key=${SEMRUSH_API_KEY}&export_columns=Dn,As,Ot&domain=${domain}&database=us`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const text = await res.text();

    if (!res.ok || text.startsWith('ERROR')) return null;

    const lines = text.trim().split('\n');
    if (lines.length < 2) return null;

    const headers = lines[0].split(';');
    const values = lines[1].split(';');
    const data = {};
    headers.forEach((h, i) => { data[h.trim()] = values[i]?.trim(); });

    return {
      authorityScore: data.As ? parseInt(data.As, 10) : null,
      organicTraffic: data.Ot ? parseInt(data.Ot, 10) : null,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch Ahrefs Domain Rating
 * Returns { domainRating, organicTraffic } or null
 * API: https://docs.ahrefs.com/reference/domain-rating
 */
async function fetchAhrefs(domain) {
  if (!AHREFS_API_TOKEN) return null;

  try {
    // Ahrefs API v3 – Domain Rating
    const url = `https://api.ahrefs.com/v3/site-explorer/domain-rating?target=${encodeURIComponent(domain)}&output=json`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${AHREFS_API_TOKEN}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn('Ahrefs API error:', res.status);
      return null;
    }

    const data = await res.json();
    return {
      domainRating: data.domain_rating != null ? Math.round(data.domain_rating) : null,
    };
  } catch (err) {
    console.warn('Ahrefs fetch failed:', err.message);
    return null;
  }
}

/**
 * Fetch Ahrefs organic traffic estimate
 */
async function fetchAhrefsTraffic(domain) {
  if (!AHREFS_API_TOKEN) return null;

  try {
    const url = `https://api.ahrefs.com/v3/site-explorer/metrics?target=${encodeURIComponent(domain)}&output=json&mode=domain`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${AHREFS_API_TOKEN}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return {
      organicTraffic: data.metrics?.organic?.traffic != null
        ? Math.round(data.metrics.organic.traffic)
        : null,
    };
  } catch {
    return null;
  }
}

/**
 * Main function: get domain metrics from all available sources
 * @param {string} domain - e.g. "example.com"
 * @returns {{ domainAuthority: number|null, domainRating: number|null, monthlyTraffic: number|null, sources: string[] }}
 */
export async function getDomainMetrics(domain) {
  if (!domain) {
    return { domainAuthority: null, domainRating: null, monthlyTraffic: null, sources: [] };
  }

  // Clean the domain
  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').trim();

  const sources = [];
  let domainAuthority = null;
  let domainRating = null;
  let monthlyTraffic = null;

  // Fetch from both APIs in parallel
  const [semrushData, semrushAuth, ahrefsData, ahrefsTraffic] = await Promise.all([
    fetchSemrush(cleanDomain),
    fetchSemrushAuthority(cleanDomain),
    fetchAhrefs(cleanDomain),
    fetchAhrefsTraffic(cleanDomain),
  ]);

  // SEMrush: Authority Score → DA, organic traffic
  if (semrushAuth?.authorityScore != null) {
    domainAuthority = semrushAuth.authorityScore;
    sources.push('semrush');
  } else if (semrushData?.authorityScore != null) {
    domainAuthority = semrushData.authorityScore;
    sources.push('semrush');
  }

  if (semrushData?.organicTraffic != null || semrushAuth?.organicTraffic != null) {
    monthlyTraffic = semrushAuth?.organicTraffic ?? semrushData?.organicTraffic;
  }

  // Ahrefs: Domain Rating, organic traffic (prefer Ahrefs traffic if SEMrush didn't provide)
  if (ahrefsData?.domainRating != null) {
    domainRating = ahrefsData.domainRating;
    if (!sources.includes('ahrefs')) sources.push('ahrefs');
  }

  if (ahrefsTraffic?.organicTraffic != null && monthlyTraffic == null) {
    monthlyTraffic = ahrefsTraffic.organicTraffic;
    if (!sources.includes('ahrefs')) sources.push('ahrefs');
  }

  return { domainAuthority, domainRating, monthlyTraffic, sources };
}

/**
 * Check which metric providers are configured
 */
export function getConfiguredProviders() {
  const providers = [];
  if (SEMRUSH_API_KEY) providers.push('semrush');
  if (AHREFS_API_TOKEN) providers.push('ahrefs');
  return providers;
}
