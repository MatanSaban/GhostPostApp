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
    } else {
      console.log('Revalidated tags:', tags);
    }
  } catch (error) {
    console.error('Revalidation error:', error);
  }
}

/**
 * POST /api/admin/website-content/[locale]/publish
 * Publish draft content and SEO
 */
export async function POST(request, { params }) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { locale } = await params;
    const validLocales = ['en', 'he', 'fr'];
    if (!validLocales.includes(locale)) {
      return NextResponse.json({ error: 'Invalid locale' }, { status: 400 });
    }

    // Get current data
    const current = await prisma.websiteLocale.findUnique({
      where: {
        websiteId_locale: {
          websiteId: 'gp-ws',
          locale
        }
      }
    });

    if (!current) {
      return NextResponse.json({ error: 'Locale not found' }, { status: 404 });
    }

    if (!current.contentDraft && !current.seoDraft) {
      return NextResponse.json(
        { error: 'No draft to publish' },
        { status: 400 }
      );
    }

    // Build update data - copy drafts to published
    const updateData = {
      updatedBy: admin.id,
      version: { increment: 1 }
    };

    if (current.contentDraft) {
      updateData.content = current.contentDraft;
      updateData.contentDraft = null;
    }
    if (current.seoDraft) {
      updateData.seo = current.seoDraft;
      updateData.seoDraft = null;
    }

    const updated = await prisma.websiteLocale.update({
      where: {
        websiteId_locale: {
          websiteId: 'gp-ws',
          locale
        }
      },
      data: updateData
    });

    // Revalidate gp-ws cache
    const tags = [`content-${locale}`, `website-${locale}`, `website-seo-${locale}`];
    await revalidateWebsite(tags);

    return NextResponse.json({
      success: true,
      locale: updated.locale,
      version: updated.version,
      published: true
    });
  } catch (error) {
    console.error('Error publishing locale:', error);
    return NextResponse.json(
      { error: 'Failed to publish' },
      { status: 500 }
    );
  }
}
