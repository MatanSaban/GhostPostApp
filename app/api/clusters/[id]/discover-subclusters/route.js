import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { discoverSubClusters } from '@/lib/ai/cluster-discovery';
import { MAX_DEPTH } from '@/lib/cluster-tree';

const SESSION_COOKIE = 'user_session';

// Recursive AI validation across many candidates per branch — match the main
// discover endpoint's headroom.
export const maxDuration = 300;

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!userId) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, isSuperAdmin: true },
  });
}

async function verifyClusterAccess(clusterId, user) {
  const cluster = await prisma.topicCluster.findUnique({
    where: { id: clusterId },
    include: { site: { select: { id: true, accountId: true } } },
  });
  if (!cluster) return null;
  if (user.isSuperAdmin) return cluster;
  const member = await prisma.accountMember.findFirst({
    where: { accountId: cluster.site.accountId, userId: user.id },
    select: { id: true },
  });
  return member ? cluster : null;
}

// POST /api/clusters/[id]/discover-subclusters
//
// Runs eager sub-cluster discovery for THIS cluster's branch only. Useful
// after the user edits a cluster's members (adds/removes) and wants to
// re-run discovery focused on just that branch, without rerunning top-level
// discovery for the whole site.
//
// Eligible parent clusters: CONFIRMED only (DISCOVERED clusters should be
// confirmed before sprouting sub-clusters), depth < MAX_DEPTH (deeper has no
// room to recurse), pillar set (sub-cluster requires the parent to be a real
// anchor).
export async function POST(_request, { params }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const cluster = await verifyClusterAccess(id, user);
    if (!cluster) {
      return NextResponse.json({ error: 'Cluster not found or no access' }, { status: 404 });
    }

    if (cluster.status !== 'CONFIRMED') {
      return NextResponse.json(
        {
          error: 'Sub-cluster discovery requires a CONFIRMED parent',
          code: 'PARENT_NOT_CONFIRMED',
        },
        { status: 400 },
      );
    }
    if (!cluster.pillarEntityId) {
      return NextResponse.json(
        {
          error: 'Sub-cluster discovery requires the parent to have a pillar',
          code: 'PARENT_HAS_NO_PILLAR',
        },
        { status: 400 },
      );
    }
    if (cluster.depth >= MAX_DEPTH) {
      return NextResponse.json(
        {
          error: `Cluster is already at max depth (${MAX_DEPTH}) — no room for sub-clusters`,
          code: 'DEPTH_EXCEEDED',
        },
        { status: 400 },
      );
    }

    const createdIds = await discoverSubClusters({
      parentCluster: {
        id: cluster.id,
        siteId: cluster.siteId,
        name: cluster.name,
        mainKeyword: cluster.mainKeyword,
        pillarEntityId: cluster.pillarEntityId,
        memberEntityIds: cluster.memberEntityIds,
        depth: cluster.depth,
      },
      accountId: cluster.site.accountId,
      userId: user.id,
      currentDepth: cluster.depth,
    });

    return NextResponse.json({
      success: true,
      subClustersCreated: createdIds.length,
      createdIds,
    });
  } catch (error) {
    console.error('[Cluster Discover-Subclusters API] error:', error);
    return NextResponse.json(
      { error: 'Sub-cluster discovery failed', message: error.message },
      { status: 500 },
    );
  }
}
