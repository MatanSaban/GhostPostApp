import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

// Verify super admin access
async function verifySuperAdmin() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isSuperAdmin: true },
    });

    if (!user || !user.isSuperAdmin) {
      return null;
    }

    return user;
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

/**
 * GET /api/admin/website-content
 * Get all website locales with content
 */
export async function GET() {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get site-wide SEO config
    const siteSeo = await prisma.websiteSeo.findUnique({
      where: { websiteId: 'gp-ws' }
    });

    // Get all locales
    const locales = await prisma.websiteLocale.findMany({
      where: { websiteId: 'gp-ws' },
      select: {
        id: true,
        locale: true,
        version: true,
        updatedAt: true,
        updatedBy: true,
        contentDraft: true,
        seoDraft: true
      },
      orderBy: { locale: 'asc' }
    });

    // Add draft status to each locale
    const localesWithStatus = locales.map(loc => ({
      ...loc,
      hasDraft: !!(loc.contentDraft || loc.seoDraft)
    }));

    return NextResponse.json({
      siteSeo,
      locales: localesWithStatus
    });
  } catch (error) {
    console.error('Error fetching website content:', error);
    return NextResponse.json(
      { error: 'Failed to fetch website content' },
      { status: 500 }
    );
  }
}
