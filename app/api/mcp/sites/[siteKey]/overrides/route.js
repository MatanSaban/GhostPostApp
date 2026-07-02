/**
 * POST /api/mcp/sites/{siteKey}/overrides - persist desired SEO for a path so
 * the Contract serves it (source => 'override'). scope: override:write.
 * Reuses lib/contract/overrides.upsertSeoOverride verbatim.
 */
import { NextResponse } from 'next/server';
import { authenticateMcp, hasScope, SCOPES, resolveMcpSite } from '@/lib/mcp/auth';
import { upsertSeoOverride } from '@/lib/contract/overrides';
import { buildManifest } from '@/lib/contract/resolver';

export async function POST(request, { params }) {
  const ctx = await authenticateMcp(request);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (!hasScope(ctx, SCOPES.OVERRIDE_WRITE)) return NextResponse.json({ error: 'missing scope override:write' }, { status: 403 });

  const { siteKey } = await params;
  const r = await resolveMcpSite(ctx, siteKey);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });

  const body = await request.json().catch(() => ({}));
  const { path, title, description, canonical, robots, ogImage, jsonLd } = body || {};
  if (!path) return NextResponse.json({ error: 'path is required' }, { status: 400 });

  const res = await upsertSeoOverride(r.site.id, path, { title, description, canonical, robots, ogImage, jsonLd });
  const manifest = await buildManifest(r.site);
  return NextResponse.json({ ...res, manifestVersion: manifest.version });
}
