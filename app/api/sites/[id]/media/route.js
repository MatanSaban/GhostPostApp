import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getMedia, uploadMediaFromUrl, uploadMediaFromBase64, updateMedia } from '@/lib/wp-api-client';

/**
 * GET /api/sites/[id]/media
 * Fetch media items from the WordPress site
 */
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    
    const page = parseInt(searchParams.get('page') || '1');
    const perPage = parseInt(searchParams.get('per_page') || '20');
    const mimeType = searchParams.get('mime_type') || '';
    const search = searchParams.get('search') || '';
    
    // Get the site
    const site = await prisma.site.findUnique({
      where: { id },
      select: {
        id: true,
        url: true,
        siteKey: true,
        siteSecret: true,
      },
    });
    
    if (!site) {
      return NextResponse.json(
        { error: 'Site not found' },
        { status: 404 }
      );
    }
    
    if (!site.siteKey || !site.siteSecret) {
      return NextResponse.json(
        { error: 'Site is not connected. Please install and activate the plugin.' },
        { status: 400 }
      );
    }
    
    // Fetch media from WordPress
    const result = await getMedia(site, {
      page,
      perPage,
      mimeType,
      search,
    });
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching media:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch media' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sites/[id]/media
 * Upload media to the WordPress site
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    // Get the site
    const site = await prisma.site.findUnique({
      where: { id },
      select: {
        id: true,
        url: true,
        siteKey: true,
        siteSecret: true,
      },
    });
    
    if (!site) {
      return NextResponse.json(
        { error: 'Site not found' },
        { status: 404 }
      );
    }
    
    if (!site.siteKey || !site.siteSecret) {
      return NextResponse.json(
        { error: 'Site is not connected. Please install and activate the plugin.' },
        { status: 400 }
      );
    }
    
    let result;
    
    // Upload from URL
    if (body.url) {
      result = await uploadMediaFromUrl(site, body.url, {
        filename: body.filename,
        title: body.title,
        alt: body.alt,
        caption: body.caption,
        description: body.description,
        postId: body.postId,
      });
    }
    // Upload from base64
    else if (body.base64 && body.filename) {
      result = await uploadMediaFromBase64(site, body.base64, body.filename, {
        title: body.title,
        alt: body.alt,
        caption: body.caption,
        description: body.description,
        postId: body.postId,
      });
    }
    else {
      return NextResponse.json(
        { error: 'Either url or base64 with filename is required' },
        { status: 400 }
      );
    }
    
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error uploading media:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to upload media' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/sites/[id]/media
 * Update media metadata (alt, title, caption, description)
 */
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { mediaId, alt, title, caption, description } = body;
    
    if (!mediaId) {
      return NextResponse.json(
        { error: 'mediaId is required' },
        { status: 400 }
      );
    }
    
    // Get the site
    const site = await prisma.site.findUnique({
      where: { id },
      select: {
        id: true,
        url: true,
        siteKey: true,
        siteSecret: true,
      },
    });
    
    if (!site) {
      return NextResponse.json(
        { error: 'Site not found' },
        { status: 404 }
      );
    }
    
    if (!site.siteKey || !site.siteSecret) {
      return NextResponse.json(
        { error: 'Site is not connected. Please install and activate the plugin.' },
        { status: 400 }
      );
    }
    
    // Update media in WordPress
    const result = await updateMedia(site, mediaId, {
      alt,
      title,
      caption,
      description,
    });
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating media:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update media' },
      { status: 500 }
    );
  }
}
