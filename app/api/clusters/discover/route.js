import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { discoverTopicClusters } from '@/lib/ai/cluster-discovery';

const SESSION_COOKIE = 'user_session';

// Discovery embeds up to 200 entities and runs AI validation across many candidates,
// so allow more headroom than the default serverless function timeout.
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

async function verifySiteAccess(siteId, user) {
  const where = user.isSuperAdmin
    ? { id: siteId }
    : { id: siteId, account: { members: { some: { userId: user.id } } } };
  return prisma.site.findFirst({ where, select: { id: true, accountId: true } });
}

// POST /api/clusters/discover
// Body: { siteId }
//
// Manually triggers topic cluster discovery for the site. Unlike the cron path
// (which gates on "no existing clusters"), this is unconditional - the caller
// has explicitly asked to (re)run discovery. Existing CONFIRMED/REJECTED clusters
// are left untouched; new candidates are inserted as DISCOVERED.
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { siteId } = body;
    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
    }

    const site = await verifySiteAccess(siteId, user);
    if (!site) {
      return NextResponse.json({ error: 'Site not found or no access' }, { status: 404 });
    }

    const result = await discoverTopicClusters({
      siteId,
      accountId: site.accountId,
      userId: user.id,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[Clusters Discover API] error:', error);
    return NextResponse.json(
      { error: 'Discovery failed', message: error.message },
      { status: 500 },
    );
  }
}
