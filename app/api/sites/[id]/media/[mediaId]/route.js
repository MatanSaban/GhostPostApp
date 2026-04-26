import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cms, getCapabilities } from '@/lib/cms';

function checkConnection(site) {
  const caps = getCapabilities(site);
  const isShopifyConnected = !!site.shopifyAccessToken && !!site.shopifyDomain;
  const isWpConnected = !!site.siteKey && !!site.siteSecret;
  const isConnected = caps.platform === 'shopify' ? isShopifyConnected : isWpConnected;
  return { caps, isConnected };
}

function notConnectedResponse(caps) {
  return NextResponse.json(
    {
      error: caps.platform === 'shopify'
        ? 'Site is not connected. Install the GhostSEO Shopify app.'
        : 'Site is not connected. Please install and activate the plugin.',
    },
    { status: 400 },
  );
}

/**
 * PUT /api/sites/[id]/media/[mediaId]
 * Update a media item's metadata.
 */
export async function PUT(request, { params }) {
  try {
    const { id, mediaId } = await params;
    const body = await request.json();

    const site = await prisma.site.findUnique({ where: { id } });
    if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 });

    const { caps, isConnected } = checkConnection(site);
    if (!isConnected) return notConnectedResponse(caps);

    const result = await cms.updateMedia(site, mediaId, {
      title: body.title,
      alt: body.alt_text ?? body.alt,
      caption: body.caption,
      description: body.description,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating media:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update media' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/sites/[id]/media/[mediaId]
 * Delete a media item.
 */
export async function DELETE(request, { params }) {
  try {
    const { id, mediaId } = await params;

    const site = await prisma.site.findUnique({ where: { id } });
    if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 });

    const { caps, isConnected } = checkConnection(site);
    if (!isConnected) return notConnectedResponse(caps);

    const result = await cms.deleteMedia(site, mediaId);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error deleting media:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete media' },
      { status: 500 },
    );
  }
}
