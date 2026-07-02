/**
 * GET /api/mcp/sites/{siteKey}/fix?issueType=&path= - the ManualOutput[] fix
 * for one issue on one page (forced non-native so it returns copy-ready
 * outputs). scope: fix:read. Reuses the audit fixers verbatim.
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticateMcp, hasScope, SCOPES, resolveMcpSite } from '@/lib/mcp/auth';
import { getFixer } from '@/lib/audit/fix-registry';
import { getHandler } from '@/lib/audit/fixers';

export async function GET(request, { params }) {
  const ctx = await authenticateMcp(request);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (!hasScope(ctx, SCOPES.FIX_READ)) return NextResponse.json({ error: 'missing scope fix:read' }, { status: 403 });

  const { siteKey } = await params;
  const r = await resolveMcpSite(ctx, siteKey);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const site = r.site;

  const { searchParams } = new URL(request.url);
  const issueType = searchParams.get('issueType');
  const path = searchParams.get('path') || '/';
  if (!issueType) return NextResponse.json({ error: 'issueType is required' }, { status: 400 });

  const fixer = getFixer(issueType);
  if (!fixer) return NextResponse.json({ error: `No fixer registered for ${issueType}` }, { status: 404 });
  const handler = getHandler(fixer.handler);
  if (!handler?.preview) return NextResponse.json({ error: `Handler unavailable: ${fixer.handler}` }, { status: 500 });

  const audit = await prisma.siteAudit.findFirst({
    where: { siteId: site.id, status: 'COMPLETED' },
    orderBy: { completedAt: 'desc' },
    select: { id: true, fixPreviews: true },
  });

  // Prefer a cached preview if the audit already produced one.
  const cached = audit?.fixPreviews?.[issueType];
  if (cached?.manualOutputs) {
    return NextResponse.json({ issueType, path, fixKind: fixer.kind, credits: fixer.credits ?? null, manualOutputs: cached.manualOutputs });
  }

  let manualOutputs = [];
  try {
    const base = /^https?:\/\//i.test(site.url) ? site.url : `https://${site.url}`;
    const absoluteUrl = new URL(path, base).toString();
    // wpAuto:false forces the assisted/manualOutputs branch (this site has no
    // native write transport from the MCP token's perspective).
    const preview = await handler.preview({ site, payload: { auditId: audit?.id, url: absoluteUrl, urls: [absoluteUrl], issueType }, wpAuto: false });
    manualOutputs = preview?.manualOutputs || [];
  } catch (e) {
    return NextResponse.json({ error: `Fix generation failed: ${e.message}` }, { status: 502 });
  }

  return NextResponse.json({ issueType, path, fixKind: fixer.kind, credits: fixer.credits ?? null, manualOutputs });
}
