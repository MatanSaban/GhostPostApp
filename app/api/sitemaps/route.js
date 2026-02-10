import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

/**
 * GET /api/sitemaps - Get all sitemaps for a site
 */
export async function GET(request) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');

    if (!siteId) {
      return NextResponse.json({ error: 'Site ID is required' }, { status: 400 });
    }

    // Verify user has access to this site
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        accountMemberships: {
          select: { accountId: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const accountIds = user.accountMemberships.map(m => m.accountId);

    const site = await prisma.site.findFirst({
      where: {
        id: siteId,
        accountId: { in: accountIds },
      },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Fetch sitemaps with user info
    const sitemaps = await prisma.siteSitemap.findMany({
      where: { siteId },
      include: {
        scannedByUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: [
        { isIndex: 'desc' },
        { createdAt: 'asc' },
      ],
    });

    return NextResponse.json({ sitemaps });
  } catch (error) {
    console.error('Error fetching sitemaps:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
