import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) return null;
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        isSuperAdmin: true,
        lastSelectedAccountId: true,
        accountMemberships: { select: { accountId: true } },
      },
    });
  } catch {
    return null;
  }
}

/**
 * GET /api/agent/insights?siteId=xxx&limit=20&category=CONTENT&status=PENDING&cursor=xxx
 */
export async function GET(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
    }

    // Verify user has access to this site's account
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { accountId: true },
    });
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const hasAccess = user.isSuperAdmin || user.accountMemberships.some(m => m.accountId === site.accountId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const category = searchParams.get('category');
    const status = searchParams.get('status');
    const type = searchParams.get('type');
    const cursor = searchParams.get('cursor');

    const where = {
      siteId,
      dismissedAt: { isSet: false },
    };
    if (category) where.category = category;
    if (status) {
      where.status = status;
    } else {
      // By default, hide RESOLVED insights (they're kept for historical comparison)
      where.status = { not: 'RESOLVED' };
    }
    if (type) where.type = type;

    const findArgs = {
      where,
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      take: limit + 1,
    };

    if (cursor) {
      findArgs.skip = 1;
      findArgs.cursor = { id: cursor };
    }

    const [results, totalCount, pendingCount] = await Promise.all([
      prisma.agentInsight.findMany(findArgs),
      prisma.agentInsight.count({ where }),
      prisma.agentInsight.count({ where: { siteId, status: 'PENDING', dismissedAt: { isSet: false } } }),
    ]);

    const hasMore = results.length > limit;
    const items = hasMore ? results.slice(0, -1) : results;

    return NextResponse.json({
      items,
      hasMore,
      totalCount,
      pendingCount,
      nextCursor: hasMore ? items[items.length - 1]?.id : null,
    });
  } catch (error) {
    console.error('[Agent API] GET insights error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
