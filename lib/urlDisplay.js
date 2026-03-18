/**
 * Centralized URL display utilities.
 * Decodes percent-encoded characters (Hebrew, Arabic, etc.) for display.
 */

/**
 * Decode a full URL for display (keeps protocol + domain + decoded path).
 * Safe wrapper around decodeURI — returns original on failure.
 */
export function decodeDisplayUrl(url) {
  if (!url) return '';
  try {
    return decodeURI(url);
  } catch {
    return url;
  }
}

/**
 * Format a site URL for clean display: strips protocol, trailing slash, decodes non-ASCII.
 * Returns { display, href, isHttps }.
 */
export function formatSiteUrl(url) {
  if (!url) return { display: '', href: '', isHttps: false };
  const href = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
  const raw = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  let display;
  try {
    display = decodeURI(raw);
  } catch {
    display = raw;
  }
  const isHttps = href.startsWith('https://');
  return { display, href, isHttps };
}

/**
 * Format a page URL for inline display — shows decoded pathname (or origin for root).
 */
export function formatPageUrl(url) {
  try {
    const parsed = new URL(url);
    const display = parsed.pathname === '/' ? parsed.origin : parsed.pathname;
    return decodeURIComponent(display);
  } catch {
    try { return decodeURIComponent(url); } catch { return url; }
  }
}
