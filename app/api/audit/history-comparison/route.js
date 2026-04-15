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
        accountMemberships: { select: { accountId: true } },
      },
    });
  } catch {
    return null;
  }
}

async function verifySiteAccess(user, siteId) {
  const accountIds = user.accountMemberships.map(m => m.accountId);
  return prisma.site.findFirst({
    where: user.isSuperAdmin ? { id: siteId } : { id: siteId, accountId: { in: accountIds } },
    select: { id: true },
  });
}

/**
 * GET /api/audit/history-comparison?siteId=X&deviceType=desktop
 *
 * Returns the last 10 completed audits as a timeline + deltas between
 * the two most recent audits.
 */
export async function GET(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    const deviceType = searchParams.get('deviceType') || 'desktop';

    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
    }

    const site = await verifySiteAccess(user, siteId);
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Fetch last 10 completed audits (light — only scores + dates + issue counts)
    const audits = await prisma.siteAudit.findMany({
      where: {
        siteId,
        status: 'COMPLETED',
        ...(deviceType ? { deviceType } : {}),
      },
      select: {
        id: true,
        score: true,
        categoryScores: true,
        issues: true,
        completedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    if (audits.length === 0) {
      return NextResponse.json({ timeline: [], deltas: null });
    }

    // Build timeline (ascending for chart)
    const timeline = audits
      .slice()
      .reverse()
      .map(a => ({
        date: a.completedAt || a.createdAt,
        score: a.score ?? 0,
      }));

    // Calculate deltas between latest (index 0) and previous (index 1)
    let deltas = null;
    if (audits.length >= 2) {
      const latest = audits[0];
      const previous = audits[1];

      const latestCat = latest.categoryScores || {};
      const prevCat = previous.categoryScores || {};

      const countErrors = (issues) =>
        (issues || []).filter(i => i.severity === 'error').length;

      const latestErrors = countErrors(latest.issues);
      const previousErrors = countErrors(previous.issues);

      deltas = {
        score: (latest.score ?? 0) - (previous.score ?? 0),
        technical: (latestCat.technical ?? 0) - (prevCat.technical ?? 0),
        performance: (latestCat.performance ?? 0) - (prevCat.performance ?? 0),
        visual: (latestCat.visual ?? 0) - (prevCat.visual ?? 0),
        accessibility: (latestCat.accessibility ?? 0) - (prevCat.accessibility ?? 0),
        fixedIssues: previousErrors - latestErrors,
      };
    }

    return NextResponse.json({ timeline, deltas });
  } catch (error) {
    console.error('[API/audit/history-comparison] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
