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
  'https://www.googleapis.com/auth/indexing',
];

function getBaseUrl() {
  // BASE_URL is read at runtime (not build time like NEXT_PUBLIC_*)
  return process.env.BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
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
export function getIntegrationAuthUrl({ siteId, locale = 'en', loginHint, fromInterview = false }) {
  const { clientId, redirectUri } = getOAuthConfig();

  const state = Buffer.from(
    JSON.stringify({
      siteId,
      fromInterview,
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
    
    // Provide more context for common errors
    if (error.error === 'invalid_grant') {
      console.error('[Google Integration] CAUSE: Refresh token expired or revoked.');
      console.error('  - If app is in "Testing" mode, tokens expire after 7 days.');
      console.error('  - Solution: Publish the app in Google Cloud Console or re-authorize.');
    }
    
    const err = new Error(`Token refresh failed: ${error.error || 'unknown'}`);
    err.googleError = error;
    throw err;
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

  if (res.status === 401 || res.status === 403) {
    throw new Error(`GA properties auth error ${res.status}`);
  }

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

  if (res.status === 401 || res.status === 403) {
    throw new Error(`GSC sites auth error ${res.status}`);
  }

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
 * List sitemaps submitted to Google Search Console for a site
 * Uses Webmasters API: GET /webmasters/v3/sites/{siteUrl}/sitemaps
 * @param {string} accessToken
 * @param {string} siteUrl - The GSC site URL (e.g., "https://example.com/")
 * @returns {string[]} - Array of sitemap URLs
 */
export async function listGSCSitemaps(accessToken, siteUrl) {
  try {
    const encodedSiteUrl = encodeURIComponent(siteUrl);
    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodedSiteUrl}/sitemaps`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!res.ok) {
      console.log('[Google Integration] GSC sitemaps fetch failed:', res.status);
      return [];
    }

    const data = await res.json();
    const sitemaps = (data.sitemap || [])
      .filter(s => !s.errors || s.errors === 0)
      .map(s => s.path)
      .filter(Boolean);
    
    console.log(`[Google Integration] GSC returned ${sitemaps.length} sitemaps for ${siteUrl}`);
    return sitemaps;
  } catch (e) {
    console.error('[Google Integration] Error listing GSC sitemaps:', e.message);
    return [];
  }
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
export async function fetchGAReport(accessToken, propertyId, daysOrRange = 30, compareRange = null) {
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

  // Use explicit comparison range if provided, otherwise default to previous adjacent period
  let prevStartDate, prevEndDate;
  if (compareRange && compareRange.startDate && compareRange.endDate) {
    prevStartDate = new Date(compareRange.startDate + 'T00:00:00');
    prevEndDate = new Date(compareRange.endDate + 'T00:00:00');
  } else {
    const diffMs = endDate.getTime() - startDate.getTime();
    prevEndDate = new Date(startDate);
    prevEndDate.setDate(prevEndDate.getDate() - 1);
    prevStartDate = new Date(prevEndDate.getTime() - diffMs);
  }

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
    if (res.status === 401 || res.status === 403) {
      throw new Error(`GA report auth error ${res.status}: ${err.slice(0, 200)}`);
    }
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
 * Fetch GA4 monthly activeUsers grouped by yearMonth (up to 12 complete months).
 * Excludes the current partial month.
 * @param {string} accessToken
 * @param {string} propertyId - e.g. "properties/123456789"
 * @param {number} months - how many complete months to fetch (default: 12, max: 12)
 * @returns {Promise<Array<{yearMonth: string, visitors: number}>>} sorted chronologically
 */
export async function fetchGAMonthlyTraffic(accessToken, propertyId, months = 12) {
  const cleanId = propertyId.replace('properties/', '');
  const fmt = (d) => d.toISOString().split('T')[0];

  // End date = last day of previous month (exclude current partial month)
  const now = new Date();
  const endDate = new Date(now.getFullYear(), now.getMonth(), 0); // last day of prev month

  // Start date = 1st of the month N months before endDate
  const startDate = new Date(endDate.getFullYear(), endDate.getMonth() - (months - 1), 1);

  const body = {
    dateRanges: [{ startDate: fmt(startDate), endDate: fmt(endDate) }],
    dimensions: [{ name: 'yearMonth' }],
    metrics: [{ name: 'activeUsers' }],
    orderBys: [{ dimension: { dimensionName: 'yearMonth', orderType: 'ALPHANUMERIC' } }],
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
    console.error('[Google Integration] GA monthly traffic failed:', res.status, err);
    if (res.status === 401 || res.status === 403) {
      throw new Error(`GA monthly traffic auth error ${res.status}: ${err.slice(0, 200)}`);
    }
    return null;
  }

  const data = await res.json();
  const rows = data.rows || [];

  return rows.map(row => ({
    yearMonth: row.dimensionValues[0].value,
    visitors: Number(row.metricValues[0].value) || 0,
  })).sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
}

/**
 * Fetch GA4 daily traffic data for chart
 * @param {string} accessToken
 * @param {string} propertyId
 * @param {number|{startDate: string, endDate: string}} daysOrRange - number of days or { startDate, endDate } with YYYY-MM-DD strings
 */
export async function fetchGADailyTraffic(accessToken, propertyId, daysOrRange = 30, compareRange = null) {
  const cleanId = propertyId.replace('properties/', '');
  const fmt = (d) => d.toISOString().split('T')[0];

  let rangeStart, rangeEnd;
  if (typeof daysOrRange === 'object' && daysOrRange.startDate && daysOrRange.endDate) {
    rangeStart = daysOrRange.startDate;
    rangeEnd = daysOrRange.endDate;
  } else {
    const days = typeof daysOrRange === 'number' ? daysOrRange : 30;
    rangeStart = `${days}daysAgo`;
    rangeEnd = 'today';
  }

  // Resolve comparison dates
  let compStart, compEnd;
  if (compareRange && compareRange.startDate && compareRange.endDate) {
    compStart = compareRange.startDate;
    compEnd = compareRange.endDate;
  } else {
    // Default: same duration right before
    let sDate, eDate;
    if (typeof daysOrRange === 'object') {
      sDate = new Date(daysOrRange.startDate + 'T00:00:00');
      eDate = new Date(daysOrRange.endDate + 'T00:00:00');
    } else {
      const days = typeof daysOrRange === 'number' ? daysOrRange : 30;
      eDate = new Date();
      sDate = new Date();
      sDate.setDate(sDate.getDate() - days);
    }
    const diffMs = eDate.getTime() - sDate.getTime();
    const pEnd = new Date(sDate);
    pEnd.setDate(pEnd.getDate() - 1);
    const pStart = new Date(pEnd.getTime() - diffMs);
    compStart = fmt(pStart);
    compEnd = fmt(pEnd);
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
      { name: 'newUsers' },
      { name: 'engagedSessions' },
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
    sessions: Number(row.metricValues[2].value),
    newUsers: Number(row.metricValues[3]?.value || 0),
    engagedSessions: Number(row.metricValues[4]?.value || 0),
  }));

  // Fill in missing dates with zero values so the chart always covers the full
  // requested range (GA4 omits dates that have no collected data at all).
  let filledRows;
  if (typeof daysOrRange === 'object' && daysOrRange.startDate && daysOrRange.endDate) {
    filledRows = fillDateRange(rows, daysOrRange.startDate, daysOrRange.endDate);
  } else {
    const days = typeof daysOrRange === 'number' ? daysOrRange : 30;
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    filledRows = fillDateRange(rows, fmt(start), fmt(end));
  }

  // ── Also fetch previous-period totals for comparison KPIs ──
  const compBody = {
    dateRanges: [
      { startDate: compStart, endDate: compEnd },
    ],
    metrics: [
      { name: 'activeUsers' },
      { name: 'screenPageViews' },
      { name: 'sessions' },
    ],
  };

  let prevTotals = { visitors: 0, pageViews: 0, sessions: 0 };
  try {
    const compRes = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${cleanId}:runReport`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(compBody),
      }
    );
    if (compRes.ok) {
      const compData = await compRes.json();
      const compRow = compData.rows?.[0];
      if (compRow) {
        prevTotals = {
          visitors: Number(compRow.metricValues[0].value),
          pageViews: Number(compRow.metricValues[1].value),
          sessions: Number(compRow.metricValues[2].value),
        };
      }
    }
  } catch (err) {
    console.error('[GA Daily Traffic] Previous-period comparison failed:', err.message);
  }

  // Sum current period totals
  const curTotals = filledRows.reduce(
    (acc, r) => ({ visitors: acc.visitors + r.visitors, pageViews: acc.pageViews + r.pageViews, sessions: acc.sessions + (r.sessions || 0) }),
    { visitors: 0, pageViews: 0, sessions: 0 }
  );

  const pct = (cur, prev) => {
    if (!prev) return cur > 0 ? 100 : 0;
    return Math.round(((cur - prev) / prev) * 100);
  };

  return {
    rows: filledRows,
    comparison: {
      visitors: curTotals.visitors,
      visitorsChange: pct(curTotals.visitors, prevTotals.visitors),
      pageViews: curTotals.pageViews,
      pageViewsChange: pct(curTotals.pageViews, prevTotals.pageViews),
      sessions: curTotals.sessions,
      sessionsChange: pct(curTotals.sessions, prevTotals.sessions),
      prevVisitors: prevTotals.visitors,
      prevPageViews: prevTotals.pageViews,
      prevSessions: prevTotals.sessions,
    },
  };
}

/**
 * Fetch likely source drivers for a specific spike day in GA4.
 * Returns top source/medium + top landing pages and lift vs previous 7-day baseline.
 * @param {string} accessToken
 * @param {string} propertyId
 * @param {string} dateKey - YYYYMMDD
 */
export async function fetchGASpikeSourceContext(accessToken, propertyId, dateKey) {
  const cleanId = propertyId.replace('properties/', '');
  const apiUrl = `https://analyticsdata.googleapis.com/v1beta/properties/${cleanId}:runReport`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  const toIsoDate = (yyyymmdd) => `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
  const shiftDate = (isoDate, days) => {
    const d = new Date(`${isoDate}T00:00:00`);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  if (!dateKey || dateKey.length !== 8) return null;
  const spikeDate = toIsoDate(dateKey);
  const baselineStart = shiftDate(spikeDate, -7);
  const baselineEnd = shiftDate(spikeDate, -1);

  const bySourceBody = {
    dateRanges: [{ startDate: spikeDate, endDate: spikeDate }],
    dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }],
    metrics: [{ name: 'sessions' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 25,
  };

  const baselineBySourceBody = {
    dateRanges: [{ startDate: baselineStart, endDate: baselineEnd }],
    dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }],
    metrics: [{ name: 'sessions' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 25,
  };

  const byLandingBody = {
    dateRanges: [{ startDate: spikeDate, endDate: spikeDate }],
    dimensions: [{ name: 'landingPagePlusQueryString' }],
    metrics: [{ name: 'sessions' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 5,
  };

  const [sourceRes, baselineRes, landingRes] = await Promise.all([
    fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify(bySourceBody) }),
    fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify(baselineBySourceBody) }).catch(() => null),
    fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify(byLandingBody) }).catch(() => null),
  ]);

  if (!sourceRes.ok) {
    const err = await sourceRes.text().catch(() => '');
    console.error('[Google Integration] GA spike source context failed:', sourceRes.status, err);
    return null;
  }

  const sourceData = await sourceRes.json();
  const baselineData = baselineRes?.ok ? await baselineRes.json() : { rows: [] };
  const landingData = landingRes?.ok ? await landingRes.json() : { rows: [] };

  const baselineMap = new Map();
  for (const row of baselineData.rows || []) {
    const source = row.dimensionValues?.[0]?.value || '(not set)';
    const medium = row.dimensionValues?.[1]?.value || '(not set)';
    const key = `${source}|||${medium}`;
    baselineMap.set(key, Number(row.metricValues?.[0]?.value || 0));
  }

  const currentSources = (sourceData.rows || []).map((row) => {
    const source = row.dimensionValues?.[0]?.value || '(not set)';
    const medium = row.dimensionValues?.[1]?.value || '(not set)';
    const sessions = Number(row.metricValues?.[0]?.value || 0);
    const baselineSessions = baselineMap.get(`${source}|||${medium}`) || 0;
    const baselineDaily = baselineSessions / 7;
    const lift = baselineDaily > 0 ? sessions / baselineDaily : (sessions > 0 ? 999 : 0);
    const delta = sessions - baselineDaily;
    const isDirect = source === '(direct)' || medium === '(none)' || medium === '(not set)';

    return {
      source,
      medium,
      sessions,
      baselineDaily: Math.round(baselineDaily * 10) / 10,
      lift: Math.round(lift * 10) / 10,
      delta: Math.round(delta * 10) / 10,
      isDirect,
    };
  });

  const totalSourceSessions = currentSources.reduce((sum, s) => sum + s.sessions, 0);
  const withShare = currentSources.map((s) => ({
    ...s,
    sharePercent: totalSourceSessions > 0 ? Math.round((s.sessions / totalSourceSessions) * 100) : 0,
  }));

  const nonDirectLifted = [...withShare]
    .filter((s) => !s.isDirect && s.sessions >= 5 && (s.lift >= 1.8 || s.delta >= 10))
    .sort((a, b) => {
      if (b.delta !== a.delta) return b.delta - a.delta;
      return b.lift - a.lift;
    });

  const primarySource = nonDirectLifted[0] || withShare[0] || null;

  const landingPages = (landingData.rows || []).map((row) => {
    const rawPage = row.dimensionValues?.[0]?.value || '/';
    const page = rawPage.split('?')[0] || '/';
    const sessions = Number(row.metricValues?.[0]?.value || 0);
    return { page, sessions };
  });

  const totalLandingSessions = landingPages.reduce((sum, p) => sum + p.sessions, 0);
  const topLandingPages = landingPages.map((p) => ({
    ...p,
    sharePercent: totalLandingSessions > 0 ? Math.round((p.sessions / totalLandingSessions) * 100) : 0,
  }));

  return {
    date: dateKey,
    primarySource,
    topSources: withShare.slice(0, 5),
    topLandingPages,
  };
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
      result.push({ date: key, visitors: 0, pageViews: 0, sessions: 0, newUsers: 0, engagedSessions: 0 });
    }
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}

/**
 * Fetch GA4 page-level metrics for a specific page URL.
 * Returns sessions, engagement rate, conversions, and top traffic sources.
 * @param {string} accessToken
 * @param {string} propertyId - GA4 property ID (e.g. "properties/123456789")
 * @param {string} pagePath - Page path (e.g. "/blog/my-post")
 * @param {number} days - Number of days to look back (default 90)
 * @returns {Promise<{sessions: number, engagementRate: string, conversions: number, topSources: Array<{source: string, medium: string, sessions: number}>} | null>}
 */
export async function fetchGA4PageMetrics(accessToken, propertyId, pagePath, days = 90) {
  const cleanId = propertyId.replace('properties/', '');
  const apiUrl = `https://analyticsdata.googleapis.com/v1beta/properties/${cleanId}:runReport`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  const fmt = (d) => d.toISOString().split('T')[0];
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 1); // GA4 data has ~1 day delay
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - days);

  // Normalize path — strip trailing slash for matching (except root '/')
  const normalizedPath = pagePath.length > 1 && pagePath.endsWith('/') ? pagePath.slice(0, -1) : pagePath;

  // Fetch aggregate metrics (sessions, engagement rate, key events/conversions)
  const aggregateBody = {
    dateRanges: [{ startDate: fmt(startDate), endDate: fmt(endDate) }],
    dimensions: [{ name: 'pagePath' }],
    metrics: [
      { name: 'sessions' },
      { name: 'engagementRate' },
      { name: 'keyEvents' },
    ],
    dimensionFilter: {
      filter: {
        fieldName: 'pagePath',
        stringFilter: { matchType: 'EXACT', value: normalizedPath },
      },
    },
    limit: 1,
  };

  // Fetch top traffic sources for this page
  const sourcesBody = {
    dateRanges: [{ startDate: fmt(startDate), endDate: fmt(endDate) }],
    dimensions: [
      { name: 'pagePath' },
      { name: 'sessionSource' },
      { name: 'sessionMedium' },
    ],
    metrics: [{ name: 'sessions' }],
    dimensionFilter: {
      filter: {
        fieldName: 'pagePath',
        stringFilter: { matchType: 'EXACT', value: normalizedPath },
      },
    },
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 10,
  };

  try {
    const [aggRes, srcRes] = await Promise.all([
      fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify(aggregateBody) }),
      fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify(sourcesBody) }),
    ]);

    if (!aggRes.ok) {
      console.warn(`[fetchGA4PageMetrics] Aggregate request failed: ${aggRes.status}`);
      return null;
    }

    const aggData = await aggRes.json();
    const srcData = srcRes.ok ? await srcRes.json() : { rows: [] };

    const aggRow = aggData.rows?.[0];
    const sessions = aggRow ? Number(aggRow.metricValues?.[0]?.value || 0) : 0;
    const engagementRate = aggRow ? (Number(aggRow.metricValues?.[1]?.value || 0) * 100).toFixed(1) : '0.0';
    const conversions = aggRow ? Number(aggRow.metricValues?.[2]?.value || 0) : 0;

    const topSources = (srcData.rows || []).map(row => ({
      source: row.dimensionValues?.[1]?.value || '(direct)',
      medium: row.dimensionValues?.[2]?.value || '(none)',
      sessions: Number(row.metricValues?.[0]?.value || 0),
    }));

    return { sessions, engagementRate, conversions, topSources };
  } catch (err) {
    console.warn(`[fetchGA4PageMetrics] Failed for ${pagePath}:`, err.message);
    return null;
  }
}

/**
 * Fetch GSC metrics for a specific page URL (clicks, impressions, CTR, position).
 * Returns aggregated data for the last N days plus top queries for the page.
 * @param {string} accessToken
 * @param {string} siteUrl - GSC property URL (e.g. https://example.com)
 * @param {string} pageUrl - Full page URL to get metrics for
 * @param {number} days - Number of days to look back (default 30)
 * @returns {Promise<{clicks: number, impressions: number, ctr: string, position: string, topQueries: Array<{query: string, clicks: number, impressions: number, position: string}>}>}
 */
export async function fetchGSCPageMetrics(accessToken, siteUrl, pageUrl, days = 30) {
  const fmt = (d) => d.toISOString().split('T')[0];
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 3); // GSC data has 2-3 day delay
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - days);

  const baseBody = {
    startDate: fmt(startDate),
    endDate: fmt(endDate),
    dimensionFilterGroups: [{
      filters: [{
        dimension: 'page',
        operator: 'equals',
        expression: pageUrl,
      }],
    }],
  };

  const fetchData = async (body) => {
    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) return null;
    return res.json();
  };

  // Fetch aggregate metrics and top queries in parallel
  const [aggregate, queryData] = await Promise.all([
    fetchData({ ...baseBody, dimensions: [], rowLimit: 1 }),
    fetchData({ ...baseBody, dimensions: ['query'], rowLimit: 10 }),
  ]);

  const agg = aggregate?.rows?.[0] || { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  const topQueries = (queryData?.rows || []).map(row => ({
    query: row.keys[0],
    clicks: Math.round(row.clicks),
    impressions: Math.round(row.impressions),
    position: row.position?.toFixed(1) || '0',
  }));

  return {
    clicks: Math.round(agg.clicks),
    impressions: Math.round(agg.impressions),
    ctr: (agg.ctr * 100).toFixed(1),
    position: agg.position?.toFixed(1) || '0',
    topQueries,
  };
}

/**
 * Fetch GSC search analytics data (clicks, impressions, CTR, position)
 * @param {string} accessToken
 * @param {string} siteUrl
 * @param {number|{startDate: string, endDate: string}} daysOrRange - days or { startDate, endDate } YYYY-MM-DD
 */
export async function fetchGSCReport(accessToken, siteUrl, daysOrRange = 30, compareRange = null) {
  const fmt = (d) => d.toISOString().split('T')[0];

  let startDate, endDate;
  if (typeof daysOrRange === 'object' && daysOrRange.startDate && daysOrRange.endDate) {
    startDate = new Date(daysOrRange.startDate + 'T00:00:00');
    endDate = new Date(daysOrRange.endDate + 'T00:00:00');
  } else {
    const days = typeof daysOrRange === 'number' ? daysOrRange : 30;
    endDate = new Date();
    endDate.setDate(endDate.getDate() - 3); // GSC data has a 2–3 day delay
    startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days); // full N days relative to offset end
  }

  // Use explicit comparison range if provided, otherwise default to previous adjacent period
  let prevStartDate, prevEndDate;
  if (compareRange && compareRange.startDate && compareRange.endDate) {
    prevStartDate = new Date(compareRange.startDate + 'T00:00:00');
    prevEndDate = new Date(compareRange.endDate + 'T00:00:00');
  } else {
    const diffMs = endDate.getTime() - startDate.getTime();
    prevEndDate = new Date(startDate);
    prevEndDate.setDate(prevEndDate.getDate() - 1);
    prevStartDate = new Date(prevEndDate.getTime() - diffMs);
  }

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
      if (res.status === 401 || res.status === 403) {
        throw new Error(`GSC report auth error ${res.status}: ${err.slice(0, 200)}`);
      }
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
export async function fetchGSCTopPages(accessToken, siteUrl, daysOrRange = 30, compareRange = null) {
  const fmt = (d) => d.toISOString().split('T')[0];

  let startDate, endDate;
  if (typeof daysOrRange === 'object' && daysOrRange.startDate && daysOrRange.endDate) {
    startDate = new Date(daysOrRange.startDate + 'T00:00:00');
    endDate = new Date(daysOrRange.endDate + 'T00:00:00');
  } else {
    const days = typeof daysOrRange === 'number' ? daysOrRange : 30;
    endDate = new Date();
    endDate.setDate(endDate.getDate() - 3);
    startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days);
  }

  // Compute comparison period
  let prevStartDate, prevEndDate;
  if (compareRange && compareRange.startDate && compareRange.endDate) {
    prevStartDate = new Date(compareRange.startDate + 'T00:00:00');
    prevEndDate = new Date(compareRange.endDate + 'T00:00:00');
  } else {
    const diffMs = endDate.getTime() - startDate.getTime();
    prevEndDate = new Date(startDate);
    prevEndDate.setDate(prevEndDate.getDate() - 1);
    prevStartDate = new Date(prevEndDate.getTime() - diffMs);
  }

  const fetchPages = async (s, e) => {
    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: fmt(s),
          endDate: fmt(e),
          dimensions: ['page'],
          rowLimit: 10,
          orderBy: [{ fieldName: 'clicks', sortOrder: 'DESCENDING' }],
        }),
      }
    );
    if (!res.ok) {
      console.error('[Google Integration] GSC top pages failed:', res.status);
      if (res.status === 401 || res.status === 403) {
        throw new Error(`GSC top pages auth error ${res.status}`);
      }
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
  };

  const [current, previous] = await Promise.all([
    fetchPages(startDate, endDate),
    fetchPages(prevStartDate, prevEndDate),
  ]);

  // Build a lookup map for previous period by page URL
  const prevMap = new Map(previous.map(r => [r.page, r]));
  const pct = (cur, prev) => {
    if (!prev) return cur > 0 ? 100 : 0;
    return Math.round(((cur - prev) / prev) * 100);
  };

  return current.map(row => {
    const prev = prevMap.get(row.page);
    return {
      ...row,
      clicksChange: pct(row.clicks, prev?.clicks ?? 0),
      impressionsChange: pct(row.impressions, prev?.impressions ?? 0),
      ctrChange: pct(parseFloat(row.ctr), parseFloat(prev?.ctr ?? 0)),
      positionChange: prev ? -pct(parseFloat(row.position), parseFloat(prev.position)) : 100,
    };
  });
}

/**
 * Fetch GSC top search queries (keywords)
 * @param {string} accessToken
 * @param {string} siteUrl
 * @param {number|{startDate: string, endDate: string}} daysOrRange - days or { startDate, endDate } YYYY-MM-DD
 */
export async function fetchGSCTopQueries(accessToken, siteUrl, daysOrRange = 30, compareRange = null) {
  const fmt = (d) => d.toISOString().split('T')[0];

  let startDate, endDate;
  if (typeof daysOrRange === 'object' && daysOrRange.startDate && daysOrRange.endDate) {
    startDate = new Date(daysOrRange.startDate + 'T00:00:00');
    endDate = new Date(daysOrRange.endDate + 'T00:00:00');
  } else {
    const days = typeof daysOrRange === 'number' ? daysOrRange : 30;
    endDate = new Date();
    endDate.setDate(endDate.getDate() - 3);
    startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days);
  }

  // Compute comparison period
  let prevStartDate, prevEndDate;
  if (compareRange && compareRange.startDate && compareRange.endDate) {
    prevStartDate = new Date(compareRange.startDate + 'T00:00:00');
    prevEndDate = new Date(compareRange.endDate + 'T00:00:00');
  } else {
    const diffMs = endDate.getTime() - startDate.getTime();
    prevEndDate = new Date(startDate);
    prevEndDate.setDate(prevEndDate.getDate() - 1);
    prevStartDate = new Date(prevEndDate.getTime() - diffMs);
  }

  const fetchQueries = async (s, e) => {
    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: fmt(s),
          endDate: fmt(e),
          dimensions: ['query'],
          rowLimit: 25,
        }),
      }
    );
    if (!res.ok) {
      console.error('[Google Integration] GSC top queries failed:', res.status);
      if (res.status === 401 || res.status === 403) {
        throw new Error(`GSC top queries auth error ${res.status}`);
      }
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
  };

  const [current, previous] = await Promise.all([
    fetchQueries(startDate, endDate),
    fetchQueries(prevStartDate, prevEndDate),
  ]);

  // Build lookup map for previous period by query string
  const prevMap = new Map(previous.map(r => [r.query, r]));
  const pct = (cur, prev) => {
    if (!prev) return cur > 0 ? 100 : 0;
    return Math.round(((cur - prev) / prev) * 100);
  };

  return current.map(row => {
    const prev = prevMap.get(row.query);
    return {
      ...row,
      clicksChange: pct(row.clicks, prev?.clicks ?? 0),
      impressionsChange: pct(row.impressions, prev?.impressions ?? 0),
      ctrChange: pct(parseFloat(row.ctr), parseFloat(prev?.ctr ?? 0)),
      positionChange: prev ? -pct(parseFloat(row.position), parseFloat(prev.position)) : 100,
    };
  });
}

/**
 * Fetch GSC query+page pairs for cannibalization detection.
 * Uses both 'query' and 'page' dimensions so we can see which pages rank for the same query.
 *
 * @param {string} accessToken
 * @param {string} siteUrl
 * @param {number} days - number of days (default 30)
 * @returns {Promise<Array<{query: string, page: string, clicks: number, impressions: number, ctr: string, position: string}>>}
 */
export async function fetchGSCQueryPagePairs(accessToken, siteUrl, days = 30) {
  const fmt = (d) => d.toISOString().split('T')[0];
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 3);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - days);

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
        dimensions: ['query', 'page'],
        rowLimit: 500,
        orderBy: [{ fieldName: 'impressions', sortOrder: 'DESCENDING' }],
      }),
    }
  );

  if (!res.ok) {
    console.error('[Google Integration] GSC query+page pairs failed:', res.status);
    if (res.status === 401 || res.status === 403) {
      throw new Error(`GSC query+page auth error ${res.status}`);
    }
    return [];
  }

  const data = await res.json();
  return (data.rows || []).map(row => ({
    query: row.keys[0],
    page: row.keys[1],
    clicks: Math.round(row.clicks),
    impressions: Math.round(row.impressions),
    ctr: (row.ctr * 100).toFixed(1),
    position: row.position?.toFixed(1),
  }));
}

/**
 * Fetch GSC data for specific tracked keywords.
 * Batches keywords into groups and queries GSC with regex filters
 * so every tracked keyword gets real position/clicks/impressions/CTR data.
 *
 * @param {string} accessToken
 * @param {string} siteUrl
 * @param {string[]} keywords - list of keyword strings to look up
 * @param {number|{startDate: string, endDate: string}} daysOrRange
 * @param {{startDate: string, endDate: string}|null} compareRange
 * @returns {Promise<Array<{query, clicks, impressions, ctr, position, prevPosition, clicksChange, impressionsChange, ctrChange, positionChange}>>}
 * positionChange: actual rank difference (positive = improved, e.g. +2 means went from rank 5 to 3)
 */
export async function fetchGSCForKeywords(accessToken, siteUrl, keywords = [], daysOrRange = 30, compareRange = null) {
  if (!keywords.length) return [];
  const fmt = (d) => d.toISOString().split('T')[0];

  let startDate, endDate;
  if (typeof daysOrRange === 'object' && daysOrRange.startDate && daysOrRange.endDate) {
    startDate = new Date(daysOrRange.startDate + 'T00:00:00');
    endDate = new Date(daysOrRange.endDate + 'T00:00:00');
  } else {
    const days = typeof daysOrRange === 'number' ? daysOrRange : 30;
    endDate = new Date();
    endDate.setDate(endDate.getDate() - 3);
    startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days);
  }

  let prevStartDate, prevEndDate;
  if (compareRange && compareRange.startDate && compareRange.endDate) {
    prevStartDate = new Date(compareRange.startDate + 'T00:00:00');
    prevEndDate = new Date(compareRange.endDate + 'T00:00:00');
  } else {
    const diffMs = endDate.getTime() - startDate.getTime();
    prevEndDate = new Date(startDate);
    prevEndDate.setDate(prevEndDate.getDate() - 1);
    prevStartDate = new Date(prevEndDate.getTime() - diffMs);
  }

  // Escape regex special chars in keywords  
  const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Batch keywords into groups of 20 to stay within regex length limits
  const BATCH_SIZE = 20;
  const batches = [];
  for (let i = 0; i < keywords.length; i += BATCH_SIZE) {
    batches.push(keywords.slice(i, i + BATCH_SIZE));
  }

  const fetchBatch = async (batch, s, e) => {
    const regexPattern = batch.map(kw => `^${escapeRegex(kw)}$`).join('|');
    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: fmt(s),
          endDate: fmt(e),
          dimensions: ['query'],
          rowLimit: batch.length,
          dimensionFilterGroups: [{
            filters: [{
              dimension: 'query',
              operator: 'includingRegex',
              expression: regexPattern,
            }],
          }],
        }),
      }
    );
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error(`GSC tracked keywords auth error ${res.status}`);
      }
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
  };

  // Fetch all batches for current + previous periods in parallel
  const [currentBatches, previousBatches] = await Promise.all([
    Promise.all(batches.map(batch => fetchBatch(batch, startDate, endDate))),
    Promise.all(batches.map(batch => fetchBatch(batch, prevStartDate, prevEndDate))),
  ]);

  const current = currentBatches.flat();
  const previous = previousBatches.flat();
  const prevMap = new Map(previous.map(r => [r.query, r]));

  const pct = (cur, prev) => {
    if (!prev) return cur > 0 ? 100 : 0;
    return Math.round(((cur - prev) / prev) * 100);
  };

  return current.map(row => {
    const prev = prevMap.get(row.query);
    const curPosRaw = parseFloat(row.position);
    const prevPosRaw = prev ? parseFloat(prev.position) : null;
    // Round positions FIRST, then calculate the rank difference
    // This avoids showing "dropped 1 rank from #10 to #10" when decimals differ but rounds are same
    const curRank = Math.round(curPosRaw);
    const prevRank = prevPosRaw != null ? Math.round(prevPosRaw) : null;
    // positionChange is the actual rank difference (positive = improved, e.g., went from 5 to 3 = +2)
    const positionChange = prevRank != null ? prevRank - curRank : null;
    return {
      ...row,
      prevPosition: prevRank, // rounded rank (integer)
      clicksChange: pct(row.clicks, prev?.clicks ?? 0),
      impressionsChange: pct(row.impressions, prev?.impressions ?? 0),
      ctrChange: pct(parseFloat(row.ctr), parseFloat(prev?.ctr ?? 0)),
      positionChange, // actual rank difference, not percentage
    };
  });
}

// ── AI Traffic Section ──────────────────────────────────────────────────
const AI_SOURCE_REGEX = '(chatgpt|openai|bing|copilot|gemini|bard|claude|anthropic|perplexity|poe)';

/**
 * Fetch GSC queries for pages that receive AI traffic.
 * Cross-references GA4 AI landing pages with GSC query data to find
 * the real keywords AI engines are citing your site for.
 *
 * @param {string} accessToken
 * @param {string} siteUrl - GSC property URL (e.g. https://example.com)
 * @param {number|{startDate: string, endDate: string}} daysOrRange
 * @param {string[]} aiPagePaths - landing page paths from GA4 AI traffic (e.g. ['/blog/foo', '/services/bar'])
 * @returns {Promise<Array<{query, page, clicks, impressions, ctr, position}>>}
 */
export async function fetchGSCQueriesForAIPages(accessToken, siteUrl, daysOrRange = 30, aiPagePaths = []) {
  if (!aiPagePaths.length) return [];
  const fmt = (d) => d.toISOString().split('T')[0];

  let startDate, endDate;
  if (typeof daysOrRange === 'object' && daysOrRange.startDate && daysOrRange.endDate) {
    startDate = new Date(daysOrRange.startDate + 'T00:00:00');
    endDate = new Date(daysOrRange.endDate + 'T00:00:00');
  } else {
    const days = typeof daysOrRange === 'number' ? daysOrRange : 30;
    endDate = new Date();
    endDate.setDate(endDate.getDate() - 3); // GSC data has 2-3 day delay
    startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days);
  }

  // Normalize site URL (remove trailing slash)
  const baseUrl = siteUrl.replace(/\/$/, '');

  // Build full page URLs from paths for the filter
  // GSC page dimension uses full URLs, GA4 returns paths only
  const pageUrls = aiPagePaths
    .slice(0, 10) // limit to top 10 AI pages to avoid huge filter
    .map(p => {
      // If GA4 returned just a path, prepend the site URL
      if (p.startsWith('/')) return baseUrl + p;
      // If it's already a full URL, use as-is
      if (p.startsWith('http')) return p;
      return baseUrl + '/' + p;
    });

  try {
    // Fire one query per page URL (GSC doesn't support OR in page filters)
    // but we can query with dimension=['query','page'] and no page filter,
    // then filter results client-side for matching pages
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
          dimensions: ['query', 'page'],
          rowLimit: 500,
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.error('[AI Traffic] GSC queries for AI pages failed:', res.status, err);
      return [];
    }

    const data = await res.json();
    const rows = data.rows || [];

    // Build a Set of AI page URLs for fast lookup
    const aiPageSet = new Set(pageUrls.map(u => u.toLowerCase().replace(/\/$/, '')));

    // Filter to rows whose page matches an AI landing page
    const aiRows = rows.filter(row => {
      const pageUrl = (row.keys[1] || '').toLowerCase().replace(/\/$/, '');
      return aiPageSet.has(pageUrl);
    });

    // Aggregate by query (same query may appear on multiple AI pages)
    const queryMap = {};
    for (const row of aiRows) {
      const query = row.keys[0];
      const page = row.keys[1];
      if (!queryMap[query]) {
        queryMap[query] = { query, page, clicks: 0, impressions: 0, ctrSum: 0, count: 0 };
      }
      queryMap[query].clicks += Math.round(row.clicks);
      queryMap[query].impressions += Math.round(row.impressions);
      queryMap[query].ctrSum += row.ctr;
      queryMap[query].count += 1;
      // Keep the page with highest clicks
      if (row.clicks > 0 && Math.round(row.clicks) > queryMap[query].clicks - Math.round(row.clicks)) {
        queryMap[query].page = page;
      }
    }

    return Object.values(queryMap)
      .map(q => ({
        query: q.query,
        page: q.page,
        clicks: q.clicks,
        impressions: q.impressions,
        ctr: ((q.ctrSum / q.count) * 100).toFixed(1),
      }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 15);
  } catch (err) {
    console.error('[AI Traffic] GSC queries for AI pages error:', err.message);
    return [];
  }
}

// Map raw sessionSource values to display names
function classifyAiSource(source) {
  const s = (source || '').toLowerCase();
  if (s.includes('chatgpt') || s.includes('openai')) return 'ChatGPT';
  if (s.includes('perplexity')) return 'Perplexity';
  if (s.includes('gemini') || s.includes('bard')) return 'Gemini';
  if (s.includes('claude') || s.includes('anthropic')) return 'Claude';
  if (s.includes('copilot') || s.includes('bing')) return 'Copilot';
  if (s.includes('poe')) return 'Poe';
  return 'Other AI';
}

/**
 * Extract a readable keyword/topic from a landing page URL path.
 * E.g. /blog/best-running-shoes-2026/ → "best running shoes 2026"
 *      /services/web-design         → "web design"
 *      /                            → null
 */
function extractKeywordFromPath(pagePath) {
  if (!pagePath || pagePath === '/' || pagePath === '(not set)') return null;
  try {
    let path = decodeURIComponent(pagePath);
    // Remove query string and hash
    path = path.split('?')[0].split('#')[0];
    // Remove trailing slash
    path = path.replace(/\/$/, '');
    // Get the last meaningful segment
    const segments = path.split('/').filter(Boolean);
    if (!segments.length) return null;
    const last = segments[segments.length - 1];
    // Skip if it looks like an ID (long hex, numeric, or uuid-like)
    if (/^[0-9]+$/.test(last)) return null;
    if (/^[a-f0-9-]{20,}$/i.test(last)) return null;
    // Convert slug to readable text
    const keyword = last
      .replace(/[-_]/g, ' ')
      .replace(/\.[a-z]{2,5}$/i, '') // remove file extensions like .html
      .replace(/\s+/g, ' ')
      .trim();
    return keyword.length > 2 ? keyword : null;
  } catch {
    return null;
  }
}

/**
 * Fetch AI-referred traffic stats from GA4.
 * Returns: { totalAiSessions, totalSiteSessions, aiShare, aiShareChange,
 *            totalAiSessionsChange, engines: [...], topLandingPages: [...] }
 */
export async function fetchAITrafficStats(accessToken, propertyId, daysOrRange = 30, compareRange = null) {
  const cleanId = propertyId.replace('properties/', '');
  const fmt = (d) => d.toISOString().split('T')[0];

  let startDate, endDate;
  if (typeof daysOrRange === 'object' && daysOrRange.startDate && daysOrRange.endDate) {
    startDate = daysOrRange.startDate;
    endDate = daysOrRange.endDate;
  } else {
    const days = typeof daysOrRange === 'number' ? daysOrRange : 30;
    const e = new Date();
    const s = new Date();
    s.setDate(s.getDate() - days);
    startDate = fmt(s);
    endDate = fmt(e);
  }

  // Compute comparison period
  let compStart, compEnd;
  if (compareRange && compareRange.startDate && compareRange.endDate) {
    compStart = compareRange.startDate;
    compEnd = compareRange.endDate;
  } else {
    const sDate = new Date(startDate + 'T00:00:00');
    const eDate = new Date(endDate + 'T00:00:00');
    const diffMs = eDate.getTime() - sDate.getTime();
    const pEnd = new Date(sDate);
    pEnd.setDate(pEnd.getDate() - 1);
    const pStart = new Date(pEnd.getTime() - diffMs);
    compStart = fmt(pStart);
    compEnd = fmt(pEnd);
  }

  const aiFilter = {
    filter: {
      fieldName: 'sessionSource',
      stringFilter: {
        matchType: 'PARTIAL_REGEXP',
        value: AI_SOURCE_REGEX,
        caseSensitive: false,
      },
    },
  };

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${cleanId}:runReport`;

  // ── 1. AI sessions by source (current period) ──
  const bySourceBody = {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'sessionSource' }],
    metrics: [{ name: 'sessions' }],
    dimensionFilter: aiFilter,
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 50,
  };

  // ── 2. AI top landing pages (current period) ──
  const byPageBody = {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'landingPagePlusQueryString' }],
    metrics: [{ name: 'sessions' }],
    dimensionFilter: aiFilter,
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 5,
  };

  // ── 3. Total site sessions (current period, no filter) ──
  const totalBody = {
    dateRanges: [{ startDate, endDate }],
    metrics: [{ name: 'sessions' }],
  };

  // ── 4. Previous period AI sessions (total only, for trend) ──
  const prevAiBody = {
    dateRanges: [{ startDate: compStart, endDate: compEnd }],
    metrics: [{ name: 'sessions' }],
    dimensionFilter: aiFilter,
  };

  // ── 5. Previous period total sessions (for share comparison) ──
  const prevTotalBody = {
    dateRanges: [{ startDate: compStart, endDate: compEnd }],
    metrics: [{ name: 'sessions' }],
  };

  // ── 6. AI sessions by source + landing page (per-engine page breakdown) ──
  const bySourcePageBody = {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'sessionSource' }, { name: 'landingPagePlusQueryString' }],
    metrics: [{ name: 'sessions' }],
    dimensionFilter: aiFilter,
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 100,
  };

  // Fire all in parallel
  const [bySourceRes, byPageRes, totalRes, prevAiRes, prevTotalRes, bySourcePageRes] = await Promise.all([
    fetch(url, { method: 'POST', headers, body: JSON.stringify(bySourceBody) }),
    fetch(url, { method: 'POST', headers, body: JSON.stringify(byPageBody) }),
    fetch(url, { method: 'POST', headers, body: JSON.stringify(totalBody) }),
    fetch(url, { method: 'POST', headers, body: JSON.stringify(prevAiBody) }).catch(() => null),
    fetch(url, { method: 'POST', headers, body: JSON.stringify(prevTotalBody) }).catch(() => null),
    fetch(url, { method: 'POST', headers, body: JSON.stringify(bySourcePageBody) }).catch(() => null),
  ]);

  if (!bySourceRes.ok) {
    const err = await bySourceRes.text().catch(() => '');
    console.error('[AI Traffic] bySource failed:', bySourceRes.status, err);
    return null;
  }

  const [bySourceData, byPageData, totalData, bySourcePageData] = await Promise.all([
    bySourceRes.json(),
    byPageRes.ok ? byPageRes.json() : { rows: [] },
    totalRes.ok ? totalRes.json() : { rows: [] },
    bySourcePageRes?.ok ? bySourcePageRes.json() : { rows: [] },
  ]);

  // Parse previous-period data
  let prevAiSessions = 0;
  let prevTotalSessions = 0;
  try {
    if (prevAiRes?.ok) {
      const d = await prevAiRes.json();
      prevAiSessions = Number(d.rows?.[0]?.metricValues?.[0]?.value || 0);
    }
  } catch { /* ignore */ }
  try {
    if (prevTotalRes?.ok) {
      const d = await prevTotalRes.json();
      prevTotalSessions = Number(d.rows?.[0]?.metricValues?.[0]?.value || 0);
    }
  } catch { /* ignore */ }

  // ── Aggregate engines ──
  const engineMap = {};
  let totalAiSessions = 0;
  for (const row of (bySourceData.rows || [])) {
    const rawSource = row.dimensionValues[0].value;
    const sessions = Number(row.metricValues[0].value);
    const engine = classifyAiSource(rawSource);
    engineMap[engine] = (engineMap[engine] || 0) + sessions;
    totalAiSessions += sessions;
  }

  const engines = Object.entries(engineMap)
    .map(([name, sessions]) => ({ name, sessions, share: totalAiSessions ? Math.round((sessions / totalAiSessions) * 100) : 0 }))
    .sort((a, b) => b.sessions - a.sessions);

  // ── Top landing pages ──
  const topLandingPages = (byPageData.rows || []).map(row => ({
    page: row.dimensionValues[0].value,
    sessions: Number(row.metricValues[0].value),
  }));

  // ── Pages per AI engine ──
  const enginePagesMap = {};
  for (const row of (bySourcePageData.rows || [])) {
    const rawSource = row.dimensionValues[0].value;
    const page = row.dimensionValues[1].value;
    const sessions = Number(row.metricValues[0].value);
    const engine = classifyAiSource(rawSource);
    if (!enginePagesMap[engine]) enginePagesMap[engine] = [];
    enginePagesMap[engine].push({ page, sessions });
  }
  // Sort each engine's pages by sessions and keep top 5, with extracted keyword
  const enginePages = {};
  for (const [engine, pages] of Object.entries(enginePagesMap)) {
    enginePages[engine] = pages
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 5)
      .map(p => ({ ...p, keyword: extractKeywordFromPath(p.page) }));
  }

  // ── Total site sessions ──
  const totalSiteSessions = Number(totalData.rows?.[0]?.metricValues?.[0]?.value || 0);

  // ── Percentages / trends ──
  const pct = (cur, prev) => {
    if (!prev) return cur > 0 ? 100 : 0;
    return Math.round(((cur - prev) / prev) * 100);
  };

  const aiShare = totalSiteSessions ? parseFloat(((totalAiSessions / totalSiteSessions) * 100).toFixed(1)) : 0;
  const prevAiShare = prevTotalSessions ? parseFloat(((prevAiSessions / prevTotalSessions) * 100).toFixed(1)) : 0;

  return {
    totalAiSessions,
    totalAiSessionsChange: pct(totalAiSessions, prevAiSessions),
    totalSiteSessions,
    aiShare,
    aiShareChange: prevAiShare ? Math.round((aiShare - prevAiShare) * 10) / 10 : null, // pp difference
    engines,
    topLandingPages,
    enginePages,
  };
}
