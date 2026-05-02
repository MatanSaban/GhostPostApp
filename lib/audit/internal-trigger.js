/**
 * Internal stage triggers for the chunked audit pipeline.
 *
 * Each chunk completes with a fire-and-forget HTTP call to the next stage
 * (`/api/audit/continue` or `/api/audit/finalize`). When that call drops on
 * the floor — transient network blip, brief 502 from Vercel during a deploy,
 * a Node fetch error — the audit silently stalls until the watchdog re-fires
 * it 5+ minutes later. This helper retries the trigger 3× with backoff so
 * normal blips don't cost the user 5 minutes.
 *
 * The helper itself is fire-and-forget (returns a Promise the caller can
 * ignore). Inside, it owns the retries; on permanent failure it logs but
 * does not throw — the watchdog remains the safety net.
 */

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 250;

/**
 * Fire an internal stage trigger with bounded retries.
 *
 * @param {string} origin - protocol+host from request.nextUrl.origin (or VERCEL_URL)
 * @param {string} path   - "/api/audit/continue?auditId=..." (no query encoding done here)
 * @param {object} [opts]
 * @param {number} [opts.maxAttempts=3]
 * @param {number} [opts.baseDelayMs=250] - delay grows linearly: base, 2×base, 3×base
 * @param {string} [opts.tag] - log prefix, defaults to deriving from path
 */
export async function triggerStage(origin, path, opts = {}) {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_ATTEMPTS;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const tag = opts.tag || path.split('?')[0];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(`${origin}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (res.ok) return { ok: true, attempt };

      // 4xx is non-retryable: the route is wrong, auth fails, or the
      // audit no longer exists. Retrying won't help — log and give up.
      if (res.status < 500) {
        console.error(`[InternalTrigger] ${tag} returned ${res.status} (non-retryable)`);
        return { ok: false, status: res.status };
      }

      // 5xx — server hiccup, worth retrying
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, baseDelayMs * attempt));
        continue;
      }
      console.error(`[InternalTrigger] ${tag} returned ${res.status} after ${maxAttempts} attempts`);
      return { ok: false, status: res.status };
    } catch (err) {
      // Network-level failure (ECONNREFUSED during dev restart, fetch abort,
      // DNS hiccup). Retry — but cap so we don't loop forever.
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, baseDelayMs * attempt));
        continue;
      }
      console.error(`[InternalTrigger] ${tag} failed after ${maxAttempts} attempts: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }
  return { ok: false };
}
