/**
 * GET /api/mcp/sites - list the sites this MCP token can access + capabilities.
 * Token-authenticated (Bearer gpmcp_...).
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticateMcp } from '@/lib/mcp/auth';
import { getCapabilities } from '@/lib/cms';

export async function GET(request) {
  const ctx = await authenticateMcp(request);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const where = ctx.siteId ? { id: ctx.siteId } : { accountId: ctx.accountId };
  const sites = await prisma.site.findMany({
    where,
    select: { siteKey: true, name: true, url: true, platform: true, integrationType: true },
  });

  const out = sites
    .filter((s) => s.siteKey)
    .map((s) => {
      const caps = getCapabilities(s);
      return {
        siteKey: s.siteKey,
        name: s.name,
        url: s.url,
        platform: s.platform,
        integrationType: s.integrationType,
        capabilities: { platform: caps.platform, redirectsBackend: caps.redirectsBackend, seoBackend: caps.seoBackend },
      };
    });

  return NextResponse.json({ sites: out });
}
