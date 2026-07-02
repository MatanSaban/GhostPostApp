/**
 * HTML rewriting for the on-demand preview proxy.
 *
 * The proxy fetches a customer page server-side and serves it into the
 * platform's editor iframe (same-origin with the dashboard). To make it render
 * + be inspectable we:
 *   1. strip `<meta>` CSP / X-Frame-Options that would block framing or the
 *      inline editor-bridge,
 *   2. drop any existing `<base>` and inject our own so relative asset URLs
 *      (CSS/JS/images) resolve against the real page origin,
 *   3. inject the GhostSEO editor-bridge (same script the WordPress plugin
 *      ships) so element inspection / preview edits work identically.
 *
 * Pure string transform - no DOM dependency - so it's cheap and testable.
 *
 * Known limits: client-only SPAs (empty HTML shell) render only once their own
 * JS hydrates inside the iframe; frame-busting inline scripts are not defused.
 * SSR/SSG pages (the SDK's target) render immediately.
 */

const CSP_META_RE =
  /<meta\b[^>]*http-equiv\s*=\s*["']?\s*(content-security-policy|x-frame-options)\s*["']?[^>]*>/gi;
const BASE_TAG_RE = /<base\b[^>]*>/gi;

function escapeAttr(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * @param {string} html - the raw fetched page HTML
 * @param {{ pageUrl: string, bridgeScript?: string }} opts
 * @returns {string} rewritten HTML ready to serve into the editor iframe
 */
export function rewriteHtmlForPreview(html, { pageUrl, bridgeScript = '' } = {}) {
  if (typeof html !== 'string') return '';
  let out = html;

  // 1. Remove meta CSP / X-Frame-Options (response headers are set by the proxy).
  out = out.replace(CSP_META_RE, '');

  // 2. Remove existing <base> so ours wins.
  out = out.replace(BASE_TAG_RE, '');

  // 3. Inject our <base> as the first thing in <head> (relative URLs -> origin).
  const baseTag = `<base href="${escapeAttr(pageUrl)}">`;
  if (/<head\b[^>]*>/i.test(out)) {
    out = out.replace(/<head\b[^>]*>/i, (m) => `${m}\n${baseTag}`);
  } else if (/<html\b[^>]*>/i.test(out)) {
    out = out.replace(/<html\b[^>]*>/i, (m) => `${m}\n<head>${baseTag}</head>`);
  } else {
    out = `${baseTag}\n${out}`;
  }

  // 4. Inject the editor-bridge before </body> (or append).
  if (bridgeScript) {
    const scriptTag = `\n<script data-gp-preview-bridge="1">${bridgeScript}\n</script>\n`;
    if (/<\/body>/i.test(out)) {
      out = out.replace(/<\/body>/i, `${scriptTag}</body>`);
    } else {
      out += scriptTag;
    }
  }

  return out;
}
