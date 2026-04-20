import crypto from 'node:crypto';

/**
 * Sign an editor-preview token that the WordPress plugin can verify.
 *
 * Scheme: HMAC-SHA256(siteSecret, `${siteId}|${parentOrigin}|${expiresAt}`)
 * The plugin shares the siteSecret, so only the real platform can produce a
 * valid token for a given (siteId, parentOrigin, exp) triple. This lets the
 * plugin trust iframe-embed requests from any platform domain (localhost,
 * staging, production) without a Referer allowlist.
 */
export function signEditorToken({ siteSecret, siteId, parentOrigin, ttlSeconds = 3600 }) {
  if (!siteSecret) throw new Error('siteSecret required');
  if (!siteId) throw new Error('siteId required');
  if (!parentOrigin) throw new Error('parentOrigin required');

  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${siteId}|${parentOrigin}|${exp}`;
  const sig = crypto.createHmac('sha256', siteSecret).update(payload).digest('hex');
  return { sig, exp, origin: parentOrigin };
}
