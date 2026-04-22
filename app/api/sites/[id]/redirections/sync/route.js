import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cms, getCapabilities } from '@/lib/cms';

/**
 * POST /api/sites/[id]/redirections/sync
 * Sync redirections between platform and the connected CMS (WP plugin or Shopify).
 *
 * Body: { direction: 'from-cms' | 'to-cms' | 'import-external' }
 *   from-cms        Pull redirects from the CMS into the platform DB
 *   to-cms          Push platform redirects to the CMS (bulk replace)
 *   import-external WP-only: scrape detected third-party redirect plugin, then pull
 *
 * Legacy aliases ('from-wp' / 'to-wp') still accepted.
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const rawDirection = body.direction || 'from-cms';
    const direction = rawDirection === 'from-wp' ? 'from-cms' : rawDirection === 'to-wp' ? 'to-cms' : rawDirection;

    const site = await prisma.site.findUnique({ where: { id } });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const caps = getCapabilities(site);
    const isShopifyConnected = !!site.shopifyAccessToken && !!site.shopifyDomain;
    const isWpConnected = !!site.siteKey && !!site.siteSecret;
    const isConnected = caps.platform === 'shopify' ? isShopifyConnected : isWpConnected;

    if (!isConnected) {
      return NextResponse.json(
        {
          error: caps.platform === 'shopify'
            ? 'Site is not connected. Install the Ghost Post Shopify app.'
            : 'Site is not connected to WordPress plugin',
        },
        { status: 400 },
      );
    }

    if (direction === 'from-cms') {
      const remoteData = await cms.getRedirects(site);
      const remoteRedirects = remoteData.redirects || remoteData || [];

      let imported = 0;
      let skipped = 0;

      for (const r of remoteRedirects) {
        const source = r.source || r.sourceUrl || '';
        const target = r.target || r.targetUrl || '';
        if (!source || !target) continue;

        let normalizedSource = source.startsWith('/') ? source : `/${source}`;
        try { normalizedSource = decodeURIComponent(normalizedSource); } catch {}
        if (normalizedSource.length > 1 && normalizedSource.endsWith('/')) normalizedSource = normalizedSource.slice(0, -1);
        let normalizedTarget = target;
        try { normalizedTarget = decodeURIComponent(normalizedTarget); } catch {}

        const typeNum = parseInt(r.type, 10);
        let typeEnum = 'PERMANENT';
        if (typeNum === 302) typeEnum = 'TEMPORARY';
        else if (typeNum === 307) typeEnum = 'FOUND';

        try {
          await prisma.redirection.upsert({
            where: {
              siteId_sourceUrl: { siteId: id, sourceUrl: normalizedSource },
            },
            update: {
              targetUrl: normalizedTarget,
              type: typeEnum,
              isActive: r.is_active !== false && r.isActive !== false,
              hitCount: parseInt(r.hit_count ?? r.hitCount, 10) || 0,
            },
            create: {
              siteId: id,
              sourceUrl: normalizedSource,
              targetUrl: normalizedTarget,
              type: typeEnum,
              isActive: r.is_active !== false && r.isActive !== false,
              hitCount: parseInt(r.hit_count ?? r.hitCount, 10) || 0,
            },
          });
          imported++;
        } catch {
          skipped++;
        }
      }

      return NextResponse.json({
        success: true,
        direction: 'from-cms',
        imported,
        skipped,
        total: remoteRedirects.length,
      });
    }

    if (direction === 'to-cms') {
      const redirections = await prisma.redirection.findMany({ where: { siteId: id } });

      const typeCodeMap = { PERMANENT: 301, TEMPORARY: 302, FOUND: 307 };
      const payload = redirections.map(r => ({
        sourceUrl: r.sourceUrl,
        targetUrl: r.targetUrl,
        type: typeCodeMap[r.type] || 301,
        isActive: r.isActive,
        hitCount: r.hitCount,
        createdAt: r.createdAt,
      }));

      const result = await cms.bulkSyncRedirects(site, payload);

      return NextResponse.json({
        success: true,
        direction: 'to-cms',
        count: result.count || redirections.length,
      });
    }

    if (direction === 'import-external') {
      // Only meaningful on WP — Shopify has no third-party redirect plugin concept.
      if (caps.platform !== 'wordpress') {
        return NextResponse.json(
          { error: 'External plugin import is only available on WordPress sites' },
          { status: 400 },
        );
      }

      const importResult = await cms.importRedirects(site);

      const remoteData = await cms.getRedirects(site);
      const remoteRedirects = remoteData.redirects || remoteData || [];

      let imported = 0;
      for (const r of remoteRedirects) {
        const source = r.source || '';
        const target = r.target || '';
        if (!source || !target) continue;

        let normalizedSource = source.startsWith('/') ? source : `/${source}`;
        try { normalizedSource = decodeURIComponent(normalizedSource); } catch {}
        if (normalizedSource.length > 1 && normalizedSource.endsWith('/')) normalizedSource = normalizedSource.slice(0, -1);
        let normalizedTarget = target;
        try { normalizedTarget = decodeURIComponent(normalizedTarget); } catch {}
        const typeNum = parseInt(r.type, 10);
        let typeEnum = 'PERMANENT';
        if (typeNum === 302) typeEnum = 'TEMPORARY';
        else if (typeNum === 307) typeEnum = 'FOUND';

        try {
          await prisma.redirection.upsert({
            where: {
              siteId_sourceUrl: { siteId: id, sourceUrl: normalizedSource },
            },
            update: {
              targetUrl: normalizedTarget,
              type: typeEnum,
              isActive: r.is_active !== false,
            },
            create: {
              siteId: id,
              sourceUrl: normalizedSource,
              targetUrl: normalizedTarget,
              type: typeEnum,
              isActive: r.is_active !== false,
            },
          });
          imported++;
        } catch {
          // Skip duplicates
        }
      }

      return NextResponse.json({
        success: true,
        direction: 'import-external',
        wpImported: importResult.imported || 0,
        wpSkipped: importResult.skipped || 0,
        platformImported: imported,
        source: importResult.source || 'unknown',
      });
    }

    return NextResponse.json({ error: 'Invalid direction' }, { status: 400 });
  } catch (error) {
    console.error('Error syncing redirections:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
