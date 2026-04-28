import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { analyzeClusterHealth } from '@/lib/cluster-health';

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
//   - Internal link gaps (missing pillar↔member or member↔member edges)
//   - Existing PENDING cross-cluster cannibalization insights affecting this cluster's members
//   - Members not updated in N+ months
//
// All signals are read-only — no AI calls, no mutations. Cheap enough to
// fetch on demand from the cluster card.
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

    const result = await analyzeClusterHealth({ clusterId: id });
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Cluster Health API] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
