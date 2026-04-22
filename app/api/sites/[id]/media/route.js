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
        ? 'Site is not connected. Install the Ghost Post Shopify app.'
        : 'Site is not connected. Please install and activate the plugin.',
    },
    { status: 400 },
  );
}

/**
 * Normalize a Ghost Post plugin media item to the WordPress REST API shape
 * the client expects (source_url, alt_text, title.rendered, media_details, etc.).
 */
function normalizePluginMediaItem(item) {
  if (!item || typeof item !== 'object') return item;
  // If already in WP REST API shape (has source_url), pass through untouched.
  if (item.source_url || item.media_details) return item;

  const sizes = {};
  if (item.sizes && typeof item.sizes === 'object') {
    for (const [name, data] of Object.entries(item.sizes)) {
      sizes[name] = {
        width: data?.width ?? null,
        height: data?.height ?? null,
        source_url: data?.url ?? data?.source_url ?? null,
      };
    }
  }

  return {
    id: item.id,
    slug: item.slug || '',
    date: item.date || null,
    alt_text: item.alt ?? item.alt_text ?? '',
    title: { rendered: item.title ?? '' },
    caption: { rendered: item.caption ?? '' },
    description: { rendered: item.description ?? '' },
    mime_type: item.mimeType ?? item.mime_type ?? '',
    source_url: item.url ?? item.source_url ?? '',
    media_details: {
      width: item.width ?? null,
      height: item.height ?? null,
      filesize: item.filesize ?? null,
      sizes,
    },
  };
}

/**
 * GET /api/sites/[id]/media
 * Fetch media items from the connected CMS.
 */
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);

    const page = parseInt(searchParams.get('page') || '1');
    const perPage = parseInt(searchParams.get('per_page') || '20');
    const mimeType = searchParams.get('mime_type') || '';
    const search = searchParams.get('search') || '';

    const site = await prisma.site.findUnique({ where: { id } });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const { caps, isConnected } = checkConnection(site);
    if (!isConnected) return notConnectedResponse(caps);

    const result = await cms.getMedia(site, { page, perPage, mimeType, search });

    const items = Array.isArray(result?.items) ? result.items.map(normalizePluginMediaItem) : [];
    const total = result?.total ?? items.length;
    const totalPages = result?.totalPages ?? result?.pages ?? 1;

    return NextResponse.json({ items, total, totalPages, page: result?.page ?? page });
  } catch (error) {
    console.error('Error fetching media:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch media' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/sites/[id]/media
 * Upload media to the connected CMS (URL or base64).
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();

    const site = await prisma.site.findUnique({ where: { id } });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const { caps, isConnected } = checkConnection(site);
    if (!isConnected) return notConnectedResponse(caps);

    let result;

    if (body.url) {
      result = await cms.uploadMediaFromUrl(site, body.url, {
        filename: body.filename,
        title: body.title,
        alt: body.alt,
        caption: body.caption,
        description: body.description,
        postId: body.postId,
      });
    } else if (body.base64 && body.filename) {
      result = await cms.uploadMediaFromBase64(site, body.base64, body.filename, {
        title: body.title,
        alt: body.alt,
        caption: body.caption,
        description: body.description,
        postId: body.postId,
      });
    } else {
      return NextResponse.json(
        { error: 'Either url or base64 with filename is required' },
        { status: 400 },
      );
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error uploading media:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to upload media' },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/sites/[id]/media
 * Update media metadata (alt, title, caption, description).
 */
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { mediaId, alt, title, caption, description } = body;

    if (!mediaId) {
      return NextResponse.json({ error: 'mediaId is required' }, { status: 400 });
    }

    const site = await prisma.site.findUnique({ where: { id } });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const { caps, isConnected } = checkConnection(site);
    if (!isConnected) return notConnectedResponse(caps);

    const result = await cms.updateMedia(site, mediaId, { alt, title, caption, description });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating media:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update media' },
      { status: 500 },
    );
  }
}
