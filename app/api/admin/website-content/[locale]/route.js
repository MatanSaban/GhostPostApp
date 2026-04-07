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
 * GET /api/admin/website-content/[locale]
 * Get full content and SEO for a specific locale
 */
export async function GET(request, { params }) {
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

    const localeData = await prisma.websiteLocale.findUnique({
      where: {
        websiteId_locale: {
          websiteId: 'gp-ws',
          locale
        }
      }
    });

    if (!localeData) {
      return NextResponse.json({ error: 'Locale not found' }, { status: 404 });
    }

    return NextResponse.json(localeData);
  } catch (error) {
    console.error('Error fetching locale:', error);
    return NextResponse.json(
      { error: 'Failed to fetch locale' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/website-content/[locale]
 * Update content and/or SEO for a locale
 * 
 * Body:
 * - content: object (optional) - Full content dictionary
 * - seo: object (optional) - SEO settings per page
 * - saveDraft: boolean (optional) - Save as draft instead of publishing
 */
export async function PUT(request, { params }) {
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

    const body = await request.json();
    const { content, seo, saveDraft = false } = body;

    if (!content && !seo) {
      return NextResponse.json(
        { error: 'Either content or seo must be provided' },
        { status: 400 }
      );
    }

    // Build update data
    const updateData = {
      updatedBy: admin.id
    };

    if (saveDraft) {
      // Save to draft fields
      if (content) updateData.contentDraft = content;
      if (seo) updateData.seoDraft = seo;
    } else {
      // Publish directly
      if (content) {
        updateData.content = content;
        updateData.contentDraft = null; // Clear draft
      }
      if (seo) {
        updateData.seo = seo;
        updateData.seoDraft = null; // Clear draft
      }
      updateData.version = { increment: 1 };
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

    // Revalidate gp-ws cache if publishing (not draft)
    if (!saveDraft) {
      const tags = [`content-${locale}`, `website-${locale}`];
      if (seo) {
        // Add page-specific SEO tags
        Object.keys(seo).forEach(page => {
          tags.push(`seo-${locale}-${page}`);
        });
        tags.push(`website-seo-${locale}`);
      }
      await revalidateWebsite(tags);
    }

    return NextResponse.json({
      success: true,
      locale: updated.locale,
      version: updated.version,
      isDraft: saveDraft
    });
  } catch (error) {
    console.error('Error updating locale:', error);
    return NextResponse.json(
      { error: 'Failed to update locale' },
      { status: 500 }
    );
  }
}
