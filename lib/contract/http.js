/**
 * Shared HTTP helpers for the public Contract API.
 *
 * - resolveSiteByKey: look up a site by its PUBLIC siteKey (never returns a
 *   secret - the Contract only ever serves public SEO).
 * - rateLimit: best-effort in-memory limiter to blunt abuse / key enumeration.
 * - signedResponse: sign the payload (Ed25519) + attach cache + CORS headers.
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { signPayload } from './signing';

/**
 * @param {string} siteKey
 * @returns {Promise<{ id: string, url: string, name: string, platform: string|null, integrationType: string|null }|null>}
 */
export async function resolveSiteByKey(siteKey) {
  if (!siteKey || typeof siteKey !== 'string') return null;
  return prisma.site.findFirst({
    where: { siteKey },
    select: { id: true, url: true, name: true, platform: true, integrationType: true },
  });
}

// ── Best-effort in-memory rate limiter (per warm instance) ──────────────
// Serverless caveat: this is per-instance, not global. For hard global limits
// use a shared store (Upstash/Redis). It still blocks trivial abuse and
// site-key enumeration from a single instance.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 120;
const buckets = new Map();

export function rateLimit(identifier, { windowMs = WINDOW_MS, max = MAX_PER_WINDOW } = {}) {
  const now = Date.now();
  let bucket = buckets.get(identifier);
  if (!bucket || now >= bucket.reset) {
    bucket = { count: 0, reset: now + windowMs };
    buckets.set(identifier, bucket);
  }
  bucket.count += 1;

  // Opportunistic cleanup so the map can't grow unbounded.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (now >= v.reset) buckets.delete(k);
  }

  if (bucket.count > max) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((bucket.reset - now) / 1000)) };
  }
  return { allowed: true };
}

export function clientIp(request) {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-GP-Client',
};

export function contractError(status, code, message, extra = {}) {
  return NextResponse.json({ error: message, code, ...extra }, { status, headers: CORS });
}

/**
 * Enforce the rate limit for a request scoped to a site key. Returns a
 * NextResponse (429) when blocked, or null when allowed.
 */
export function enforceRateLimit(request, siteKey) {
  const { allowed, retryAfter } = rateLimit(`${clientIp(request)}:${siteKey || 'none'}`);
  if (allowed) return null;
  return NextResponse.json(
    { error: 'Too many requests', code: 'RATE_LIMITED' },
    { status: 429, headers: { ...CORS, 'Retry-After': String(retryAfter) } },
  );
}

/**
 * Sign `data`, attach cache + CORS headers, return a NextResponse.
 *
 * The signed TTL must OUTLIVE the CDN cache window. A response can be served
 * from cache for `sMaxAge` fresh plus up to `swr` more seconds while it
 * revalidates, so signing for less than that hands consumers a validly-signed
 * but already-expired envelope: the SDK logs a staleness warning on every
 * fetch, and the edge worker (which rejects expired envelopes outright) would
 * silently stop applying SEO. Default TTL therefore covers the whole window
 * plus a 5-minute margin; pass `ttlSeconds` explicitly only to shorten the
 * replay window on payloads whose caching is shorter still.
 */
export function signedResponse(data, { ttlSeconds, sMaxAge = 600, swr = 3600 } = {}) {
  const envelope = signPayload(data, { ttlSeconds: ttlSeconds ?? sMaxAge + swr + 300 });
  return NextResponse.json(envelope, {
    status: 200,
    headers: {
      ...CORS,
      'Cache-Control': `public, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`,
      'X-GP-Contract-Key': envelope.keyId,
    },
  });
}

export function corsPreflight() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
