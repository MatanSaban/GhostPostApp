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

// POST /api/clusters/[id]/members
// Body: { entityIds: string[] }
//
// Bulk-adds entities to a cluster's memberEntityIds (deduped). Used by the
// orphan tray "Assign to existing cluster" flow.
//
// All entityIds must belong to the cluster's site. The cluster is left in
// whatever status it was in — adding members doesn't change the lifecycle.
export async function POST(request, { params }) {
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
    const { entityIds } = body;

    if (!Array.isArray(entityIds) || entityIds.length === 0) {
      return NextResponse.json({ error: 'entityIds (non-empty array) is required' }, { status: 400 });
    }

    // Validate all entities belong to this cluster's site.
    const found = await prisma.siteEntity.findMany({
      where: { siteId: cluster.siteId, id: { in: entityIds } },
      select: { id: true },
    });
    if (found.length !== entityIds.length) {
      return NextResponse.json(
        { error: 'One or more entityIds do not belong to this cluster\'s site' },
        { status: 400 },
      );
    }

    // Dedupe against existing members.
    const existing = new Set(cluster.memberEntityIds || []);
    const additions = entityIds.filter((id) => !existing.has(id));
    if (additions.length === 0) {
      return NextResponse.json({
        cluster,
        added: 0,
        message: 'All entities are already members',
      });
    }

    const updated = await prisma.topicCluster.update({
      where: { id: cluster.id },
      data: { memberEntityIds: [...(cluster.memberEntityIds || []), ...additions] },
    });

    return NextResponse.json({ cluster: updated, added: additions.length });
  } catch (error) {
    console.error('[Cluster Members API] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
