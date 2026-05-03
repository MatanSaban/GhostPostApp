import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser, loadAccessibleSite, accountHasPaidPlan } from '@/lib/backlinks/access';

/**
 * Dismiss a backlinks insight. Marks status=REJECTED so it stops appearing
 * in the panel; future runs of the detector can still re-raise the SAME
 * dedup key (the underlying signal can recur, and the user opted out of an
 * older instance, not the entire signal type).
 */
export async function POST(request, { params }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const insight = await prisma.agentInsight.findUnique({
    where: { id },
    select: { id: true, siteId: true, category: true, status: true },
  });
  if (!insight) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (insight.category !== 'BACKLINKS') {
    return NextResponse.json({ error: 'Wrong category for this endpoint' }, { status: 400 });
  }

  const access = await loadAccessibleSite({
    userId: user.id,
    isSuperAdmin: user.isSuperAdmin,
    siteId: insight.siteId,
  });
  if (!access) return NextResponse.json({ error: 'No access' }, { status: 403 });
  if (!accountHasPaidPlan(access.account)) {
    return NextResponse.json({ error: 'Backlink Audit requires a paid plan', code: 'PLAN_REQUIRED' }, { status: 403 });
  }

  if (insight.status !== 'PENDING') {
    return NextResponse.json({ success: true, alreadyActioned: true });
  }

  await prisma.agentInsight.update({
    where: { id },
    data: { status: 'REJECTED', rejectedAt: new Date() },
  });

  return NextResponse.json({ success: true });
}
