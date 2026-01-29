import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifySignature } from '@/lib/site-keys';

/**
 * POST /api/public/wp/ping
 * Called by WordPress plugin periodically to maintain connection
 * 
 * Headers:
 *   X-GP-Site-Key: gp_site_abc123
 *   X-GP-Timestamp: 1706450000
 *   X-GP-Signature: HMAC-SHA256 signature
 * 
 * Body:
 *   pluginVersion: string (optional)
 *   wpVersion: string (optional)
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
        connectionStatus: true,
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

    // Parse body after verification
    const data = body ? JSON.parse(body) : {};

    // Update last ping time
    const updateData = {
      lastPingAt: new Date(),
      connectionStatus: 'CONNECTED',
    };

    if (data.pluginVersion) {
      updateData.pluginVersion = data.pluginVersion;
    }
    if (data.wpVersion) {
      updateData.wpVersion = data.wpVersion;
    }

    await prisma.site.update({
      where: { id: site.id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('WP ping error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
