import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

/**
 * POST /api/shopify/disconnect
 * Body: { siteId }
 *
 * Revokes the Shopify connection on our side: wipes token + scopes, flips
 * status to DISCONNECTED. The merchant still needs to uninstall the app
 * from Shopify admin to fully revoke — we surface that in the UI.
 *
 * Webhook cleanup is a no-op in Phase 2 (we haven't registered any yet);
 * Phase 4 adds the deregistration loop.
 */
export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const siteId = body?.siteId;
    if (!siteId) {
      return NextResponse.json({ error: 'Missing siteId' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        isSuperAdmin: true,
        accountMemberships: { select: { accountId: true } },
      },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, accountId: true, shopifyDomain: true },
    });
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const hasAccess =
      user.isSuperAdmin ||
      user.accountMemberships.some((m) => m.accountId === site.accountId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await prisma.site.update({
      where: { id: siteId },
      data: {
        connectionStatus: 'DISCONNECTED',
        shopifyAccessToken: null,
        shopifyScopes: [],
        shopifyWebhookIds: null,
        shopifyAppInstalledAt: null,
      },
    });

    return NextResponse.json({
      success: true,
      shop: site.shopifyDomain,
      note:
        'Connection wiped on GhostSEO. To fully revoke, uninstall the app from your Shopify admin → Settings → Apps.',
    });
  } catch (error) {
    console.error('[shopify/disconnect] error:', error);
    return NextResponse.json(
      { error: 'Failed to disconnect Shopify' },
      { status: 500 },
    );
  }
}
