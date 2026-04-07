import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';
const GP_WS_URL = process.env.GP_WS_URL || 'http://localhost:3001';
const REVALIDATE_SECRET = process.env.REVALIDATE_SECRET;

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

// Revalidate gp-ws cache
async function revalidateWebsite(tags) {
  if (!REVALIDATE_SECRET) {
    console.warn('REVALIDATE_SECRET not set, skipping revalidation');
    return;
  }

  try {
    const response = await fetch(`${GP_WS_URL}/api/revalidate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: REVALIDATE_SECRET, tags })
    });

    if (!response.ok) {
      console.error('Revalidation failed:', await response.text());
    }
  } catch (error) {
    console.error('Revalidation error:', error);
  }
}

/**
 * GET /api/admin/website-content/seo
 * Get site-wide SEO configuration
 */
export async function GET() {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const seo = await prisma.websiteSeo.findUnique({
      where: { websiteId: 'gp-ws' }
    });

    if (!seo) {
      // Return default if not exists
      return NextResponse.json({
        websiteId: 'gp-ws',
        siteName: { en: 'Ghost Post', he: 'גוסט פוסט', fr: 'Ghost Post' },
        siteUrl: 'https://ghostpost.co.il',
        defaultOgImage: '/og/default.png',
        twitterHandle: '@ghostpost',
        defaultRobots: 'index, follow, max-video-preview:-1, max-image-preview:large, max-snippet:-1'
      });
    }

    return NextResponse.json(seo);
  } catch (error) {
    console.error('Error fetching site SEO:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SEO' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/website-content/seo
 * Update site-wide SEO configuration
 */
export async function PUT(request) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { siteName, siteUrl, defaultOgImage, twitterHandle, defaultRobots } = body;

    const updated = await prisma.websiteSeo.upsert({
      where: { websiteId: 'gp-ws' },
      create: {
        websiteId: 'gp-ws',
        siteName: siteName || { en: 'Ghost Post', he: 'גוסט פוסט', fr: 'Ghost Post' },
        siteUrl: siteUrl || 'https://ghostpost.co.il',
        defaultOgImage,
        twitterHandle,
        defaultRobots: defaultRobots || 'index, follow',
        updatedBy: admin.id
      },
      update: {
        ...(siteName && { siteName }),
        ...(siteUrl && { siteUrl }),
        ...(defaultOgImage !== undefined && { defaultOgImage }),
        ...(twitterHandle !== undefined && { twitterHandle }),
        ...(defaultRobots !== undefined && { defaultRobots }),
        updatedBy: admin.id
      }
    });

    // Revalidate all website pages
    await revalidateWebsite(['website-seo', 'content-en', 'content-he', 'content-fr']);

    return NextResponse.json({
      success: true,
      seo: updated
    });
  } catch (error) {
    console.error('Error updating site SEO:', error);
    return NextResponse.json(
      { error: 'Failed to update SEO' },
      { status: 500 }
    );
  }
}
