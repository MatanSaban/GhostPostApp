import { NextResponse } from 'next/server';
import { getCurrentAccountMember } from '@/lib/auth-permissions';
import { startDifferentiationJob } from '@/lib/actions/content-differentiation';
import prisma from '@/lib/prisma';

/**
 * POST /api/content-differentiation
 * Start a content differentiation background job.
 * Body: { pageIds?: string[], pageUrls?: string[], siteId: string, siteLanguage?: string }
 * Accepts either pageIds (SiteEntity IDs) or pageUrls (full URLs to resolve).
 */
export async function POST(request) {
  try {
    const { authorized, member, error } = await getCurrentAccountMember();
    if (!authorized) {
      return NextResponse.json({ error }, { status: 401 });
    }

    const body = await request.json();
    let { pageIds, pageUrls, siteId, siteLanguage } = body;

    if (!siteId) {
      return NextResponse.json({ error: 'siteId required' }, { status: 400 });
    }

    // Verify site access
    const site = await prisma.site.findFirst({
      where: {
        id: siteId,
        accountId: member.accountId,
      },
      select: { id: true },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found or unauthorized' }, { status: 404 });
    }

    // If pageUrls provided instead of pageIds, resolve URLs to SiteEntity IDs
    if ((!pageIds || pageIds.length === 0) && pageUrls?.length >= 2) {
      // Build URL variants for flexible matching (http↔https, trailing slash)
      const allVariants = new Set();
      for (const u of pageUrls) {
        allVariants.add(u);
        try {
          const parsed = new URL(u);
          const withSlash = parsed.href.endsWith('/') ? parsed.href : parsed.href + '/';
          const withoutSlash = parsed.href.endsWith('/') ? parsed.href.slice(0, -1) : parsed.href;
          allVariants.add(withSlash);
          allVariants.add(withoutSlash);
        } catch {}
      }

      const entities = await prisma.siteEntity.findMany({
        where: { siteId, url: { in: [...allVariants] } },
        select: { id: true, url: true },
      });

      // Map resolved entities back to original URL order
      const normalize = (u) => {
        try { const p = new URL(u); return p.hostname + p.pathname.replace(/\/$/, ''); } catch { return u; }
      };
      const entityByNorm = {};
      for (const entity of entities) {
        if (entity.url) entityByNorm[normalize(entity.url)] = entity.id;
      }
      pageIds = pageUrls.map(u => entityByNorm[normalize(u)]).filter(Boolean);
    }

    if (!pageIds?.length || pageIds.length < 2) {
      return NextResponse.json({ error: 'At least 2 pages required (could not resolve URLs to entities)' }, { status: 400 });
    }

    const { jobId } = await startDifferentiationJob({
      pageIds,
      siteId,
      userId: member.userId || member.id,
      accountId: member.accountId,
      siteLanguage,
    });

    return NextResponse.json({ jobId, status: 'PROCESSING' });
  } catch (err) {
    console.error('[ContentDifferentiation] POST error:', err);
    return NextResponse.json({ error: err.message || 'Failed to start job' }, { status: 500 });
  }
}
