import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifySignature } from '@/lib/site-keys';

/**
 * POST /api/public/wp/disconnect
 * Called by WordPress plugin on deactivation
 * 
 * Headers:
 *   X-GP-Site-Key: gp_site_abc123
 *   X-GP-Timestamp: 1706450000
 *   X-GP-Signature: HMAC-SHA256 signature
 */
export async function POST(request) {
  try {
    const siteKey = request.headers.get('X-GP-Site-Key');
    const timestamp = parseInt(request.headers.get('X-GP-Timestamp'), 10);
    const signature = request.headers.get('X-GP-Signature');

    if (!siteKey || !timestamp || !signature) {
      return NextResponse.json(
        { success: false, error: 'Missing required headers' },
        { status: 400 }
      );
    }

    // Get site by key
    const site = await prisma.site.findUnique({
      where: { siteKey },
      select: {
        id: true,
        siteSecret: true,
      },
    });

    if (!site) {
      return NextResponse.json(
        { success: false, error: 'Invalid site key' },
        { status: 404 }
      );
    }

    // Get request body
    const body = await request.text();
    
    // Verify signature
    const verification = verifySignature(body, timestamp, signature, site.siteSecret);
    if (!verification.valid) {
      return NextResponse.json(
        { success: false, error: verification.error },
        { status: 401 }
      );
    }

    // Update site status
    await prisma.site.update({
      where: { id: site.id },
      data: {
        connectionStatus: 'DISCONNECTED',
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Site disconnected',
    });
  } catch (error) {
    console.error('WP disconnect error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
