import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';
const MAX_ORPHANS = 200;

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!userId) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, isSuperAdmin: true },
  });
}

async function verifySiteAccess(siteId, user) {
  const where = user.isSuperAdmin
    ? { id: siteId }
    : { id: siteId, account: { members: { some: { userId: user.id } } } };
  return prisma.site.findFirst({ where, select: { id: true } });
}

// GET /api/clusters/orphans?siteId=X
//
// Returns PUBLISHED SiteEntity rows that are NOT in any non-REJECTED cluster.
// Definition of "claimed": entity appears in memberEntityIds of any TopicCluster
// with status DISCOVERED or CONFIRMED. REJECTED clusters don't claim their members
// (the user said the GROUPING is bad, but the entities are free to be re-clustered).
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

    const site = await verifySiteAccess(siteId, user);
    if (!site) {
      return NextResponse.json({ error: 'Site not found or no access' }, { status: 404 });
    }

    // Build the set of "claimed" entity IDs.
    const claimingClusters = await prisma.topicCluster.findMany({
      where: { siteId, status: { in: ['DISCOVERED', 'CONFIRMED'] } },
      select: { memberEntityIds: true },
    });
    const claimed = new Set();
    for (const c of claimingClusters) {
      for (const id of c.memberEntityIds || []) claimed.add(id);
    }

    const entities = await prisma.siteEntity.findMany({
      where: {
        siteId,
        status: 'PUBLISHED',
        ...(claimed.size > 0 ? { NOT: { id: { in: Array.from(claimed) } } } : {}),
      },
      select: {
        id: true,
        title: true,
        slug: true,
        url: true,
        excerpt: true,
        publishedAt: true,
        entityTypeId: true,
      },
      orderBy: { publishedAt: 'desc' },
      take: MAX_ORPHANS,
    });

    // Total orphan count (uncapped) so the UI can show "+N more".
    const totalOrphans = await prisma.siteEntity.count({
      where: {
        siteId,
        status: 'PUBLISHED',
        ...(claimed.size > 0 ? { NOT: { id: { in: Array.from(claimed) } } } : {}),
      },
    });

    return NextResponse.json({
      orphans: entities,
      totalOrphans,
      capped: totalOrphans > entities.length,
      claimedCount: claimed.size,
    });
  } catch (error) {
    console.error('[Clusters Orphans API] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
