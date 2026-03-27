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
 * POST /api/campaigns/[id]/activate
 *
 * Activates a DRAFT campaign:
 *  1. Validates generatedPlan exists and has entries
 *  2. Creates Content records (SCHEDULED) for each plan entry
 *  3. Updates campaign status to ACTIVE
 *
 * Also supports re-activating a PAUSED campaign (no new Content records).
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
      include: {
        _count: { select: { contents: true } },
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const site = await verifySiteAccess(campaign.siteId, user.id);
    if (!site) {
      return NextResponse.json({ error: 'No access' }, { status: 403 });
    }

    // ── Resume a paused campaign ─────────────────────────────────
    if (campaign.status === 'PAUSED') {
      const updated = await prisma.campaign.update({
        where: { id },
        data: { status: 'ACTIVE' },
      });
      return NextResponse.json({
        campaign: updated,
        message: 'Campaign resumed',
        contentsCreated: 0,
      });
    }

    // ── Activate a draft campaign ────────────────────────────────
    if (campaign.status !== 'DRAFT') {
      return NextResponse.json(
        { error: `Cannot activate a campaign with status "${campaign.status}". Only DRAFT or PAUSED campaigns can be activated.` },
        { status: 400 }
      );
    }

    const plan = campaign.generatedPlan;
    if (!plan || !Array.isArray(plan) || plan.length === 0) {
      return NextResponse.json(
        { error: 'Campaign has no generated plan. Complete the AI Content Wizard first.' },
        { status: 400 }
      );
    }

    // Prevent duplicate activation - if Content records already exist, skip creation
    if (campaign._count.contents > 0) {
      const updated = await prisma.campaign.update({
        where: { id },
        data: { status: 'ACTIVE' },
      });
      return NextResponse.json({
        campaign: updated,
        message: 'Campaign activated (content records already exist)',
        contentsCreated: 0,
      });
    }

    // ── Create Content records from the plan ─────────────────────
    const contentRecords = plan.map((entry) => ({
      siteId: campaign.siteId,
      campaignId: campaign.id,
      keywordId: entry.keywordId || null,
      title: entry.title || `Post ${(entry.index || 0) + 1}`,
      status: 'SCHEDULED',
      type: entry.type || 'BLOG_POST',
      scheduledAt: new Date(entry.scheduledAt),
      aiGenerated: true,
    }));

    // Use createMany for efficient batch insertion
    const result = await prisma.content.createMany({
      data: contentRecords,
    });

    // Update campaign status to ACTIVE
    const updated = await prisma.campaign.update({
      where: { id },
      data: { status: 'ACTIVE' },
    });

    return NextResponse.json({
      campaign: updated,
      message: `Campaign activated with ${result.count} scheduled posts`,
      contentsCreated: result.count,
    });
  } catch (error) {
    console.error('[Campaign Activate] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
