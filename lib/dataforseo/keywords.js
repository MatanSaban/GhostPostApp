/**
 * DataForSEO Keywords Data API client — Google Ads search volume without
 * needing our own Google Ads developer token.
 *
 * Auth: HTTP Basic — DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD (same creds as
 * the SERP and backlinks clients).
 * Docs: https://docs.dataforseo.com/v3/keywords_data/google_ads/search_volume/live
 *
 * Used as the fallback source in /api/keywords/search-volume when the direct
 * Google Ads API is unconfigured or returns nothing for a keyword. Returns
 * the same Keyword Planner data (volume, competition, CPC), so results are
 * cached in the shared KeywordVolumeCache either way.
 */

import { isDataForSEOConfigured } from './serp.js';

const BASE_URL = 'https://api.dataforseo.com';
const MAX_KEYWORDS_PER_REQUEST = 1000; // API limit per task

function authHeader() {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) {
    throw new Error('DataForSEO credentials missing (DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD)');
  }
  return `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`;
}

function toMicros(bid) {
  return typeof bid === 'number' ? Math.round(bid * 1_000_000) : null;
}

/**
 * Fetch Google Ads search volume data for a batch of keywords.
 *
 * @param {string[]} keywords
 * @param {number} locationCode  DataForSEO location_code (see serp.js getLocationCode)
 * @param {string} languageCode  ISO-639-1, e.g. "he"
 * @returns {Promise<Map<string, { avgMonthlySearches: number, competition: string|null,
 *   competitionIndex: number|null, cpc: number|null,
 *   lowTopOfPageBidMicros: number|null, highTopOfPageBidMicros: number|null }>>}
 *   keyed by lowercased/trimmed keyword. Throws on API/network failure.
 */
export async function fetchSearchVolumeDFS(keywords, locationCode, languageCode) {
  const results = new Map();
  const unique = [...new Set(keywords.map(k => k.toLowerCase().trim()).filter(Boolean))]
    .slice(0, MAX_KEYWORDS_PER_REQUEST);
  if (unique.length === 0) return results;

  const body = [{
    keywords: unique,
    location_code: locationCode,
    language_code: languageCode,
    search_partners: false,
  }];

  const res = await fetch(`${BASE_URL}/v3/keywords_data/google_ads/search_volume/live`, {
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
  if (json.status_code !== 20000) {
    throw new Error(`DataForSEO error ${json.status_code}: ${json.status_message}`);
  }
  const task = Array.isArray(json.tasks) ? json.tasks[0] : null;
  if (!task) return results;
  if (task.status_code !== 20000) {
    throw new Error(`DataForSEO task error ${task.status_code}: ${task.status_message}`);
  }

  // Unlike the SERP API, keywords_data returns the keyword objects directly
  // in tasks[0].result (no items wrapper).
  const items = Array.isArray(task.result) ? task.result : [];
  for (const item of items) {
    if (!item?.keyword) continue;
    results.set(item.keyword.toLowerCase().trim(), {
      avgMonthlySearches: typeof item.search_volume === 'number' ? item.search_volume : 0,
      competition: item.competition || null,
      competitionIndex: typeof item.competition_index === 'number' ? item.competition_index : null,
      cpc: typeof item.cpc === 'number' ? item.cpc : null,
      lowTopOfPageBidMicros: toMicros(item.low_top_of_page_bid),
      highTopOfPageBidMicros: toMicros(item.high_top_of_page_bid),
    });
  }
  return results;
}

export { isDataForSEOConfigured };
