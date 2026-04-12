import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!userId) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });
}

async function verifySiteAccess(siteId, userId) {
  return prisma.site.findFirst({
    where: {
      id: siteId,
      account: { members: { some: { userId } } },
    },
    select: { id: true },
  });
}

/**
 * GET /api/contents?siteId=...&campaignId=...&status=...
 *
 * Returns Content (pipeline) records for the content-planner view.
 * Supports optional filters: campaignId, status (comma-separated).
 */
export async function GET(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    const campaignId = searchParams.get('campaignId');
    const statusFilter = searchParams.get('status'); // e.g. "SCHEDULED,PROCESSING"

    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
    }

    const site = await verifySiteAccess(siteId, user.id);
    if (!site) {
      return NextResponse.json({ error: 'Site not found or no access' }, { status: 404 });
    }

    const where = { siteId };

    if (campaignId) {
      where.campaignId = campaignId;
    }

    if (statusFilter) {
      const statuses = statusFilter.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length > 0) {
        where.status = { in: statuses };
      }
    }

    const contents = await prisma.content.findMany({
      where,
      orderBy: { scheduledAt: 'asc' },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        type: true,
        scheduledAt: true,
        publishedAt: true,
        wordCount: true,
        aiGenerated: true,
        aiResult: true, // Needed for retry logic (to detect processing vs publish failure)
        errorMessage: true,
        processingAttempts: true,
        publishAttempts: true,
        campaignId: true,
        campaignDeletedName: true,
        keywordId: true,
        createdAt: true,
        campaign: {
          select: { id: true, name: true, color: true, status: true },
        },
        keyword: {
          select: { id: true, keyword: true },
        },
      },
    });

    // Build summary stats
    const stats = {
      total: contents.length,
      scheduled: contents.filter(c => c.status === 'SCHEDULED').length,
      processing: contents.filter(c => c.status === 'PROCESSING').length,
      readyToPublish: contents.filter(c => c.status === 'READY_TO_PUBLISH').length,
      published: contents.filter(c => c.status === 'PUBLISHED').length,
      failed: contents.filter(c => c.status === 'FAILED').length,
    };

    return NextResponse.json({ contents, stats });
  } catch (error) {
    console.error('[Contents API] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
