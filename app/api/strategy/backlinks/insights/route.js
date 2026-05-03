import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser, loadAccessibleSite, accountHasPaidPlan } from '@/lib/backlinks/access';

const MAX_LIMIT = 50;

export async function GET(request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get('siteId');
  if (!siteId) return NextResponse.json({ error: 'siteId is required' }, { status: 400 });

  const access = await loadAccessibleSite({
    userId: user.id,
    isSuperAdmin: user.isSuperAdmin,
    siteId,
  });
  if (!access) return NextResponse.json({ error: 'Site not found or no access' }, { status: 404 });
  if (!accountHasPaidPlan(access.account)) {
    return NextResponse.json({ error: 'Backlink Audit requires a paid plan', code: 'PLAN_REQUIRED' }, { status: 403 });
  }

  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(searchParams.get('limit') || 20)));

  const insights = await prisma.agentInsight.findMany({
    where: {
      siteId,
      category: 'BACKLINKS',
      status: 'PENDING',
    },
    orderBy: [
      // CRITICAL → HIGH → MEDIUM → LOW. Prisma's MongoDB connector doesn't
      // expose enum-ordered sorts, so we order by createdAt and sort client-side
      // when the priority order matters; here, newest-first is also a sensible
      // default since detection is run after each sync.
      { createdAt: 'desc' },
    ],
    take: limit,
    select: {
      id: true,
      category: true,
      type: true,
      priority: true,
      titleKey: true,
      descriptionKey: true,
      data: true,
      actionType: true,
      status: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ insights });
}
