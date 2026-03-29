/**
 * Centralized URL display utilities.
 * Decodes percent-encoded characters (Hebrew, Arabic, etc.) for display.
 * All URL display functions return decoded strings suitable for LTR display.
 */

/**
 * Decode a full URL for display (keeps protocol + domain + decoded path).
 * Safe wrapper around decodeURI - returns original on failure.
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
 * Format a site URL for clean display: includes protocol, strips trailing slash, decodes non-ASCII.
 * Returns { display, href, isHttps }.
 */
export function formatSiteUrl(url) {
  if (!url) return { display: '', href: '', isHttps: false };
  const href = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
  const isHttps = href.startsWith('https://');
  // Clean URL for display (retain protocol but decode non-ASCII)
  const cleanUrl = href.replace(/\/$/, '');
  let display;
  try {
    display = decodeURI(cleanUrl);
  } catch {
    display = cleanUrl;
  }
  return { display, href, isHttps };
}

/**
 * Format a page URL for inline display - shows full URL with protocol, decoded for readability.
 * Always includes https/http for clarity.
 */
export function formatPageUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    // Decode pathname for Hebrew/Arabic readability
    const decodedPath = decodeURIComponent(parsed.pathname);
    // Return full URL with protocol
    return `${parsed.protocol}//${parsed.host}${decodedPath}${parsed.search}${parsed.hash}`.replace(/\/$/, '');
  } catch {
    // If not a valid URL, just decode it
    try { return decodeURIComponent(url); } catch { return url; }
  }
}

/**
 * Format a page URL showing only the path (for compact displays).
 * Falls back to full URL if path is just '/'.
 */
export function formatPagePath(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.pathname === '/') {
      return `${parsed.protocol}//${parsed.host}`;
    }
    return decodeURIComponent(parsed.pathname);
  } catch {
    try { return decodeURIComponent(url); } catch { return url; }
  }
}
