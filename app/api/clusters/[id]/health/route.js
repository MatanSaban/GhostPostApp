import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import {
  analyzeClusterHealth,
  findHomepageEntity,
  extractHomepageKeywords,
} from '@/lib/cluster-health';
import { getAncestorChain } from '@/lib/cluster-tree';

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

// GET /api/clusters/[id]/health
//
// Returns a snapshot of three cluster-health signals:
//   - Internal link gaps — typed PARENT / ANCESTOR / BRAND / SIBLING (Phase 4)
//   - Existing PENDING cross-cluster cannibalization insights
//   - Members not updated in N+ months
//
// All signals are read-only — no AI calls, no mutations.
//
// This endpoint computes homepage + ancestor context for THIS cluster only.
// The list endpoint amortizes those lookups across all confirmed clusters;
// per-cluster fetches just pay the same cost once.
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

    // Resolve root pillar for ANCESTOR gaps. getAncestorChain returns
    // root-first ending with this cluster — the [0] entry is the root.
    let rootPillar = null;
    if (cluster.parentClusterId) {
      try {
        const chain = await getAncestorChain(id);
        const root = chain[0];
        if (root?.pillarEntityId && root.id !== id) {
          const pillar = await prisma.siteEntity.findUnique({
            where: { id: root.pillarEntityId },
            select: { id: true, title: true, url: true },
          });
          if (pillar) rootPillar = pillar;
        }
      } catch {
        // Cycle / depth error — proceed without ancestor context.
        rootPillar = null;
      }
    }

    const homepage = await findHomepageEntity(cluster.siteId).catch(() => null);
    const homepageKeywords = homepage ? extractHomepageKeywords(homepage) : [];

    const result = await analyzeClusterHealth({
      clusterId: id,
      rootPillar,
      homepage,
      homepageKeywords,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Cluster Health API] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
