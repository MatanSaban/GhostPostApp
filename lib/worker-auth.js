import crypto from 'crypto';

/**
 * Shared secret for internal worker authentication.
 * Read lazily to ensure .env.local is loaded before access.
 */
function getWorkerSecret() {
  return process.env.WORKER_SECRET || process.env.CRON_SECRET;
}

/**
 * Generate a time-limited HMAC token for authenticating internal
 * worker requests. The token is valid for 5 minutes.
 *
 * @param {string} contentId - The content ID being processed
 * @returns {{ token: string, timestamp: number }}
 */
export function signWorkerPayload(contentId) {
  const secret = getWorkerSecret();
  const timestamp = Math.floor(Date.now() / 1000);
  if (!secret) {
    // Development mode: no secret configured — return a dummy token
    return { token: 'dev', timestamp };
  }
  const payload = `${timestamp}.${contentId}`;
  const token = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return { token, timestamp };
}

/**
 * Verify an incoming worker request's HMAC token.
 * Rejects tokens older than 5 minutes to prevent replay attacks.
 *
 * @param {Request} request - Incoming Next.js request
 * @returns {{ valid: boolean, contentId?: string, error?: string }}
 */
export function verifyWorkerAuth(request) {
  const secret = getWorkerSecret();
  if (!secret) {
    // Development mode: no secret → allow all
    return { valid: true };
  }

  const authHeader = request.headers.get('x-worker-token');
  const timestampHeader = request.headers.get('x-worker-timestamp');
  const contentIdHeader = request.headers.get('x-worker-content-id');

  if (!authHeader || !timestampHeader || !contentIdHeader) {
    return { valid: false, error: 'Missing worker auth headers' };
  }

  const timestamp = parseInt(timestampHeader, 10);
  const now = Math.floor(Date.now() / 1000);
  const MAX_AGE = 5 * 60; // 5 minutes

  if (Math.abs(now - timestamp) > MAX_AGE) {
    return { valid: false, error: 'Worker token expired' };
  }

  const payload = `${timestamp}.${contentIdHeader}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  const isValid = crypto.timingSafeEqual(
    Buffer.from(authHeader, 'hex'),
    Buffer.from(expected, 'hex')
  );

  if (!isValid) {
    return { valid: false, error: 'Invalid worker token' };
  }

  return { valid: true, contentId: contentIdHeader };
}
