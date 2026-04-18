import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifySignature } from '@/lib/site-keys';

/**
 * POST /api/public/wp/check-version
 * Returns the latest plugin version so WordPress can check for updates.
 *
 * Headers:
 *   X-GP-Site-Key, X-GP-Timestamp, X-GP-Signature
 * Body:
 *   { siteUrl: string, currentVersion?: string }
 */

// The latest plugin version — bump this when releasing a new version
const LATEST_PLUGIN_VERSION = '2.9.2';

export async function POST(request) {
  try {
    const siteKey = request.headers.get('X-GP-Site-Key');
    const timestamp = parseInt(request.headers.get('X-GP-Timestamp'), 10);
    const signature = request.headers.get('X-GP-Signature');

    if (!siteKey || !timestamp || !signature) {
      return NextResponse.json({ success: false, error: 'Missing required headers' }, { status: 400 });
    }

    const site = await prisma.site.findFirst({
      where: { siteKey },
      select: {
        id: true,
        siteSecret: true,
        pluginVersion: true,
      },
    });

    if (!site) {
      return NextResponse.json({ success: false, error: 'Invalid site key' }, { status: 404 });
    }

    const body = await request.text();
    const verification = verifySignature(body, timestamp, signature, site.siteSecret);
    if (!verification.valid) {
      return NextResponse.json({ success: false, error: verification.error }, { status: 401 });
    }

    const data = JSON.parse(body);

    // Update the site's plugin version if provided
    if (data.pluginVersion && data.pluginVersion !== site.pluginVersion) {
      await prisma.site.update({
        where: { id: site.id },
        data: { pluginVersion: data.pluginVersion },
      });
    }

    return NextResponse.json({
      version: LATEST_PLUGIN_VERSION,
      download_url: '',
      changelog: '',
    });
  } catch (error) {
    console.error('WP check-version error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
