/**
 * MCP token auth for the /api/mcp/* surface.
 *
 * Tokens are read/propose-scoped, stored HASHED (sha256), and account/site
 * scoped. There is deliberately no "apply:live" scope - the strongest thing a
 * token grants is writing a SiteSeoOverride/Redirection (proposal state the
 * Contract serves), never a live CMS push.
 */
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { recordContractHit } from '@/lib/contract/heartbeat';

export const SCOPES = {
  ISSUES_READ: 'issues:read',
  FIX_READ: 'fix:read',
  OVERRIDE_WRITE: 'override:write',
  REDIRECT_WRITE: 'redirect:write',
};

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/**
 * @returns {Promise<{ ok:true, token, accountId, siteId, scopes:string[] } | { ok:false, status:number, error:string }>}
 */
export async function authenticateMcp(request) {
  if (typeof prisma.mcpToken?.findUnique !== 'function') {
    return { ok: false, status: 503, error: 'MCP is not provisioned on this deployment (run prisma generate)' };
  }
  const auth = request.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return { ok: false, status: 401, error: 'Missing bearer token' };
  const token = m[1].trim();
  if (!token.startsWith('gpmcp_')) return { ok: false, status: 401, error: 'Invalid token' };

  const rec = await prisma.mcpToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!rec) return { ok: false, status: 401, error: 'Invalid token' };
  if (rec.revokedAt) return { ok: false, status: 401, error: 'Token revoked' };
  if (rec.expiresAt && rec.expiresAt < new Date()) return { ok: false, status: 401, error: 'Token expired' };

  // Best-effort last-used stamp (non-blocking).
  prisma.mcpToken.update({ where: { id: rec.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

  return { ok: true, token: rec, accountId: rec.accountId, siteId: rec.siteId, scopes: rec.scopes || [] };
}

export function hasScope(ctx, scope) {
  return Array.isArray(ctx?.scopes) && ctx.scopes.includes(scope);
}

/**
 * Resolve a site by public key AND enforce the token's scope (account, or a
 * single site when the token is site-bound).
 */
export async function resolveMcpSite(ctx, siteKey) {
  const site = await prisma.site.findFirst({
    where: { siteKey },
    select: { id: true, accountId: true, url: true, name: true, platform: true, integrationType: true, siteKey: true },
  });
  if (!site) return { ok: false, status: 404, error: 'Unknown site key' };
  const inScope = ctx.siteId ? site.id === ctx.siteId : site.accountId === ctx.accountId;
  if (!inScope) return { ok: false, status: 403, error: 'Token is not scoped to this site' };
  // MCP heartbeat: stamp the SiteIntegration row (fire-and-forget — a failed
  // heartbeat must never fail the tool call). Promotion is rank-gated inside
  // recordContractHit, so a site already CONNECTED via SDK/EDGE_PROXY is never
  // downgraded to MCP.
  recordContractHit(site, null, { transport: 'MCP', clientVersion: 'mcp/0.1.0' }).catch(() => {});
  return { ok: true, site };
}
