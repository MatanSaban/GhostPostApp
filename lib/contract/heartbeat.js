/**
 * Contract-consumption heartbeat.
 *
 * The Contract API is a pure read surface, so until this existed the dashboard
 * showed custom sites as PENDING forever — nothing recorded that a site's SDK
 * or edge proxy was actually fetching its signed SEO. recordContractHit() is
 * called from the public contract routes (and MCP auth with type 'MCP') and:
 *
 *   1. Upserts the SiteIntegration row for (siteId, transport type) with
 *      status CONNECTED + lastSeenAt + clientVersion.
 *   2. Promotes the Site itself: integrationType (precedence
 *      EDGE_PROXY > SDK > MCP > GITHUB_APP, never downgraded by a later
 *      lower-ranked hit) and connectionStatus PENDING → CONNECTED — but only
 *      for sites with no native transport (never WordPress/Shopify).
 *
 * Writes are debounced per warm instance (one write per site+type per
 * DEBOUNCE_MS) so the hot contract path stays one cheap upsert away from
 * read-only. Callers await it (it is fast and rare); failures are swallowed —
 * a heartbeat must never break contract serving.
 *
 * Transport identity comes from the X-GP-Client header ("sdk/0.2.0",
 * "edge/0.1.0", "mcp/0.1.0"). Absent header → inferred SDK, which covers the
 * pre-header vendored SDK already live on rdg-next.
 */

import prisma from '@/lib/prisma';
import { INTEGRATION_TYPES } from '@/lib/cms/registry';
import { invalidateSiteMetadata } from '@/lib/cache/invalidate';

const DEBOUNCE_MS = 5 * 60 * 1000;

// Rank for Site.integrationType promotion — a stronger transport wins, a
// weaker one never downgrades the site.
const RANK = { EDGE_PROXY: 4, SDK: 3, MCP: 2, GITHUB_APP: 1 };

// Site platforms with their own native transport — never promoted by contract
// hits (the WP plugin / Shopify OAuth flows own their connection state).
const NATIVE_PLATFORMS = new Set(['wordpress', 'shopify']);

const lastWrite = new Map(); // `${siteId}:${type}` -> epoch ms

/**
 * Map an X-GP-Client header to { type, clientVersion }.
 * @param {string|null} header
 */
export function parseTransport(header) {
  const raw = (header || '').trim().toLowerCase();
  if (raw.startsWith('edge/')) return { type: INTEGRATION_TYPES.EDGE_PROXY, clientVersion: raw };
  if (raw.startsWith('mcp/')) return { type: INTEGRATION_TYPES.MCP, clientVersion: raw };
  if (raw.startsWith('sdk/')) return { type: INTEGRATION_TYPES.SDK, clientVersion: raw };
  // No / unknown header: an SSR site pulling the contract is SDK-shaped.
  return { type: INTEGRATION_TYPES.SDK, clientVersion: raw || null };
}

/**
 * Record a contract fetch for a site. Debounced, never throws.
 *
 * @param {{ id: string, platform?: string|null, integrationType?: string|null }} site
 *   The row resolveSiteByKey returned (or any object with those fields).
 * @param {Request|null} request - used for the X-GP-Client header; pass null
 *   and set `transport` explicitly for non-HTTP callers (MCP).
 * @param {{ transport?: string, clientVersion?: string|null }} [opts]
 */
export async function recordContractHit(site, request, opts = {}) {
  try {
    if (!site?.id) return;
    const parsed = opts.transport
      ? { type: opts.transport, clientVersion: opts.clientVersion ?? null }
      : parseTransport(request?.headers?.get?.('x-gp-client'));
    const { type, clientVersion } = parsed;

    const key = `${site.id}:${type}`;
    const now = Date.now();
    const last = lastWrite.get(key) || 0;
    if (now - last < DEBOUNCE_MS) return;
    lastWrite.set(key, now);
    if (lastWrite.size > 5000) {
      for (const [k, v] of lastWrite) if (now - v >= DEBOUNCE_MS) lastWrite.delete(k);
    }

    const seenAt = new Date();
    await prisma.siteIntegration.upsert({
      where: { siteId_type: { siteId: site.id, type } },
      update: { status: 'CONNECTED', lastSeenAt: seenAt, ...(clientVersion ? { clientVersion } : {}) },
      create: { siteId: site.id, type, status: 'CONNECTED', lastSeenAt: seenAt, clientVersion },
    });

    // Promote the Site itself (custom sites only, no downgrade, no flapping).
    const platform = (site.platform || '').toLowerCase();
    if (NATIVE_PLATFORMS.has(platform)) return;
    const currentRank = RANK[site.integrationType] || 0;
    const newRank = RANK[type] || 0;
    const needsType = newRank > currentRank;
    // connectionStatus lives on the row we were handed only sometimes; the
    // guarded updateMany makes the write idempotent either way.
    const res = await prisma.site.updateMany({
      where: {
        id: site.id,
        OR: [
          { connectionStatus: { not: 'CONNECTED' } },
          ...(needsType ? [{ integrationType: { not: type } }] : []),
        ],
      },
      data: {
        connectionStatus: 'CONNECTED',
        ...(needsType ? { integrationType: type } : {}),
        lastPingAt: seenAt,
      },
    });
    if (res.count > 0) invalidateSiteMetadata(site.id);
  } catch (err) {
    console.warn('[contract/heartbeat] recordContractHit failed:', err?.message || err);
  }
}
