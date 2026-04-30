import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import {
  validateParentChange,
  assertPillarUniqueness,
  recomputeDepths,
  ClusterTreeError,
} from '@/lib/cluster-tree';

const SESSION_COOKIE = 'user_session';
const VALID_STATUSES = new Set(['DISCOVERED', 'CONFIRMED', 'REJECTED']);
const VALID_CASCADES = new Set(['reparent', 'detach']);

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

function treeErrorToResponse(err) {
  return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
}

// GET /api/clusters/[id]
//
// Returns the cluster with its members hydrated and the pillar SiteEntity included.
// Used by the AI Content Wizard when launched via ?clusterId=X to pre-fill pillar
// URL, main keyword, and seed gap suggestions.
export async function GET(_request, { params }) {
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

    const members = cluster.memberEntityIds?.length
      ? await prisma.siteEntity.findMany({
          where: { id: { in: cluster.memberEntityIds } },
          select: { id: true, title: true, slug: true, url: true, status: true },
        })
      : [];

    const pillar = cluster.pillarEntityId
      ? members.find((m) => m.id === cluster.pillarEntityId) || null
      : null;

    // Strip the joined `site` field — caller doesn't need it and we already
    // verified access. Keep response shape minimal.
    const { site: _site, ...clusterPayload } = cluster;

    return NextResponse.json({
      cluster: { ...clusterPayload, members, pillar },
    });
  } catch (error) {
    console.error('[Cluster API] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/clusters/[id]
// Body: { status?, name?, mainKeyword?, pillarEntityId?, parentClusterId? }
//
// Allows the user to confirm/reject a discovered cluster, edit its name/keyword,
// set the pillar, or attach/detach the cluster from a parent.
//
// Tree invariants enforced via lib/cluster-tree.js:
//   - parentClusterId change runs validateParentChange (cycle, depth, pillar-in-parent)
//   - pillarEntityId change runs assertPillarUniqueness (one cluster per entity)
//   - Removing pillar while children exist is rejected (would orphan subtree)
export async function PATCH(request, { params }) {
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

    const body = await request.json().catch(() => ({}));
    const { status, name, mainKeyword, pillarEntityId, parentClusterId, expectedUpdatedAt } = body;

    // Optimistic-concurrency check.
    if (expectedUpdatedAt) {
      const expected = new Date(expectedUpdatedAt).getTime();
      const actual = new Date(cluster.updatedAt).getTime();
      if (Number.isFinite(expected) && expected !== actual) {
        return NextResponse.json(
          {
            error: 'Cluster was updated elsewhere',
            code: 'STALE',
            cluster: { id: cluster.id, updatedAt: cluster.updatedAt },
          },
          { status: 409 },
        );
      }
    }

    const data = {};
    let parentLinkChanged = false;

    if (status !== undefined) {
      if (!VALID_STATUSES.has(status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${Array.from(VALID_STATUSES).join(', ')}` },
          { status: 400 },
        );
      }
      data.status = status;
    }

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 });
      }
      data.name = name.trim();
    }

    if (mainKeyword !== undefined) {
      if (typeof mainKeyword !== 'string' || !mainKeyword.trim()) {
        return NextResponse.json({ error: 'mainKeyword must be a non-empty string' }, { status: 400 });
      }
      data.mainKeyword = mainKeyword.trim();
    }

    if (pillarEntityId !== undefined) {
      if (pillarEntityId === null) {
        // Reject pillar-removal if this cluster has children — they'd be orphaned
        // by the tree invariant (child's pillar must be member of parent, but if
        // parent has no pillar at all the relationship still holds; the bigger
        // issue is the child's parent linkage relies on the parent being a
        // *real* anchor). Conservative call: forbid removing pillar from a node
        // with children.
        const childCount = await prisma.topicCluster.count({
          where: { parentClusterId: id },
        });
        if (childCount > 0) {
          return NextResponse.json(
            {
              error: 'Cannot remove pillar from a cluster that has sub-clusters',
              code: 'ORPHAN_CHILDREN',
            },
            { status: 400 },
          );
        }
        data.pillarEntityId = null;
      } else if (typeof pillarEntityId === 'string' && cluster.memberEntityIds.includes(pillarEntityId)) {
        try {
          await assertPillarUniqueness({
            siteId: cluster.siteId,
            entityId: pillarEntityId,
            excludeClusterId: id,
          });
        } catch (err) {
          if (err instanceof ClusterTreeError) return treeErrorToResponse(err);
          throw err;
        }
        data.pillarEntityId = pillarEntityId;
      } else {
        return NextResponse.json(
          { error: 'pillarEntityId must be null or one of the cluster member entity IDs' },
          { status: 400 },
        );
      }
    }

    if (parentClusterId !== undefined) {
      const proposed = parentClusterId === null ? null : parentClusterId;
      // Validate against the cluster as it WILL look after this update —
      // pillar may be changing in the same request.
      const effectivePillarId =
        data.pillarEntityId !== undefined ? data.pillarEntityId : cluster.pillarEntityId;
      try {
        await validateParentChange({
          cluster: {
            id: cluster.id,
            siteId: cluster.siteId,
            pillarEntityId: effectivePillarId,
            memberEntityIds: cluster.memberEntityIds,
            depth: cluster.depth,
          },
          proposedParentId: proposed,
        });
      } catch (err) {
        if (err instanceof ClusterTreeError) return treeErrorToResponse(err);
        throw err;
      }
      data.parentClusterId = proposed;
      parentLinkChanged = proposed !== cluster.parentClusterId;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const updated = await prisma.topicCluster.update({
      where: { id },
      data,
    });

    if (parentLinkChanged) {
      // Recompute depths for this cluster and all its descendants.
      await recomputeDepths(id);
      // Re-read so the response reflects the new depth.
      const refreshed = await prisma.topicCluster.findUnique({ where: { id } });
      return NextResponse.json({ cluster: refreshed });
    }

    return NextResponse.json({ cluster: updated });
  } catch (error) {
    console.error('[Cluster API] PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/clusters/[id]?cascade=reparent|detach
//
// Removes a cluster row. Children are re-attached based on the cascade mode:
//   - 'reparent' (default): children inherit the deleted cluster's parent
//                            (so a leaf-of-leaf becomes a leaf when its parent
//                            is removed). Preserves topology when possible.
//   - 'detach':              children become roots (parentClusterId = null).
//
// When children are re-parented to the grandparent, their pillars must still
// be members of that new parent. We DON'T validate this — the grandparent's
// memberEntityIds typically already includes the deleted cluster's pillar
// (from when it was attached), and re-validating could fail noisily on edge
// cases. Tree invariant is best-effort across cascade ops; users can fix from UI.
export async function DELETE(request, { params }) {
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

    const { searchParams } = new URL(request.url);
    const cascade = searchParams.get('cascade') ?? 'reparent';
    if (!VALID_CASCADES.has(cascade)) {
      return NextResponse.json(
        { error: `Invalid cascade. Must be one of: ${Array.from(VALID_CASCADES).join(', ')}` },
        { status: 400 },
      );
    }

    // Collect children before deletion so we can recompute their depths after.
    const children = await prisma.topicCluster.findMany({
      where: { parentClusterId: id },
      select: { id: true },
    });

    await prisma.$transaction(async (tx) => {
      const newParent = cascade === 'reparent' ? cluster.parentClusterId : null;
      if (children.length > 0) {
        await tx.topicCluster.updateMany({
          where: { parentClusterId: id },
          data: { parentClusterId: newParent },
        });
      }
      await tx.topicCluster.delete({ where: { id } });
    });

    // Recompute depths for every former-child subtree. Each was rooted under
    // `id`; now they're rooted under either the grandparent or null.
    for (const c of children) {
      await recomputeDepths(c.id);
    }

    return NextResponse.json({
      success: true,
      deletedId: id,
      cascade,
      reparentedChildren: children.length,
    });
  } catch (error) {
    console.error('[Cluster API] DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
