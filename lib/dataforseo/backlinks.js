/**
 * DataForSEO Backlinks API client.
 *
 * Auth: HTTP Basic — DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD.
 * Docs: https://docs.dataforseo.com/v3/backlinks/backlinks/live
 *
 * v1 scope: a single fetch of up to MAX_BACKLINKS_PER_SITE rows per site,
 * normalized into the shape the sync engine writes to the Backlink model.
 * Pagination across >1000 results is deferred until we hit a real site that
 * needs it; most accounts will be far below this cap.
 */

const BASE_URL = 'https://api.dataforseo.com';
const MAX_BACKLINKS_PER_SITE = 1000;

function getCredentials() {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) {
    throw new Error('DataForSEO credentials missing (DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD)');
  }
  return { login, password };
}

function authHeader() {
  const { login, password } = getCredentials();
  const encoded = Buffer.from(`${login}:${password}`).toString('base64');
  return `Basic ${encoded}`;
}

// DataForSEO accepts target as a host (no protocol). Strips scheme, www., and
// trailing path so a Site.url like "https://www.example.com/" becomes "example.com".
function normalizeTarget(siteUrl) {
  if (!siteUrl) return null;
  try {
    const u = new URL(siteUrl);
    return u.hostname.replace(/^www\./i, '');
  } catch {
    return String(siteUrl)
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .split('/')[0];
  }
}

function rootDomain(url) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return null;
  }
}

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Map a DataForSEO item to the Backlink model fields. Fields named per DataForSEO docs:
// page_from_rank, domain_from_rank, backlink_spam_score, first_seen, last_seen,
// dofollow (boolean), anchor, url_from, url_to.
function normalizeItem(item) {
  const referringUrl = item.url_from || null;
  const targetUrl = item.url_to || null;
  if (!referringUrl || !targetUrl) return null;

  return {
    referringUrl,
    referringDomain: item.domain_from || rootDomain(referringUrl),
    targetUrl,
    anchorText: item.anchor || null,
    isDofollow: typeof item.dofollow === 'boolean' ? item.dofollow : null,
    domainRating: typeof item.domain_from_rank === 'number' ? Math.round(item.domain_from_rank) : null,
    spamScore: typeof item.backlink_spam_score === 'number' ? item.backlink_spam_score : null,
    firstSeen: toDate(item.first_seen) || new Date(),
    lastSeen: toDate(item.last_seen) || new Date(),
  };
}

/**
 * Fetch up to MAX_BACKLINKS_PER_SITE backlinks for a site URL.
 * Returns an array of normalized items; throws on API/network failure so the
 * sync engine can attribute the BacklinkSync row as FAILED.
 */
export async function fetchBacklinksForSite(siteUrl) {
  const target = normalizeTarget(siteUrl);
  if (!target) {
    throw new Error(`Cannot derive target host from site URL: ${siteUrl}`);
  }

  const body = [{
    target,
    limit: MAX_BACKLINKS_PER_SITE,
    mode: 'as_is',
    order_by: ['domain_from_rank,desc'],
  }];

  const res = await fetch(`${BASE_URL}/v3/backlinks/backlinks/live`, {
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
    throw new Error(`DataForSEO error ${json.status_code}: ${json.status_message}`);
  }
  const task = Array.isArray(json.tasks) ? json.tasks[0] : null;
  if (!task) return [];
  if (task.status_code !== 20000) {
    throw new Error(`DataForSEO task error ${task.status_code}: ${task.status_message}`);
  }
  const result = Array.isArray(task.result) ? task.result[0] : null;
  const items = Array.isArray(result?.items) ? result.items : [];

  return items.map(normalizeItem).filter(Boolean);
}

export const __testables = { normalizeTarget, normalizeItem, rootDomain };
