import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import {
  buildInstallUrl,
  isValidShopDomain,
  signState,
} from '@/lib/cms/adapters/shopify/oauth';

const SESSION_COOKIE = 'user_session';

/**
 * GET /api/shopify/install?shop={shop}.myshopify.com&siteId={id}
 *
 * Starts the Shopify OAuth flow for a given Site. Validates that the caller
 * owns the site (via account membership), signs a state token, and 302s to
 * Shopify's consent screen.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const shop = searchParams.get('shop');
    const siteId = searchParams.get('siteId');

    if (!shop || !isValidShopDomain(shop)) {
      return NextResponse.json(
        { error: 'Invalid or missing shop domain (must be *.myshopify.com)' },
        { status: 400 },
      );
    }
    if (!siteId) {
      return NextResponse.json({ error: 'Missing siteId' }, { status: 400 });
    }

    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
      select: { id: true, accountId: true },
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

    const state = signState({ siteId: site.id, accountId: site.accountId, shop });
    const url = buildInstallUrl({ shop, state });

    return NextResponse.redirect(url, { status: 302 });
  } catch (error) {
    console.error('[shopify/install] error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to start Shopify install' },
      { status: 500 },
    );
  }
}
