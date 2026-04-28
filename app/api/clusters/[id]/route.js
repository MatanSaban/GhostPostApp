import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';
const VALID_STATUSES = new Set(['DISCOVERED', 'CONFIRMED', 'REJECTED']);

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
// Body: { status?, name?, mainKeyword?, pillarEntityId? }
//
// Allows the user to confirm/reject a discovered cluster, edit its name/keyword,
// or set the pillar. pillarEntityId must be one of the cluster's memberEntityIds.
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
    const { status, name, mainKeyword, pillarEntityId, expectedUpdatedAt } = body;

    // Optimistic-concurrency check: if the client tells us what version it
    // last saw, refuse the write when the row has moved on.
    if (expectedUpdatedAt) {
      const expected = new Date(expectedUpdatedAt).getTime();
      const actual = new Date(cluster.updatedAt).getTime();
      if (Number.isFinite(expected) && expected !== actual) {
        return NextResponse.json(
          {
            error: 'Cluster was updated elsewhere',
            code: 'STALE',
            cluster: {
              id: cluster.id,
              updatedAt: cluster.updatedAt,
            },
          },
          { status: 409 },
        );
      }
    }

    const data = {};

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
        data.pillarEntityId = null;
      } else if (typeof pillarEntityId === 'string' && cluster.memberEntityIds.includes(pillarEntityId)) {
        data.pillarEntityId = pillarEntityId;
      } else {
        return NextResponse.json(
          { error: 'pillarEntityId must be null or one of the cluster member entity IDs' },
          { status: 400 },
        );
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const updated = await prisma.topicCluster.update({
      where: { id },
      data,
    });

    return NextResponse.json({ cluster: updated });
  } catch (error) {
    console.error('[Cluster API] PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/clusters/[id]
//
// Hard-deletes a cluster row. Linked Campaigns keep existing — their
// `topicClusterId` is cleared via the schema's `onDelete: SetNull` rule.
// Content rows already created with a `preflight` JSON snapshot retain it.
export async function DELETE(_request, { params }) {
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

    await prisma.topicCluster.delete({ where: { id } });

    return NextResponse.json({ success: true, deletedId: id });
  } catch (error) {
    console.error('[Cluster API] DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
