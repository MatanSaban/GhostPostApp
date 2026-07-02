/**
 * POST /api/mcp/sites/{siteKey}/redirects - persist a redirect so the Contract
 * serves it. scope: redirect:write. Reuses upsertRedirectOverride verbatim.
 */
import { NextResponse } from 'next/server';
import { authenticateMcp, hasScope, SCOPES, resolveMcpSite } from '@/lib/mcp/auth';
import { upsertRedirectOverride } from '@/lib/contract/overrides';
import { buildManifest } from '@/lib/contract/resolver';

export async function POST(request, { params }) {
  const ctx = await authenticateMcp(request);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (!hasScope(ctx, SCOPES.REDIRECT_WRITE)) return NextResponse.json({ error: 'missing scope redirect:write' }, { status: 403 });

  const { siteKey } = await params;
  const r = await resolveMcpSite(ctx, siteKey);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });

  const body = await request.json().catch(() => ({}));
  const { from, to, type } = body || {};
  if (!from || !to) return NextResponse.json({ error: 'from and to are required' }, { status: 400 });

  const res = await upsertRedirectOverride(r.site.id, from, to, type);
  const manifest = await buildManifest(r.site);
  return NextResponse.json({ ...res, manifestVersion: manifest.version });
}
