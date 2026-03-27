import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifySignature } from '@/lib/site-keys';
import {
  syncSingleEntity,
  deleteSingleEntity,
  notifyEntityWebhookUpdate,
} from '@/lib/entity-sync';

/**
 * POST /api/public/wp/entity-updated
 * 
 * Called by the WordPress plugin when a post/page/CPT is created, updated, or deleted.
 * This enables real-time entity sync for WordPress sites with the plugin connected.
 * 
 * Headers:
 *   X-GP-Site-Key: gp_site_abc123
 *   X-GP-Timestamp: 1706450000
 *   X-GP-Signature: HMAC-SHA256 signature
 * 
 * Body:
 *   action: "created" | "updated" | "trashed" | "deleted"
 *   post_type: string (e.g., "posts", "pages", "project")
 *   post: {
 *     id: number,
 *     title: string,
 *     slug: string,
 *     status: string,
 *     content: string,
 *     excerpt: string,
 *     permalink: string,
 *     date: string,
 *     date_gmt: string,
 *     modified: string,
 *     author: number,
 *     author_name: string,
 *     featured_image: string|null,
 *     categories: array,
 *     tags: array,
 *     taxonomies: object,
 *     seo: object|null,
 *     acf: object|null,
 *     meta: object,
 *     template: string,
 *     menu_order: number,
 *     parent: number|null,
 *   }
 *   source: "wordpress" - identifies this came from WordPress (not gp-platform)
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
      select: {
        id: true,
        url: true,
        name: true,
        siteSecret: true,
        accountId: true,
        connectionStatus: true,
        entitySyncStatus: true,
      },
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
    const { action, post_type, post, source } = data;

    if (!action || !post_type || !post?.id) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: action, post_type, post.id' },
        { status: 400 },
      );
    }

    // Skip if this update originated from gp-platform (conflict prevention)
    // The publish-content cron sets source='gp-platform' when pushing to WordPress
    if (source === 'gp-platform') {
      console.log(`[WPWebhook] Skipping update for post ${post.id} - originated from gp-platform`);
      return NextResponse.json({ success: true, skipped: true, reason: 'gp-platform-origin' });
    }

    // If site is currently doing a full sync, skip the webhook update
    // to avoid conflicts with the batch sync process
    if (site.entitySyncStatus === 'SYNCING') {
      console.log(`[WPWebhook] Skipping update for post ${post.id} - full sync in progress`);
      return NextResponse.json({ success: true, skipped: true, reason: 'sync_in_progress' });
    }

    console.log(`[WPWebhook] ${action} ${post_type} #${post.id} "${post.title}" for site ${site.url}`);

    let result;

    if (action === 'deleted' || action === 'trashed') {
      // Handle deletion/trashing
      result = await deleteSingleEntity(site, { ...post, action });
    } else {
      // Handle create/update
      result = await syncSingleEntity(site, post_type, post);
    }

    // Send notification to account members
    if (result) {
      // Don't await - fire and forget to keep response fast
      notifyEntityWebhookUpdate(site, result, action, post_type).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      action: result?.action || action,
      entity: result ? { title: result.title, slug: result.slug } : null,
    });
  } catch (error) {
    console.error('[WPWebhook] Error processing entity update:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process entity update' },
      { status: 500 },
    );
  }
}
