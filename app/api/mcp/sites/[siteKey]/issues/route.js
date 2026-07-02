/**
 * GET /api/mcp/sites/{siteKey}/issues - issues from the latest completed audit,
 * joined with fixer metadata. scope: issues:read.
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticateMcp, hasScope, SCOPES, resolveMcpSite } from '@/lib/mcp/auth';
import { getAllIssues } from '@/lib/audit/issues-helper';
import { getFixer } from '@/lib/audit/fix-registry';
import { buildManifest } from '@/lib/contract/resolver';

export async function GET(request, { params }) {
  const ctx = await authenticateMcp(request);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (!hasScope(ctx, SCOPES.ISSUES_READ)) return NextResponse.json({ error: 'missing scope issues:read' }, { status: 403 });

  const { siteKey } = await params;
  const r = await resolveMcpSite(ctx, siteKey);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const site = r.site;

  const audit = await prisma.siteAudit.findFirst({
    where: { siteId: site.id, status: 'COMPLETED' },
    orderBy: { completedAt: 'desc' },
    select: { id: true },
  });

  const { searchParams } = new URL(request.url);
  const sev = searchParams.get('severity');

  const raw = audit ? await getAllIssues(audit.id) : [];
  const issues = raw
    .filter((i) => !sev || i.severity === sev)
    .map((i) => {
      const fixer = getFixer(i.message) || null;
      return {
        key: i.message,
        message: i.message,
        severity: i.severity || 'info',
        url: i.url || null,
        suggestion: i.suggestion || null,
        fixable: !!fixer,
        fixKind: fixer?.kind || null,
        handler: fixer?.handler || null,
        manualKinds: fixer?.manualKinds || null,
        credits: fixer?.credits ?? null,
      };
    });

  const manifest = await buildManifest(site);
  return NextResponse.json({ siteId: site.id, auditId: audit?.id || null, manifestVersion: manifest.version, issues });
}
