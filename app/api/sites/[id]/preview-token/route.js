import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import prisma from '@/lib/prisma';
import { signEditorToken } from '@/lib/editor-token';

const SESSION_COOKIE = 'user_session';

/**
 * GET /api/sites/[id]/preview-token
 * Returns a short-lived HMAC signed for the requesting browser's origin so
 * the WordPress plugin can trust iframe-embed requests without a Referer
 * allowlist. Caller receives { sig, exp, origin } and builds the iframe URL
 * with these as query params.
 */
export async function GET(request, { params }) {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isSuperAdmin: true,
      accountMemberships: { select: { accountId: true } },
    },
  });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const site = await prisma.site.findUnique({
    where: { id },
    select: { id: true, siteSecret: true, accountId: true },
  });
  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 });

  const hasAccess =
    user.isSuperAdmin || user.accountMemberships.some((m) => m.accountId === site.accountId);
  if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!site.siteSecret) {
    return NextResponse.json({ error: 'Site has no siteSecret — reconnect plugin' }, { status: 400 });
  }

  const hdrs = await headers();
  const originHeader = hdrs.get('origin');
  const host = hdrs.get('host');
  const proto = hdrs.get('x-forwarded-proto') || 'https';
  const parentOrigin = originHeader || (host ? `${proto}://${host}` : '');
  if (!parentOrigin) {
    return NextResponse.json({ error: 'Cannot determine parent origin' }, { status: 400 });
  }

  const token = signEditorToken({
    siteSecret: site.siteSecret,
    siteId: site.id,
    parentOrigin,
    ttlSeconds: 60 * 60,
  });
  return NextResponse.json(token);
}
