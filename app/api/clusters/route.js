import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { analyzeClusterHealth } from '@/lib/cluster-health';

const SESSION_COOKIE = 'user_session';
const HEALTH_TOP_N_IN_LIST = 5;

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

    // Compute health for CONFIRMED clusters and embed inline so the UI doesn't
    // fan out N per-card health requests. Each issue list is capped at
    // HEALTH_TOP_N_IN_LIST; the per-cluster GET still returns the full lists.
    const confirmedIds = hydrated.filter((c) => c.status === 'CONFIRMED').map((c) => c.id);
    const healthByClusterId = {};
    if (confirmedIds.length > 0) {
      const results = await Promise.allSettled(
        confirmedIds.map((id) => analyzeClusterHealth({ clusterId: id, topN: HEALTH_TOP_N_IN_LIST })),
      );
      for (let i = 0; i < confirmedIds.length; i++) {
        const r = results[i];
        if (r.status === 'fulfilled') healthByClusterId[confirmedIds[i]] = r.value;
      }
    }
    const withHealth = hydrated.map((c) =>
      healthByClusterId[c.id] ? { ...c, health: healthByClusterId[c.id] } : c,
    );

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

    return NextResponse.json({ clusters: withHealth, statusCounts });
  } catch (error) {
    console.error('[Clusters API] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/clusters
// Body: { siteId, name, mainKeyword, memberEntityIds?, pillarEntityId? }
//
// Manual cluster creation — used by the orphan tray's "Create from selection"
// flow and any future direct-creation entry points. Always lands as CONFIRMED
// since the user is consciously creating it, not awaiting AI validation.
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { siteId, name, mainKeyword, memberEntityIds, pillarEntityId } = body;

    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
    }
    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (typeof mainKeyword !== 'string' || !mainKeyword.trim()) {
      return NextResponse.json({ error: 'mainKeyword is required' }, { status: 400 });
    }

    const site = await verifySiteAccess(siteId, user);
    if (!site) {
      return NextResponse.json({ error: 'Site not found or no access' }, { status: 404 });
    }

    // Validate that any provided member IDs actually belong to this site.
    let validMemberIds = [];
    if (Array.isArray(memberEntityIds) && memberEntityIds.length > 0) {
      const found = await prisma.siteEntity.findMany({
        where: { siteId, id: { in: memberEntityIds } },
        select: { id: true },
      });
      validMemberIds = found.map((e) => e.id);
      if (validMemberIds.length !== memberEntityIds.length) {
        return NextResponse.json(
          { error: 'One or more memberEntityIds do not belong to this site' },
          { status: 400 },
        );
      }
    }

    // Pillar must be one of the members (when both are provided).
    let validPillarId = null;
    if (pillarEntityId) {
      if (!validMemberIds.includes(pillarEntityId)) {
        return NextResponse.json(
          { error: 'pillarEntityId must be one of memberEntityIds' },
          { status: 400 },
        );
      }
      validPillarId = pillarEntityId;
    }

    const cluster = await prisma.topicCluster.create({
      data: {
        siteId,
        name: name.trim(),
        mainKeyword: mainKeyword.trim(),
        memberEntityIds: validMemberIds,
        pillarEntityId: validPillarId,
        status: 'CONFIRMED',
        source: 'CREATED_MANUALLY',
      },
    });

    return NextResponse.json({ cluster }, { status: 201 });
  } catch (error) {
    console.error('[Clusters API] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
