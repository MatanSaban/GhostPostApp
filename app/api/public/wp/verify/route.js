import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifySignature } from '@/lib/site-keys';

/**
 * POST /api/public/wp/verify
 * Called by WordPress plugin on activation to verify connection
 * 
 * Headers:
 *   X-GP-Site-Key: gp_site_abc123
 *   X-GP-Timestamp: 1706450000
 *   X-GP-Signature: HMAC-SHA256 signature
 * 
 * Body:
 *   wpVersion: string
 *   phpVersion: string
 *   pluginVersion: string
 *   wpTimezone: string
 *   wpLocale: string
 *   siteUrl: string
 *   adminEmail: string
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

    // Get site by key (using findFirst since siteKey is indexed but not unique due to MongoDB null constraints)
    const site = await prisma.site.findFirst({
      where: { siteKey },
      select: {
        id: true,
        siteSecret: true,
        connectionStatus: true,
        name: true,
        url: true,
        sitePermissions: true,
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
    const data = JSON.parse(body);

    // Update site with connection info
    await prisma.site.update({
      where: { id: site.id },
      data: {
        connectionStatus: 'CONNECTED',
        lastPingAt: new Date(),
        pluginVersion: data.pluginVersion || null,
        wpVersion: data.wpVersion || null,
        phpVersion: data.phpVersion || null,
        wpTimezone: data.wpTimezone || null,
        wpLocale: data.wpLocale || null,
        // Mark that sync should be triggered (frontend will handle this)
        entitySyncStatus: site.connectionStatus !== 'CONNECTED' ? 'NEVER' : undefined,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Connection verified',
      site: {
        name: site.name,
        permissions: site.sitePermissions,
      },
      // Indicate if this is a fresh connection that needs sync
      shouldSync: site.connectionStatus !== 'CONNECTED',
    });
  } catch (error) {
    console.error('WP verify error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
