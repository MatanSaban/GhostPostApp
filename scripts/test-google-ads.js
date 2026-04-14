/**
 * Quick test: Call Google Ads Keyword Planner API with a few Hebrew keywords
 * Usage: node scripts/test-google-ads.js
 */

import 'dotenv/config';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API_VERSION = 'v23';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_ADS_REFRESH_TOKEN;
const DEVELOPER_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
const CUSTOMER_ID = process.env.GOOGLE_ADS_CUSTOMER_ID?.replace(/-/g, '');
const LOGIN_CUSTOMER_ID = process.env.GOOGLE_ADS_ADMIN_CUSTOMER_ID?.replace(/-/g, '');

// Try: if login customer ID exists, use it as the acting customer too
const ACTING_CUSTOMER_ID = LOGIN_CUSTOMER_ID || CUSTOMER_ID;

console.log('\n=== Google Ads API Test ===\n');
console.log('Customer ID:', CUSTOMER_ID);
console.log('Acting Customer ID:', ACTING_CUSTOMER_ID);
console.log('Login (MCC) ID:', LOGIN_CUSTOMER_ID || '(none)');
console.log('Developer Token:', DEVELOPER_TOKEN ? DEVELOPER_TOKEN.substring(0, 8) + '...' : 'MISSING');
console.log('Refresh Token:', REFRESH_TOKEN ? REFRESH_TOKEN.substring(0, 15) + '...' : 'MISSING');
console.log('');

// Step 1: Get access token
console.log('1. Refreshing access token...');
const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: REFRESH_TOKEN,
    grant_type: 'refresh_token',
  }),
});

const tokenData = await tokenRes.json();
if (tokenData.error) {
  console.error('Token refresh FAILED:', tokenData.error, tokenData.error_description);
  process.exit(1);
}
console.log('   Access token obtained ✓\n');

// Step 2: Call Keyword Planner API
const testKeywords = ['שיווק דיגיטלי', 'קידום אתרים', 'בניית אתרים', 'SEO'];
console.log('2. Fetching search volume for:', testKeywords.join(', '));
console.log('');

const url = `https://googleads.googleapis.com/${API_VERSION}/customers/${ACTING_CUSTOMER_ID}:generateKeywordIdeas`;

const headers = {
  'Authorization': `Bearer ${tokenData.access_token}`,
  'developer-token': DEVELOPER_TOKEN,
  'Content-Type': 'application/json',
};
if (LOGIN_CUSTOMER_ID) {
  headers['login-customer-id'] = LOGIN_CUSTOMER_ID;
}

const body = {
  keywordSeed: {
    keywords: testKeywords,
  },
  geoTargetConstants: ['geoTargetConstants/2376'], // Israel
  language: 'languageConstants/1027', // Hebrew
  keywordPlanNetwork: 'GOOGLE_SEARCH',
};

const res = await fetch(url, {
  method: 'POST',
  headers,
  body: JSON.stringify(body),
});

if (!res.ok) {
  const errText = await res.text();
  console.error(`API call FAILED (${res.status}):\n`);
  try {
    const errJson = JSON.parse(errText);
    console.error(JSON.stringify(errJson, null, 2));
  } catch {
    console.error(errText);
  }
  process.exit(1);
}

const data = await res.json();
const results = data.results || [];

console.log(`=== Results: ${results.length} keywords ===\n`);
console.log('Keyword'.padEnd(30), 'Volume'.padStart(10), 'Competition'.padStart(15), 'CPC (USD)'.padStart(12));
console.log('-'.repeat(70));

for (const r of results.slice(0, 20)) {
  const kw = r.text || '?';
  const metrics = r.keywordIdeaMetrics || {};
  const vol = metrics.avgMonthlySearches ?? '-';
  const comp = metrics.competition || '-';
  const cpcHigh = metrics.highTopOfPageBidMicros ? `$${(parseInt(metrics.highTopOfPageBidMicros) / 1_000_000).toFixed(2)}` : '-';
  console.log(kw.padEnd(30), String(vol).padStart(10), comp.padStart(15), cpcHigh.padStart(12));
}

console.log('\n✓ Done');
