/**
 * Content API
 * 
 * Create and manage AI-generated content
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

// Get authenticated user
async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) return null;

    return await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        isSuperAdmin: true,
        accountMemberships: { select: { accountId: true } },
      },
    });
  } catch {
    return null;
  }
}

/**
 * GET /api/content
 * List content for a site
 */
export async function GET(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    const status = searchParams.get('status');
    const type = searchParams.get('type');

    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
    }

    // Verify site access
    const accountIds = user.accountMemberships.map(m => m.accountId);
    const site = await prisma.site.findFirst({
      where: user.isSuperAdmin
        ? { id: siteId }
        : { id: siteId, accountId: { in: accountIds } },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Build query
    const where = { siteId };
    if (status) where.status = status;
    if (type) where.type = type;

    const contents = await prisma.content.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        keyword: { select: { id: true, keyword: true } },
        campaign: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ contents });
  } catch (error) {
    console.error('[Content API] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch content' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/content
 * Create new content (from AI generation or manual)
 */
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      siteId,
      keywordId,
      campaignId,
      title,
      html,
      slug,
      excerpt,
      metaTitle,
      metaDescription,
      type = 'BLOG_POST',
      status = 'DRAFT',
      scheduledAt,
      wordCount,
    } = body;

    if (!siteId || !title) {
      return NextResponse.json(
        { error: 'siteId and title are required' },
        { status: 400 }
      );
    }

    // Verify site access
    const accountIds = user.accountMemberships.map(m => m.accountId);
    const site = await prisma.site.findFirst({
      where: user.isSuperAdmin
        ? { id: siteId }
        : { id: siteId, accountId: { in: accountIds } },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Create content
    const content = await prisma.content.create({
      data: {
        siteId,
        keywordId: keywordId || undefined,
        campaignId: campaignId || undefined,
        title,
        content: html,
        slug: slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        excerpt,
        metaTitle: metaTitle || title,
        metaDescription,
        type,
        status,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
        wordCount,
        aiGenerated: true,
      },
    });

    return NextResponse.json({ content }, { status: 201 });
  } catch (error) {
    console.error('[Content API] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to create content' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/content
 * Update existing content
 */
export async function PATCH(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { contentId, ...updateData } = body;

    if (!contentId) {
      return NextResponse.json({ error: 'contentId is required' }, { status: 400 });
    }

    // Get content with site info
    const existingContent = await prisma.content.findUnique({
      where: { id: contentId },
      include: { site: true },
    });

    if (!existingContent) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    }

    // Verify access
    const accountIds = user.accountMemberships.map(m => m.accountId);
    if (!user.isSuperAdmin && !accountIds.includes(existingContent.site.accountId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Prepare update data
    const data = {};
    if (updateData.title !== undefined) data.title = updateData.title;
    if (updateData.html !== undefined) data.content = updateData.html;
    if (updateData.slug !== undefined) data.slug = updateData.slug;
    if (updateData.excerpt !== undefined) data.excerpt = updateData.excerpt;
    if (updateData.metaTitle !== undefined) data.metaTitle = updateData.metaTitle;
    if (updateData.metaDescription !== undefined) data.metaDescription = updateData.metaDescription;
    if (updateData.type !== undefined) data.type = updateData.type;
    if (updateData.status !== undefined) data.status = updateData.status;
    if (updateData.scheduledAt !== undefined) {
      data.scheduledAt = updateData.scheduledAt ? new Date(updateData.scheduledAt) : null;
    }
    if (updateData.wordCount !== undefined) data.wordCount = updateData.wordCount;

    const content = await prisma.content.update({
      where: { id: contentId },
      data,
    });

    return NextResponse.json({ content });
  } catch (error) {
    console.error('[Content API] PATCH error:', error);
    return NextResponse.json(
      { error: 'Failed to update content' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/content
 * Delete content
 */
export async function DELETE(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const contentId = searchParams.get('contentId');

    if (!contentId) {
      return NextResponse.json({ error: 'contentId is required' }, { status: 400 });
    }

    // Get content with site info
    const content = await prisma.content.findUnique({
      where: { id: contentId },
      include: { site: true },
    });

    if (!content) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    }

    // Verify access
    const accountIds = user.accountMemberships.map(m => m.accountId);
    if (!user.isSuperAdmin && !accountIds.includes(content.site.accountId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    await prisma.content.delete({
      where: { id: contentId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Content API] DELETE error:', error);
    return NextResponse.json(
      { error: 'Failed to delete content' },
      { status: 500 }
    );
  }
}
