import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifySignature } from '@/lib/site-keys';

/**
 * POST /api/public/wp/redirect-updated
 * 
 * Called by the WordPress plugin when a redirect is created, updated, or deleted
 * in the WP admin. Enables real-time bidirectional redirect sync.
 * 
 * Headers:
 *   X-GP-Site-Key: gp_site_abc123
 *   X-GP-Timestamp: 1706450000
 *   X-GP-Signature: HMAC-SHA256 signature
 * 
 * Body:
 *   action: "created" | "updated" | "deleted"
 *   redirect: { source, target, type, is_active, hit_count }
 *   source: "wordpress"
 */
export async function POST(request) {
  try {
    const siteKey = request.headers.get('X-GP-Site-Key');
    const timestamp = parseInt(request.headers.get('X-GP-Timestamp'), 10);
    const signature = request.headers.get('X-GP-Signature');

    if (!siteKey || !timestamp || !signature) {
      return NextResponse.json(
        { success: false, error: 'Missing required headers' },
        { status: 400 },
      );
    }

    // Find site by key
    const site = await prisma.site.findFirst({
      where: { siteKey },
      select: { id: true, url: true, siteSecret: true },
    });

    if (!site) {
      return NextResponse.json(
        { success: false, error: 'Invalid site key' },
        { status: 404 },
      );
    }

    // Get raw body for signature verification
    const body = await request.text();

    // Verify HMAC signature
    const verification = verifySignature(body, timestamp, signature, site.siteSecret);
    if (!verification.valid) {
      return NextResponse.json(
        { success: false, error: verification.error },
        { status: 401 },
      );
    }

    // Parse body
    const data = JSON.parse(body);
    const { action, redirect, source } = data;

    // Skip if this update originated from gp-platform (conflict prevention)
    if (source === 'gp-platform') {
      return NextResponse.json({ success: true, skipped: true, reason: 'gp-platform-origin' });
    }

    if (!action || !redirect?.source) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: action, redirect.source' },
        { status: 400 },
      );
    }

    let normalizedSource = redirect.source.startsWith('/') ? redirect.source : `/${redirect.source}`;
    try { normalizedSource = decodeURIComponent(normalizedSource); } catch {}
    if (normalizedSource.length > 1 && normalizedSource.endsWith('/')) normalizedSource = normalizedSource.slice(0, -1);

    // Map numeric type to enum
    const typeNum = parseInt(redirect.type, 10);
    let typeEnum = 'PERMANENT';
    if (typeNum === 302) typeEnum = 'TEMPORARY';
    else if (typeNum === 307) typeEnum = 'FOUND';

    if (action === 'deleted') {
      // Delete the redirect from platform DB
      try {
        await prisma.redirection.delete({
          where: {
            siteId_sourceUrl: {
              siteId: site.id,
              sourceUrl: normalizedSource,
            },
          },
        });
      } catch (err) {
        // Not found is fine — already deleted or never existed
        if (err.code !== 'P2025') {
          throw err;
        }
      }

      console.log(`[WPRedirectWebhook] Deleted redirect ${normalizedSource} for site ${site.url}`);

      return NextResponse.json({ success: true, action: 'deleted', source: normalizedSource });
    }

    // For created/updated — upsert
    let normalizedTarget = redirect.target || '';
    try { normalizedTarget = decodeURIComponent(normalizedTarget); } catch {}

    const result = await prisma.redirection.upsert({
      where: {
        siteId_sourceUrl: {
          siteId: site.id,
          sourceUrl: normalizedSource,
        },
      },
      update: {
        targetUrl: normalizedTarget,
        type: typeEnum,
        isActive: redirect.is_active !== false,
        hitCount: parseInt(redirect.hit_count, 10) || 0,
      },
      create: {
        siteId: site.id,
        sourceUrl: normalizedSource,
        targetUrl: normalizedTarget,
        type: typeEnum,
        isActive: redirect.is_active !== false,
        hitCount: parseInt(redirect.hit_count, 10) || 0,
      },
    });

    console.log(`[WPRedirectWebhook] ${action} redirect ${normalizedSource} → ${redirect.target} for site ${site.url}`);

    return NextResponse.json({
      success: true,
      action,
      redirect: { id: result.id, source: result.sourceUrl, target: result.targetUrl },
    });
  } catch (error) {
    console.error('[WPRedirectWebhook] Error processing redirect update:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process redirect update' },
      { status: 500 },
    );
  }
}
