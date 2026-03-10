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
    select: { id: true, email: true },
  });
}

async function verifySiteAccess(siteId, userId) {
  return prisma.site.findFirst({
    where: {
      id: siteId,
      account: { members: { some: { userId } } },
    },
    select: { id: true },
  });
}

/**
 * POST /api/campaigns/[id]/pause
 *
 * Pauses an ACTIVE campaign. Content that is already PROCESSING or
 * READY_TO_PUBLISH will still finish, but SCHEDULED content for
 * this campaign will not be picked up by the cron worker while paused.
 */
export async function POST(request, { params }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      select: { id: true, siteId: true, status: true },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const site = await verifySiteAccess(campaign.siteId, user.id);
    if (!site) {
      return NextResponse.json({ error: 'No access' }, { status: 403 });
    }

    if (campaign.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: `Cannot pause a campaign with status "${campaign.status}". Only ACTIVE campaigns can be paused.` },
        { status: 400 }
      );
    }

    const updated = await prisma.campaign.update({
      where: { id },
      data: { status: 'PAUSED' },
    });

    return NextResponse.json({ campaign: updated, message: 'Campaign paused' });
  } catch (error) {
    console.error('[Campaign Pause] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
