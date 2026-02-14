/**
 * Google Integration OAuth utilities
 * Handles OAuth for Google Analytics & Search Console integrations
 * (separate from login/register OAuth in google-oauth.js)
 */

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

// Integration scopes (GA4 read + Search Console read)
const INTEGRATION_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/webmasters.readonly',
];

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
}

function getOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const baseUrl = getBaseUrl();

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured');
  }

  return {
    clientId,
    clientSecret,
    // Different callback path for integrations
    redirectUri: `${baseUrl}/api/settings/integrations/google/callback`,
  };
}

/**
 * Generate Google OAuth URL for integration (GA + GSC scopes)
 */
export function getIntegrationAuthUrl({ siteId, locale = 'en', loginHint }) {
  const { clientId, redirectUri } = getOAuthConfig();

  const state = Buffer.from(
    JSON.stringify({
      siteId,
      timestamp: Date.now(),
      nonce: Math.random().toString(36).substring(7),
    })
  ).toString('base64');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: INTEGRATION_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent', // Always prompt to get refresh_token
    include_granted_scopes: 'true', // Incremental authorization
    state,
    hl: locale,
  });

  // Pre-fill the Google account if known (skip account-chooser step)
  if (loginHint) {
    params.set('login_hint', loginHint);
  }

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens (integration flow)
 */
export async function exchangeIntegrationCode(code) {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('[Google Integration] Token exchange failed:', error);
    throw new Error(error.error_description || 'Token exchange failed');
  }

  return response.json();
}

/**
 * Refresh an access token using the refresh token
 */
export async function refreshAccessToken(refreshToken) {
  const { clientId, clientSecret } = getOAuthConfig();

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('[Google Integration] Token refresh failed:', error);
    throw new Error('Token refresh failed');
  }

  return response.json();
}

/**
 * Get the email of the Google account used
 */
export async function getGoogleEmail(accessToken) {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.email;
}

/**
 * List GA4 properties accessible by the account
 * Uses the GA Admin API
 */
export async function listGAProperties(accessToken) {
  const res = await fetch(
    'https://analyticsadmin.googleapis.com/v1alpha/accountSummaries',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    console.error('[Google Integration] GA properties fetch failed:', res.status);
    return [];
  }

  const data = await res.json();
  const properties = [];

  for (const account of data.accountSummaries || []) {
    for (const prop of account.propertySummaries || []) {
      properties.push({
        id: prop.property, // e.g. "properties/123456789"
        name: prop.displayName,
        account: account.displayName,
      });
    }
  }

  return properties;
}

/**
 * List Search Console sites accessible by the account
 */
export async function listGSCSites(accessToken) {
  const res = await fetch(
    'https://www.googleapis.com/webmasters/v3/sites',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    const errorBody = await res.text();
    console.error('[Google Integration] GSC sites fetch failed:', res.status, errorBody);
    return [];
  }

  const data = await res.json();
  console.log('[Google Integration] GSC sites response:', JSON.stringify(data));
  return (data.siteEntry || []).map((entry) => ({
    siteUrl: entry.siteUrl,
    permissionLevel: entry.permissionLevel,
  }));
}

/**
 * Parse state and validate timestamp
 */
export function parseIntegrationState(stateParam) {
  try {
    const decoded = Buffer.from(stateParam, 'base64').toString('utf-8');
    const state = JSON.parse(decoded);
    const maxAge = 10 * 60 * 1000; // 10 minutes
    if (Date.now() - state.timestamp > maxAge) {
      throw new Error('State expired');
    }
    return state;
  } catch {
    throw new Error('Invalid state parameter');
  }
}

/**
 * Fetch GA4 analytics data (visitors, pageviews, sessions) for a property
 * Uses GA4 Data API (analyticsdata.googleapis.com)
 * @param {string} accessToken
 * @param {string} propertyId - e.g. "properties/123456789"
 * @param {number|{startDate: string, endDate: string}} daysOrRange - days or { startDate, endDate } YYYY-MM-DD
 */
export async function fetchGAReport(accessToken, propertyId, daysOrRange = 30) {
  const cleanId = propertyId.replace('properties/', '');
  const fmt = (d) => d.toISOString().split('T')[0];

  let startDate, endDate;
  if (typeof daysOrRange === 'object' && daysOrRange.startDate && daysOrRange.endDate) {
    startDate = new Date(daysOrRange.startDate + 'T00:00:00');
    endDate = new Date(daysOrRange.endDate + 'T00:00:00');
  } else {
    const days = typeof daysOrRange === 'number' ? daysOrRange : 30;
    endDate = new Date();
    startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
  }

  const diffMs = endDate.getTime() - startDate.getTime();
  const prevEndDate = new Date(startDate);
  prevEndDate.setDate(prevEndDate.getDate() - 1);
  const prevStartDate = new Date(prevEndDate.getTime() - diffMs);

  // Current period report
  const body = {
    dateRanges: [
      { startDate: fmt(startDate), endDate: fmt(endDate) },
      { startDate: fmt(prevStartDate), endDate: fmt(prevEndDate) },
    ],
    metrics: [
      { name: 'activeUsers' },
      { name: 'screenPageViews' },
      { name: 'averageSessionDuration' },
      { name: 'sessions' },
    ],
  };

  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${cleanId}:runReport`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error('[Google Integration] GA report failed:', res.status, err);
    return null;
  }

  const data = await res.json();
  const rows = data.rows || [];
  
  // Row 0 = current period, Row 1 = previous period (if dateRanges has 2)
  const current = rows[0]?.metricValues?.map(v => Number(v.value)) || [0, 0, 0, 0];
  const previous = rows[1]?.metricValues?.map(v => Number(v.value)) || [0, 0, 0, 0];

  const pct = (cur, prev) => {
    if (!prev) return cur > 0 ? 100 : 0;
    return Math.round(((cur - prev) / prev) * 100);
  };

  const avgDuration = current[2];
  const minutes = Math.floor(avgDuration / 60);
  const seconds = Math.round(avgDuration % 60);

  return {
    visitors: current[0],
    visitorsChange: pct(current[0], previous[0]),
    pageViews: current[1],
    pageViewsChange: pct(current[1], previous[1]),
    avgSessionDuration: `${minutes}:${seconds.toString().padStart(2, '0')}`,
    avgSessionDurationChange: pct(current[2], previous[2]),
    sessions: current[3],
    sessionsChange: pct(current[3], previous[3]),
  };
}

/**
 * Fetch GA4 daily traffic data for chart
 * @param {string} accessToken
 * @param {string} propertyId
 * @param {number|{startDate: string, endDate: string}} daysOrRange - number of days or { startDate, endDate } with YYYY-MM-DD strings
 */
export async function fetchGADailyTraffic(accessToken, propertyId, daysOrRange = 30) {
  const cleanId = propertyId.replace('properties/', '');

  let rangeStart, rangeEnd;
  if (typeof daysOrRange === 'object' && daysOrRange.startDate && daysOrRange.endDate) {
    rangeStart = daysOrRange.startDate;
    rangeEnd = daysOrRange.endDate;
  } else {
    const days = typeof daysOrRange === 'number' ? daysOrRange : 30;
    rangeStart = `${days}daysAgo`;
    rangeEnd = 'today';
  }

  const body = {
    dateRanges: [
      { startDate: rangeStart, endDate: rangeEnd },
    ],
    dimensions: [
      { name: 'date' },
    ],
    metrics: [
      { name: 'activeUsers' },
      { name: 'screenPageViews' },
      { name: 'sessions' },
    ],
    orderBys: [{ dimension: { dimensionName: 'date' } }],
    keepEmptyRows: true,
  };

  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${cleanId}:runReport`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.error('[Google Integration] GA daily traffic failed:', res.status, errBody);
    throw new Error(`GA daily traffic API error ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const data = await res.json();
  const rows = (data.rows || []).map(row => ({
    date: row.dimensionValues[0].value, // YYYYMMDD
    visitors: Number(row.metricValues[0].value),
    pageViews: Number(row.metricValues[1].value),
  }));

  // Fill in missing dates with zero values so the chart always covers the full
  // requested range (GA4 omits dates that have no collected data at all).
  if (typeof daysOrRange === 'object' && daysOrRange.startDate && daysOrRange.endDate) {
    return fillDateRange(rows, daysOrRange.startDate, daysOrRange.endDate);
  } else {
    const days = typeof daysOrRange === 'number' ? daysOrRange : 30;
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    const fmt = d => d.toISOString().slice(0, 10);
    return fillDateRange(rows, fmt(start), fmt(end));
  }
}

/**
 * Fill gaps in a date-sorted array so every date in [startStr, endStr] is present.
 * @param {Array} rows - Rows with YYYYMMDD `.date` field
 * @param {string} startStr - Start date YYYY-MM-DD
 * @param {string} endStr - End date YYYY-MM-DD
 */
function fillDateRange(rows, startStr, endStr) {
  const existing = new Map(rows.map(r => [r.date, r]));
  const result = [];
  const cur = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');
  while (cur <= end) {
    const key = cur.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
    if (existing.has(key)) {
      result.push(existing.get(key));
    } else {
      result.push({ date: key, visitors: 0, pageViews: 0 });
    }
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}

/**
 * Fetch GSC search analytics data (clicks, impressions, CTR, position)
 * @param {string} accessToken
 * @param {string} siteUrl
 * @param {number|{startDate: string, endDate: string}} daysOrRange - days or { startDate, endDate } YYYY-MM-DD
 */
export async function fetchGSCReport(accessToken, siteUrl, daysOrRange = 30) {
  const fmt = (d) => d.toISOString().split('T')[0];

  let startDate, endDate;
  if (typeof daysOrRange === 'object' && daysOrRange.startDate && daysOrRange.endDate) {
    startDate = new Date(daysOrRange.startDate + 'T00:00:00');
    endDate = new Date(daysOrRange.endDate + 'T00:00:00');
  } else {
    const days = typeof daysOrRange === 'number' ? daysOrRange : 30;
    endDate = new Date();
    endDate.setDate(endDate.getDate() - 3); // GSC data has a 2–3 day delay
    startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
  }

  const diffMs = endDate.getTime() - startDate.getTime();
  const prevEndDate = new Date(startDate);
  prevEndDate.setDate(prevEndDate.getDate() - 1);
  const prevStartDate = new Date(prevEndDate.getTime() - diffMs);

  const fetchPeriod = async (start, end) => {
    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: fmt(start),
          endDate: fmt(end),
          dimensions: [],
          rowLimit: 1,
        }),
      }
    );
    if (!res.ok) {
      const err = await res.text();
      console.error('[Google Integration] GSC report failed:', res.status, err);
      return null;
    }
    return res.json();
  };

  const [current, previous] = await Promise.all([
    fetchPeriod(startDate, endDate),
    fetchPeriod(prevStartDate, prevEndDate),
  ]);

  const cur = current?.rows?.[0] || { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  const prev = previous?.rows?.[0] || { clicks: 0, impressions: 0, ctr: 0, position: 0 };

  const pct = (c, p) => {
    if (!p) return c > 0 ? 100 : 0;
    return Math.round(((c - p) / p) * 100);
  };

  return {
    clicks: Math.round(cur.clicks),
    clicksChange: pct(cur.clicks, prev.clicks),
    impressions: Math.round(cur.impressions),
    impressionsChange: pct(cur.impressions, prev.impressions),
    ctr: (cur.ctr * 100).toFixed(1),
    ctrChange: pct(cur.ctr, prev.ctr),
    position: cur.position?.toFixed(1) || '0',
    positionChange: -pct(cur.position, prev.position), // lower is better
  };
}

/**
 * Fetch GSC top pages
 * @param {string} accessToken
 * @param {string} siteUrl
 * @param {number|{startDate: string, endDate: string}} daysOrRange - days or { startDate, endDate } YYYY-MM-DD
 */
export async function fetchGSCTopPages(accessToken, siteUrl, daysOrRange = 30) {
  const fmt = (d) => d.toISOString().split('T')[0];

  let startDate, endDate;
  if (typeof daysOrRange === 'object' && daysOrRange.startDate && daysOrRange.endDate) {
    startDate = new Date(daysOrRange.startDate + 'T00:00:00');
    endDate = new Date(daysOrRange.endDate + 'T00:00:00');
  } else {
    const days = typeof daysOrRange === 'number' ? daysOrRange : 30;
    endDate = new Date();
    endDate.setDate(endDate.getDate() - 3);
    startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
  }

  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate: fmt(startDate),
        endDate: fmt(endDate),
        dimensions: ['page'],
        rowLimit: 10,
        orderBy: [{ fieldName: 'clicks', sortOrder: 'DESCENDING' }],
      }),
    }
  );

  if (!res.ok) {
    console.error('[Google Integration] GSC top pages failed:', res.status);
    return [];
  }

  const data = await res.json();
  return (data.rows || []).map(row => ({
    page: row.keys[0],
    clicks: Math.round(row.clicks),
    impressions: Math.round(row.impressions),
    ctr: (row.ctr * 100).toFixed(1),
    position: row.position?.toFixed(1),
  }));
}

/**
 * Fetch GSC top search queries (keywords)
 * @param {string} accessToken
 * @param {string} siteUrl
 * @param {number|{startDate: string, endDate: string}} daysOrRange - days or { startDate, endDate } YYYY-MM-DD
 */
export async function fetchGSCTopQueries(accessToken, siteUrl, daysOrRange = 30) {
  const fmt = (d) => d.toISOString().split('T')[0];

  let startDate, endDate;
  if (typeof daysOrRange === 'object' && daysOrRange.startDate && daysOrRange.endDate) {
    startDate = new Date(daysOrRange.startDate + 'T00:00:00');
    endDate = new Date(daysOrRange.endDate + 'T00:00:00');
  } else {
    const days = typeof daysOrRange === 'number' ? daysOrRange : 30;
    endDate = new Date();
    endDate.setDate(endDate.getDate() - 3);
    startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
  }

  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate: fmt(startDate),
        endDate: fmt(endDate),
        dimensions: ['query'],
        rowLimit: 25,
      }),
    }
  );

  if (!res.ok) {
    console.error('[Google Integration] GSC top queries failed:', res.status);
    return [];
  }

  const data = await res.json();
  return (data.rows || []).map(row => ({
    query: row.keys[0],
    clicks: Math.round(row.clicks),
    impressions: Math.round(row.impressions),
    ctr: (row.ctr * 100).toFixed(1),
    position: row.position?.toFixed(1),
  }));
}
