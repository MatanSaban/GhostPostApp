import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { recomputeDepths } from '@/lib/cluster-tree';

const SESSION_COOKIE = 'user_session';
const VALID_CASCADES = new Set(['keep', 'detach']);

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

// POST /api/clusters/[id]/demote
// Body: { cascadeChildren?: 'keep' | 'detach' }
//
// Detaches a cluster from its parent — it becomes a root.
//
//   - cascadeChildren='keep' (default): the demoted cluster keeps its own children
//                                       (they ride along; the entire subtree shifts up).
//   - cascadeChildren='detach':         children of the demoted cluster also become roots.
//
// Either way, depths are recomputed for the affected subtree(s).
// No-op (200) if the cluster is already a root.
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

    if (!cluster.parentClusterId) {
      // Already a root — return current state without mutation.
      return NextResponse.json({ cluster, alreadyRoot: true });
    }

    const body = await request.json().catch(() => ({}));
    const cascadeChildren = body?.cascadeChildren ?? 'keep';
    if (!VALID_CASCADES.has(cascadeChildren)) {
      return NextResponse.json(
        {
          error: `Invalid cascadeChildren. Must be one of: ${Array.from(VALID_CASCADES).join(', ')}`,
        },
        { status: 400 },
      );
    }

    // Capture children before we change anything (used only for the 'detach' branch).
    const children = await prisma.topicCluster.findMany({
      where: { parentClusterId: id },
      select: { id: true },
    });

    await prisma.$transaction(async (tx) => {
      await tx.topicCluster.update({
        where: { id },
        data: { parentClusterId: null },
      });
      if (cascadeChildren === 'detach' && children.length > 0) {
        await tx.topicCluster.updateMany({
          where: { parentClusterId: id },
          data: { parentClusterId: null },
        });
      }
    });

    // Recompute depths starting from the demoted cluster — its descendants ride
    // along when cascadeChildren='keep', so a single recompute walks the whole
    // subtree. Detached children need their own recompute.
    await recomputeDepths(id);
    if (cascadeChildren === 'detach') {
      for (const c of children) {
        await recomputeDepths(c.id);
      }
    }

    const refreshed = await prisma.topicCluster.findUnique({ where: { id } });
    return NextResponse.json({ cluster: refreshed, cascadeChildren });
  } catch (error) {
    console.error('[Cluster Demote API] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
