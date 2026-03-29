import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { bulkSyncRedirects } from '@/lib/wp-api-client';

/**
 * Sync all redirects from the platform DB to WordPress.
 * Uses bulk sync to replace the entire redirect set in WP (atomic operation).
 */
async function syncAllToWordPress(site, siteId) {
  if (!site.siteKey || !site.siteSecret || site.platform !== 'wordpress') return;

  try {
    const redirections = await prisma.redirection.findMany({
      where: { siteId },
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

    await bulkSyncRedirects(site, forWp);
  } catch (err) {
    console.warn('Failed to sync redirects to WordPress:', err.message);
  }
}

/**
 * PUT /api/sites/[id]/redirections/[redirectionId]
 * Update a redirection.
 */
export async function PUT(request, { params }) {
  try {
    const { id, redirectionId } = await params;
    const body = await request.json();
    
    const redirection = await prisma.redirection.findFirst({
      where: { id: redirectionId, siteId: id },
    });
    
    if (!redirection) {
      return NextResponse.json({ error: 'Redirection not found' }, { status: 404 });
    }
    
    const updateData = {};
    
    if (body.sourceUrl !== undefined) {
      let src = body.sourceUrl.startsWith('/') ? body.sourceUrl : `/${body.sourceUrl}`;
      try { src = decodeURIComponent(src); } catch {}
      if (src.length > 1 && src.endsWith('/')) src = src.slice(0, -1);
      updateData.sourceUrl = src;
    }
    if (body.targetUrl !== undefined) {
      let tgt = body.targetUrl;
      try { tgt = decodeURIComponent(tgt); } catch {}
      updateData.targetUrl = tgt;
    }
    if (body.type !== undefined) {
      const typeMap = { '301': 'PERMANENT', '302': 'TEMPORARY', '307': 'FOUND', 'PERMANENT': 'PERMANENT', 'TEMPORARY': 'TEMPORARY', 'FOUND': 'FOUND' };
      updateData.type = typeMap[String(body.type)] || redirection.type;
    }
    if (body.isActive !== undefined) {
      updateData.isActive = body.isActive;
    }
    
    const updated = await prisma.redirection.update({
      where: { id: redirectionId },
      data: updateData,
    });

    // Auto-sync to WordPress
    const site = await prisma.site.findUnique({
      where: { id },
      select: { id: true, url: true, siteKey: true, siteSecret: true, platform: true },
    });
    if (site) {
      syncAllToWordPress(site, id);
    }
    
    return NextResponse.json(updated);
    
  } catch (error) {
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'A redirect for this source URL already exists' },
        { status: 409 }
      );
    }
    console.error('Error updating redirection:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/sites/[id]/redirections/[redirectionId]
 * Delete a redirection.
 */
export async function DELETE(request, { params }) {
  try {
    const { id, redirectionId } = await params;
    
    const redirection = await prisma.redirection.findFirst({
      where: { id: redirectionId, siteId: id },
    });
    
    if (!redirection) {
      return NextResponse.json({ error: 'Redirection not found' }, { status: 404 });
    }
    
    await prisma.redirection.delete({
      where: { id: redirectionId },
    });

    // Auto-sync to WordPress (pushes remaining redirects)
    const site = await prisma.site.findUnique({
      where: { id },
      select: { id: true, url: true, siteKey: true, siteSecret: true, platform: true },
    });
    if (site) {
      syncAllToWordPress(site, id);
    }
    
    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error('Error deleting redirection:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
