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
    select: { id: true, email: true, isSuperAdmin: true },
  });
}

async function verifySiteAccess(siteId, user) {
  const where = user.isSuperAdmin
    ? { id: siteId }
    : { id: siteId, account: { members: { some: { userId: user.id } } } };
  return prisma.site.findFirst({ where, select: { id: true } });
}

// Hydrate cluster member entities so the UI can show titles, urls, etc.
// memberEntityIds is a soft reference (no Prisma relation), so we resolve it manually.
async function hydrateMembers(clusters) {
  const allIds = new Set();
  for (const c of clusters) {
    for (const id of c.memberEntityIds || []) allIds.add(id);
  }
  if (allIds.size === 0) return clusters.map((c) => ({ ...c, members: [] }));

  const entities = await prisma.siteEntity.findMany({
    where: { id: { in: Array.from(allIds) } },
    select: { id: true, title: true, slug: true, url: true, status: true },
  });
  const byId = new Map(entities.map((e) => [e.id, e]));

  return clusters.map((c) => ({
    ...c,
    members: (c.memberEntityIds || []).map((id) => byId.get(id)).filter(Boolean),
  }));
}

// GET /api/clusters?siteId=xxx&status=DISCOVERED
//
// Lists topic clusters for a site. Hydrates member SiteEntity rows so the UI
// can render member titles without N+1 round trips.
export async function GET(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    const statusFilter = searchParams.get('status');

    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
    }

    const site = await verifySiteAccess(siteId, user);
    if (!site) {
      return NextResponse.json({ error: 'Site not found or no access' }, { status: 404 });
    }

    const where = { siteId };
    if (statusFilter) {
      where.status = statusFilter;
    }

    const clusters = await prisma.topicCluster.findMany({
      where,
      orderBy: [{ status: 'asc' }, { confidenceScore: 'desc' }, { createdAt: 'desc' }],
    });

    const hydrated = await hydrateMembers(clusters);

    // Aggregate counts so the UI can render filter chips without a second roundtrip.
    const counts = await prisma.topicCluster.groupBy({
      by: ['status'],
      where: { siteId },
      _count: { _all: true },
    });
    const statusCounts = counts.reduce((acc, row) => {
      acc[row.status] = row._count._all;
      return acc;
    }, {});

    return NextResponse.json({ clusters: hydrated, statusCounts });
  } catch (error) {
    console.error('[Clusters API] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
