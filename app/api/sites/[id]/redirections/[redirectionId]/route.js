import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cms, getCapabilities } from '@/lib/cms';

/**
 * Bulk-replace the redirect set on the connected CMS so it mirrors our DB.
 * Best-effort — failures are logged, not surfaced.
 */
async function syncAllToCms(site, siteId) {
  const caps = getCapabilities(site);
  const isShopifyConnected = !!site.shopifyAccessToken && !!site.shopifyDomain;
  const isWpConnected = !!site.siteKey && !!site.siteSecret;
  const isConnected = caps.platform === 'shopify' ? isShopifyConnected : isWpConnected;
  if (!isConnected) return;

  try {
    const redirections = await prisma.redirection.findMany({ where: { siteId } });

    const typeCodeMap = { PERMANENT: 301, TEMPORARY: 302, FOUND: 307 };
    const payload = redirections.map(r => ({
      sourceUrl: r.sourceUrl,
      targetUrl: r.targetUrl,
      type: typeCodeMap[r.type] || 301,
      isActive: r.isActive,
      hitCount: r.hitCount,
      createdAt: r.createdAt,
    }));

    await cms.bulkSyncRedirects(site, payload);
  } catch (err) {
    console.warn(`Failed to sync redirects to ${caps.platform}:`, err.message);
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

    const site = await prisma.site.findUnique({ where: { id } });
    if (site) {
      syncAllToCms(site, id);
    }

    return NextResponse.json(updated);
  } catch (error) {
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'A redirect for this source URL already exists' },
        { status: 409 },
      );
    }
    console.error('Error updating redirection:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 },
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

    await prisma.redirection.delete({ where: { id: redirectionId } });

    const site = await prisma.site.findUnique({ where: { id } });
    if (site) {
      syncAllToCms(site, id);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting redirection:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
