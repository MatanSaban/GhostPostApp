/**
 * Contract payload signing (Ed25519).
 *
 * The Site SEO/Content Contract is a PUBLIC read API keyed on the public
 * `siteKey`. That is safe because it only ever returns public SEO directives
 * (titles, meta, canonicals, redirects) - never a secret. To stop a MITM or a
 * poisoned CDN from forging a site's canonical/redirects, every response body
 * is signed with an Ed25519 private key held only on the server. Consumers
 * (the @ghostseo/seo SDK, the edge proxy) verify the signature against the
 * pinned PUBLIC key - they hold no secret. This is the deliberate inverse of
 * the WordPress plugin's failure (a secret handed out for a public id).
 *
 * Key management:
 *   - Production MUST set CONTRACT_SIGNING_PRIVATE_KEY to a base64-encoded
 *     PKCS8 PEM Ed25519 private key (stable across instances so signatures
 *     verify everywhere and survive restarts).
 *   - Without it, a process-stable ephemeral key is generated so local dev
 *     works - but it is NOT valid across instances. A warning is logged.
 *
 * Rotation: the public key is published at /api/public/contract-key with a
 * `keyId` (hash of the public key). Every signed payload carries its `keyId`,
 * so the SDK can pin a set of keys and rotate by shipping a new key before the
 * server starts signing with it.
 */

import crypto from 'crypto';

let cached = null;

function loadKey() {
  if (cached) return cached;

  const envKey = process.env.CONTRACT_SIGNING_PRIVATE_KEY;
  let privateKey;
  let ephemeral = false;

  if (envKey) {
    const pem = envKey.includes('BEGIN')
      ? envKey
      : Buffer.from(envKey, 'base64').toString('utf8');
    privateKey = crypto.createPrivateKey(pem);
  } else {
    // Dev fallback only. Set CONTRACT_SIGNING_PRIVATE_KEY in production.
    const kp = crypto.generateKeyPairSync('ed25519');
    privateKey = kp.privateKey;
    ephemeral = true;
    console.warn(
      '[contract/signing] CONTRACT_SIGNING_PRIVATE_KEY is not set - using an ' +
      'ephemeral Ed25519 key. Contract signatures will NOT verify across ' +
      'instances or restarts. Set it in production.',
    );
  }

  const publicKey = crypto.createPublicKey(privateKey);
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const keyId = crypto.createHash('sha256').update(publicKeyPem).digest('hex').slice(0, 16);

  cached = { privateKey, publicKey, publicKeyPem, keyId, ephemeral };
  return cached;
}

/**
 * Deterministic JSON stringify with lexicographically sorted object keys, so
 * the signer and any verifier serialize identical bytes for the same value.
 */
export function canonicalJSON(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJSON(value[k])}`).join(',')}}`;
}

/**
 * Public key info for the /api/public/contract-key endpoint and the SDK.
 * @returns {{ alg: string, keyId: string, publicKeyPem: string, ephemeral: boolean }}
 */
export function getPublicKeyInfo() {
  const { keyId, publicKeyPem, ephemeral } = loadKey();
  return { alg: 'ed25519', keyId, publicKeyPem, ephemeral };
}

/**
 * Wrap `data` in a signed envelope. The signature covers the data AND the
 * envelope metadata (keyId/alg/issuedAt/expiresAt), so a captured payload
 * cannot be replayed with a different expiry.
 *
 * @param {any} data
 * @param {{ ttlSeconds?: number }} [opts]
 * @returns {{ data: any, keyId: string, alg: string, issuedAt: number, expiresAt: number, signature: string|null }}
 */
export function signPayload(data, { ttlSeconds = 600 } = {}) {
  const { privateKey, keyId } = loadKey();
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + ttlSeconds;
  const meta = { keyId, alg: 'ed25519', issuedAt, expiresAt };

  const signingInput = canonicalJSON({ data, ...meta });
  // Ed25519 uses `null` as the digest algorithm in Node's crypto.sign.
  const signature = crypto.sign(null, Buffer.from(signingInput), privateKey).toString('base64');

  return { data, ...meta, signature };
}

/**
 * Verify a signed envelope against the current (or a supplied) public key.
 * Mirrors what the SDK does; also used by tests. Does NOT check expiry - the
 * caller decides how strict to be about `expiresAt`.
 *
 * @param {{ data: any, keyId: string, alg: string, issuedAt: number, expiresAt: number, signature: string }} envelope
 * @param {string} [publicKeyPem] - defaults to the server's current public key
 * @returns {boolean}
 */
export function verifyPayload(envelope, publicKeyPem) {
  try {
    if (!envelope || !envelope.signature || envelope.alg !== 'ed25519') return false;
    const pubPem = publicKeyPem || loadKey().publicKeyPem;
    const pub = crypto.createPublicKey(pubPem);
    const signingInput = canonicalJSON({
      data: envelope.data,
      keyId: envelope.keyId,
      alg: envelope.alg,
      issuedAt: envelope.issuedAt,
      expiresAt: envelope.expiresAt,
    });
    return crypto.verify(
      null,
      Buffer.from(signingInput),
      pub,
      Buffer.from(envelope.signature, 'base64'),
    );
  } catch {
    return false;
  }
}
