import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser, loadAccessibleSite, accountHasPaidPlan } from '@/lib/backlinks/access';

const LOST_WINDOW_DAYS = 30;

export async function GET(request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get('siteId');
  if (!siteId) {
    return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
  }

  const access = await loadAccessibleSite({ userId: user.id, isSuperAdmin: user.isSuperAdmin, siteId });
  if (!access) {
    return NextResponse.json({ error: 'Site not found or no access' }, { status: 404 });
  }
  if (!accountHasPaidPlan(access.account)) {
    return NextResponse.json({ error: 'Backlink Audit requires a paid plan', code: 'PLAN_REQUIRED' }, { status: 403 });
  }

  const baseWhere = { siteId, isHidden: false };
  const lostCutoff = new Date(Date.now() - LOST_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // Distinct referring domains use groupBy because Prisma's MongoDB connector
  // doesn't expose a direct DISTINCT operator. We count buckets, not rows.
  const [totalActive, totalLost, totalBroken, lostRecent, toxic, disavowed, domainGroups] = await Promise.all([
    prisma.backlink.count({ where: { ...baseWhere, status: 'ACTIVE' } }),
    prisma.backlink.count({ where: { ...baseWhere, status: 'LOST' } }),
    prisma.backlink.count({ where: { ...baseWhere, status: 'BROKEN' } }),
    prisma.backlink.count({
      where: { ...baseWhere, status: 'LOST', updatedAt: { gte: lostCutoff } },
    }),
    prisma.backlink.count({ where: { ...baseWhere, isToxic: true } }),
    prisma.backlink.count({ where: { ...baseWhere, isDisavowed: true } }),
    prisma.backlink.groupBy({
      by: ['referringDomain'],
      where: { ...baseWhere, status: { not: 'BROKEN' } },
    }),
  ]);

  return NextResponse.json({
    totals: {
      all: totalActive + totalLost + totalBroken,
      active: totalActive,
      lost: totalLost,
      broken: totalBroken,
    },
    referringDomains: domainGroups.length,
    lostRecent,
    toxic,
    disavowed,
    lostWindowDays: LOST_WINDOW_DAYS,
  });
}
