import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRedirects, bulkSyncRedirects, importRedirects } from '@/lib/wp-api-client';

/**
 * POST /api/sites/[id]/redirections/sync
 * Sync redirections between platform and WordPress.
 * 
 * Body: { direction: 'from-wp' | 'to-wp' }
 * - from-wp: Import redirects from WordPress into the platform database
 * - to-wp: Push platform redirects to WordPress plugin
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const direction = body.direction || 'from-wp';
    
    const site = await prisma.site.findUnique({
      where: { id },
      select: {
        id: true,
        url: true,
        siteKey: true,
        siteSecret: true,
        platform: true,
      },
    });
    
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }
    
    if (!site.siteKey || !site.siteSecret) {
      return NextResponse.json(
        { error: 'Site is not connected to WordPress plugin' },
        { status: 400 }
      );
    }
    
    if (direction === 'from-wp') {
      // Import from WordPress plugin into platform database
      const wpData = await getRedirects(site);
      const wpRedirects = wpData.redirects || wpData || [];
      
      let imported = 0;
      let skipped = 0;
      
      for (const r of wpRedirects) {
        const source = r.source || '';
        const target = r.target || '';
        if (!source || !target) continue;
        
        let normalizedSource = source.startsWith('/') ? source : `/${source}`;
        try { normalizedSource = decodeURIComponent(normalizedSource); } catch {}
        if (normalizedSource.length > 1 && normalizedSource.endsWith('/')) normalizedSource = normalizedSource.slice(0, -1);
        let normalizedTarget = target;
        try { normalizedTarget = decodeURIComponent(normalizedTarget); } catch {}
        
        // Map numeric type to enum
        const typeNum = parseInt(r.type, 10);
        let typeEnum = 'PERMANENT';
        if (typeNum === 302) typeEnum = 'TEMPORARY';
        else if (typeNum === 307) typeEnum = 'FOUND';
        
        try {
          await prisma.redirection.upsert({
            where: {
              siteId_sourceUrl: {
                siteId: id,
                sourceUrl: normalizedSource,
              },
            },
            update: {
              targetUrl: normalizedTarget,
              type: typeEnum,
              isActive: r.is_active !== false,
              hitCount: parseInt(r.hit_count, 10) || 0,
            },
            create: {
              siteId: id,
              sourceUrl: normalizedSource,
              targetUrl: normalizedTarget,
              type: typeEnum,
              isActive: r.is_active !== false,
              hitCount: parseInt(r.hit_count, 10) || 0,
            },
          });
          imported++;
        } catch (err) {
          skipped++;
        }
      }
      
      return NextResponse.json({
        success: true,
        direction: 'from-wp',
        imported,
        skipped,
        total: wpRedirects.length,
      });
      
    } else if (direction === 'to-wp') {
      // Push platform redirects to WordPress plugin
      const redirections = await prisma.redirection.findMany({
        where: { siteId: id },
      });
      
      const typeCodeMap = { PERMANENT: 301, TEMPORARY: 302, FOUND: 307 };
      
      const forWp = redirections.map(r => ({
        sourceUrl: r.sourceUrl,
        targetUrl: r.targetUrl,
        type: typeCodeMap[r.type] || 301,
        isActive: r.isActive,
        hitCount: r.hitCount,
        createdAt: r.createdAt,
      }));
      
      const result = await bulkSyncRedirects(site, forWp);
      
      return NextResponse.json({
        success: true,
        direction: 'to-wp',
        count: result.count || redirections.length,
      });
      
    } else if (direction === 'import-external') {
      // Import from detected third-party redirect plugin on WordPress,
      // then import those into our platform
      const importResult = await importRedirects(site);
      
      // Now fetch the GP storage redirects and save to platform
      const wpData = await getRedirects(site);
      const wpRedirects = wpData.redirects || wpData || [];
      
      let imported = 0;
      for (const r of wpRedirects) {
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
              siteId_sourceUrl: {
                siteId: id,
                sourceUrl: normalizedSource,
              },
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
      { status: 500 }
    );
  }
}
