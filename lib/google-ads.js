/**
 * Google Ads Keyword Planner API Client
 * 
 * Uses platform-level credentials (not per-user) to fetch
 * real search volume data for keywords via the Keyword Planner API.
 */

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_ADS_API_VERSION = 'v23';

function getConfig() {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID;
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!developerToken || !customerId || !refreshToken || !clientId || !clientSecret) {
    return null;
  }

  const loginCustomerId = process.env.GOOGLE_ADS_ADMIN_CUSTOMER_ID;

  return { developerToken, customerId, refreshToken, clientId, clientSecret, loginCustomerId };
}

// Simple in-memory token cache for the platform token
let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Refresh the platform's Google Ads OAuth token
 */
async function getAccessToken() {
  const config = getConfig();
  if (!config) throw new Error('Google Ads API not configured');

  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Google Ads token refresh failed:', err);
    throw new Error('Failed to refresh Google Ads token');
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in * 1000);
  return cachedToken;
}

/**
 * Check if Google Ads API is configured
 */
export function isGoogleAdsConfigured() {
  return getConfig() !== null;
}

/**
 * Fetch search volume for a batch of keywords
 * 
 * @param {string[]} keywords - Array of keyword strings (max 20 per call)
 * @param {string} [geo='IL'] - ISO 3166-1 alpha-2 country code
 * @param {string} [language='1027'] - Google Ads language criterion ID (1027 = Hebrew, 1000 = English)
 * @returns {Promise<Array<{ keyword: string, avgMonthlySearches: number, competition: string, competitionIndex: number, lowTopOfPageBidMicros: number, highTopOfPageBidMicros: number }>>}
 */
export async function getSearchVolume(keywords, geo = 'IL', language = '1027') {
  const config = getConfig();
  if (!config) {
    return null;
  }

  if (!keywords || keywords.length === 0) return [];

  const accessToken = await getAccessToken();
  // Use MCC (admin) customer ID for the API call if available, otherwise use the regular customer ID
  const actingCustomerId = (config.loginCustomerId || config.customerId).replace(/-/g, '');

  const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${actingCustomerId}:generateKeywordIdeas`;

  const body = {
    keywordSeed: {
      keywords: keywords.slice(0, 20),
    },
    geoTargetConstants: [`geoTargetConstants/${getGeoTargetId(geo)}`],
    language: `languageConstants/${language}`,
    keywordPlanNetwork: 'GOOGLE_SEARCH',
    // Only return exact matches for our keywords, not suggestions
    includeAdultKeywords: false,
  };

  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'developer-token': config.developerToken,
    'Content-Type': 'application/json',
  };

  // If using a Manager (MCC) account, set login-customer-id header
  if (config.loginCustomerId) {
    headers['login-customer-id'] = config.loginCustomerId.replace(/-/g, '');
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Google Ads Keyword Planner API error:', err);
    throw new Error(`Keyword Planner API error: ${res.status}`);
  }

  const data = await res.json();
  const results = (data.results || []).map(r => ({
    keyword: r.text,
    avgMonthlySearches: parseInt(r.keywordIdeaMetrics?.avgMonthlySearches) || 0,
    competition: r.keywordIdeaMetrics?.competition || 'UNSPECIFIED',
    competitionIndex: parseInt(r.keywordIdeaMetrics?.competitionIndex) || 0,
    lowTopOfPageBidMicros: parseInt(r.keywordIdeaMetrics?.lowTopOfPageBidMicros) || 0,
    highTopOfPageBidMicros: parseInt(r.keywordIdeaMetrics?.highTopOfPageBidMicros) || 0,
  }));

  return results;
}

/**
 * Batch fetch search volumes for many keywords (handles chunking)
 * 
 * @param {string[]} keywords - Array of keyword strings (any length)
 * @param {string} [geo='IL'] - Country code
 * @param {string} [language='1027'] - Language criterion ID
 * @returns {Promise<Map<string, { avgMonthlySearches: number, competition: string, competitionIndex: number }>>}
 */
export async function batchGetSearchVolume(keywords, geo = 'IL', language = '1027') {
  if (!isGoogleAdsConfigured()) return null;
  if (!keywords || keywords.length === 0) return new Map();

  const uniqueKeywords = [...new Set(keywords.map(k => k.toLowerCase().trim()))];
  const results = new Map();
  const BATCH_SIZE = 20;

  for (let i = 0; i < uniqueKeywords.length; i += BATCH_SIZE) {
    const batch = uniqueKeywords.slice(i, i + BATCH_SIZE);
    try {
      const batchResults = await getSearchVolume(batch, geo, language);
      if (batchResults) {
        for (const r of batchResults) {
          results.set(r.keyword.toLowerCase().trim(), r);
        }
      }
    } catch (err) {
      console.error(`Google Ads batch ${i / BATCH_SIZE + 1} failed:`, err.message);
      // Continue with remaining batches
    }
  }

  return results;
}

/**
 * Map ISO country codes to Google Ads Geo Target IDs
 * See: https://developers.google.com/google-ads/api/reference/data/geotargets
 */
function getGeoTargetId(countryCode) {
  const geoMap = {
    'IL': '2376',     // Israel
    'US': '2840',     // United States
    'GB': '2826',     // United Kingdom
    'CA': '2124',     // Canada
    'AU': '2036',     // Australia
    'DE': '2276',     // Germany
    'FR': '2250',     // France
    'ES': '2724',     // Spain
    'IT': '2380',     // Italy
    'BR': '2076',     // Brazil
    'IN': '2356',     // India
    'NL': '2528',     // Netherlands
    'SE': '2752',     // Sweden
    'NO': '2578',     // Norway
    'DK': '2208',     // Denmark
    'FI': '2246',     // Finland
    'PL': '2616',     // Poland
    'JP': '2392',     // Japan
  };
  return geoMap[countryCode?.toUpperCase()] || '2840'; // Default to US
}

/**
 * Map ISO country code to Google Ads language criterion ID
 */
export function getLanguageId(langCode) {
  const langMap = {
    'he': '1027',   // Hebrew
    'en': '1000',   // English
    'ar': '1019',   // Arabic
    'de': '1001',   // German
    'fr': '1002',   // French
    'es': '1003',   // Spanish
    'it': '1004',   // Italian
    'pt': '1014',   // Portuguese
    'nl': '1010',   // Dutch
    'sv': '1015',   // Swedish
    'no': '1013',   // Norwegian
    'da': '1009',   // Danish
    'fi': '1011',   // Finnish
    'pl': '1030',   // Polish
    'ja': '1005',   // Japanese
    'ru': '1031',   // Russian
  };
  return langMap[langCode?.toLowerCase()] || '1000'; // Default to English
}
