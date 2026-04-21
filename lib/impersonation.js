import crypto from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Crockford-ish: no 0/O/1/I
const CODE_GROUP_LEN = 4;
const CODE_GROUPS = 4; // 16 chars total → ~80 bits of entropy
const CODE_PREFIX_LEN = 4;

export const IMPERSONATION_SCOPES = ['READ_ONLY', 'FULL'];
export const IMPERSONATION_GRANT_STATUSES = ['ACTIVE', 'USED', 'EXPIRED', 'REVOKED'];

export const TTL_PRESETS = {
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};
export const DEFAULT_TTL_KEY = '1h';
export const MAX_TTL_MS = TTL_PRESETS['24h'];

export const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min hard cap on a live impersonation session
export const MAX_REASON_LEN = 500;
export const MIN_REASON_LEN = 10;

function pickChar() {
  const buf = crypto.randomBytes(1);
  return ALPHABET[buf[0] % ALPHABET.length];
}

/**
 * Generate a fresh user-facing impersonation code, e.g. "AB7K-9XQR-MN3P-T5VW".
 * The code is shown to the user exactly once and never persisted in plaintext.
 */
export function generateImpersonationCode() {
  const groups = [];
  for (let g = 0; g < CODE_GROUPS; g += 1) {
    let group = '';
    for (let i = 0; i < CODE_GROUP_LEN; i += 1) group += pickChar();
    groups.push(group);
  }
  return groups.join('-');
}

/**
 * Normalize a user-typed code: strip whitespace + dashes, uppercase, drop
 * characters not in the alphabet. Returns the canonical token used for hashing.
 */
export function normalizeImpersonationCode(input) {
  if (typeof input !== 'string') return '';
  const stripped = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  // Filter out chars we never emit (0/O/1/I etc) so user typos surface as "not found"
  return [...stripped].filter((c) => ALPHABET.includes(c)).join('');
}

/**
 * SHA-256 of the canonical code. We persist the hash; the plaintext is only
 * shown to the user at creation time. Comparison is by deterministic hash so
 * the admin can paste the code and we can look it up by `codeHash`.
 */
export function hashImpersonationCode(code) {
  const canonical = normalizeImpersonationCode(code);
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * First N chars of the canonical code - stored alongside the hash so the user
 * can recognize *which* outstanding grant they generated ("starts with AB7K…")
 * without us being able to recover the full code.
 */
export function codePrefixOf(code) {
  return normalizeImpersonationCode(code).slice(0, CODE_PREFIX_LEN);
}

/**
 * Format a canonical 16-char code back into the "AAAA-BBBB-CCCC-DDDD" display
 * form. Useful when surfacing a freshly-minted code to the user.
 */
export function formatImpersonationCode(canonical) {
  const groups = [];
  for (let i = 0; i < canonical.length; i += CODE_GROUP_LEN) {
    groups.push(canonical.slice(i, i + CODE_GROUP_LEN));
  }
  return groups.join('-');
}

export function ttlMsFromKey(key) {
  return TTL_PRESETS[key] || TTL_PRESETS[DEFAULT_TTL_KEY];
}

/**
 * Generate the opaque session token stored in the impersonation cookie.
 * Returns the base64url plaintext - store it as-is in `sessionToken` so the
 * resolver can match on cookie value directly.
 */
export function generateSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}
