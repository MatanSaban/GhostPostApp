import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import {
  validateParentChange,
  assertPillarUniqueness,
  ClusterTreeError,
} from '@/lib/cluster-tree';

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

// POST /api/clusters/[id]/promote-member
//
// Body: { entityId, name, mainKeyword, memberEntityIds[] }
//
// Promotes one of the parent cluster's members into the pillar of a new
// child sub-cluster. The user-facing primitive that creates recursion.
//
// Invariants enforced via lib/cluster-tree.js:
//   - entityId must already be a member of the parent cluster
//   - entityId must be included in the new child's memberEntityIds (it's the pillar)
//   - All memberEntityIds must belong to the parent's site
//   - entityId can't already be pillar of another live cluster (assertPillarUniqueness)
//   - Resulting depth must not exceed MAX_DEPTH (validateParentChange)
//
// Lands as CONFIRMED + CREATED_MANUALLY because the user is consciously creating it.
export async function POST(request, { params }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: parentId } = await params;
    const parent = await verifyClusterAccess(parentId, user);
    if (!parent) {
      return NextResponse.json({ error: 'Cluster not found or no access' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const { entityId, name, mainKeyword, memberEntityIds, expectedUpdatedAt } = body;

    // Optimistic-concurrency: parent may have been edited between modal-open and submit.
    if (expectedUpdatedAt) {
      const expected = new Date(expectedUpdatedAt).getTime();
      const actual = new Date(parent.updatedAt).getTime();
      if (Number.isFinite(expected) && expected !== actual) {
        return NextResponse.json(
          {
            error: 'Parent cluster was updated elsewhere',
            code: 'STALE',
            cluster: { id: parent.id, updatedAt: parent.updatedAt },
          },
          { status: 409 },
        );
      }
    }

    if (typeof entityId !== 'string' || !entityId) {
      return NextResponse.json({ error: 'entityId is required' }, { status: 400 });
    }
    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (typeof mainKeyword !== 'string' || !mainKeyword.trim()) {
      return NextResponse.json({ error: 'mainKeyword is required' }, { status: 400 });
    }
    if (!Array.isArray(memberEntityIds) || memberEntityIds.length === 0) {
      return NextResponse.json(
        { error: 'memberEntityIds must be a non-empty array' },
        { status: 400 },
      );
    }
    if (!memberEntityIds.includes(entityId)) {
      return NextResponse.json(
        { error: 'entityId must be included in memberEntityIds (it is the new pillar)' },
        { status: 400 },
      );
    }
    if (!parent.memberEntityIds.includes(entityId)) {
      return NextResponse.json(
        { error: 'entityId must be a member of the parent cluster' },
        { status: 400 },
      );
    }

    // All proposed members must belong to the parent's site.
    const found = await prisma.siteEntity.findMany({
      where: { siteId: parent.siteId, id: { in: memberEntityIds } },
      select: { id: true },
    });
    if (found.length !== memberEntityIds.length) {
      return NextResponse.json(
        { error: 'One or more memberEntityIds do not belong to this site' },
        { status: 400 },
      );
    }

    // Pillar uniqueness across the site.
    try {
      await assertPillarUniqueness({ siteId: parent.siteId, entityId });
    } catch (err) {
      if (err instanceof ClusterTreeError) {
        return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
      }
      throw err;
    }

    // Tree validation: synthetic child shape so validateParentChange can run
    // its pillar-in-parent + cycle + depth-cap checks against the real parent.
    try {
      await validateParentChange({
        cluster: {
          siteId: parent.siteId,
          pillarEntityId: entityId,
          memberEntityIds,
        },
        proposedParentId: parent.id,
      });
    } catch (err) {
      if (err instanceof ClusterTreeError) {
        return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
      }
      throw err;
    }

    const childDepth = (parent.depth ?? 0) + 1;

    const child = await prisma.topicCluster.create({
      data: {
        siteId: parent.siteId,
        name: name.trim(),
        mainKeyword: mainKeyword.trim(),
        pillarEntityId: entityId,
        memberEntityIds,
        status: 'CONFIRMED',
        source: 'CREATED_MANUALLY',
        parentClusterId: parent.id,
        depth: childDepth,
      },
    });

    return NextResponse.json({ cluster: child }, { status: 201 });
  } catch (error) {
    console.error('[Cluster Promote-Member API] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
