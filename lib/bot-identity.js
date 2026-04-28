/**
 * Identity used on every outbound fetch the platform makes against a user's
 * website during onboarding / analysis. Site owners allowlist this in their
 * WAF so we can analyze their site without forcing them to share an IP.
 *
 * Format follows the conventional `Mozilla/5.0 (compatible; <Bot>/<ver>; +<url>)`
 * pattern used by Googlebot/Bingbot/AhrefsBot, so plugin-side UA-allowlist
 * UIs (Wordfence, Sucuri, Cloudflare, etc.) recognize it as a bot.
 */

// Single source of truth for the marketing site origin. Override in deployment
// via NEXT_PUBLIC_MARKETING_URL (e.g. staging on a different domain). Used
// here for the bot info URL inside the User-Agent string, and imported
// elsewhere on the platform for any cross-link to the marketing site.
export const MARKETING_SITE_URL = process.env.NEXT_PUBLIC_MARKETING_URL || 'https://ghostseo.ai';

export const GHOSTSEO_BOT_NAME = 'GhostSEOBot';
export const GHOSTSEO_BOT_VERSION = '1.0';
// English page is the canonical bot info URL - the audience (site admins
// reviewing WAF logs) skews English. Hebrew/French speakers can switch
// from the locale picker in the marketing site header.
export const GHOSTSEO_BOT_INFO_URL = `${MARKETING_SITE_URL}/en/bot`;
export const GHOSTSEO_BOT_CONTACT = 'support@ghostseo.ai';

export const GHOSTSEO_BOT_UA = `Mozilla/5.0 (compatible; ${GHOSTSEO_BOT_NAME}/${GHOSTSEO_BOT_VERSION}; +${GHOSTSEO_BOT_INFO_URL})`;

/**
 * Headers to send on outbound fetches. The UA is the load-bearing piece -
 * everything else is just polite/standard. `From` is the RFC 9110 contact
 * field crawlers are supposed to send; some WAF UIs surface it as a "who
 * is this" hint when the admin reviews blocked traffic.
 */
export const BOT_FETCH_HEADERS = {
  'User-Agent': GHOSTSEO_BOT_UA,
  'From': GHOSTSEO_BOT_CONTACT,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,he;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
};

/**
 * Status codes that indicate a WAF / bot-protection layer rejected us
 * (vs the origin actually being down, the URL being wrong, etc.). When we
 * see one of these we surface the WAF_BLOCKED errorCode so the UI can show
 * allowlist instructions instead of a generic "site unreachable" message.
 */
export const WAF_BLOCK_STATUSES = new Set([401, 403, 406, 429, 503]);
