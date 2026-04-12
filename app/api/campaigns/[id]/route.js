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
      account: {
        members: { some: { userId } },
      },
    },
    select: { id: true },
  });
}

// GET - Get single campaign
export async function GET(request, { params }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        contents: {
          orderBy: { scheduledAt: 'asc' },
          select: {
            id: true,
            title: true,
            slug: true,
            status: true,
            type: true,
            scheduledAt: true,
            publishedAt: true,
            wordCount: true,
            aiGenerated: true,
          },
        },
        _count: { select: { contents: true } },
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const site = await verifySiteAccess(campaign.siteId, user.id);
    if (!site) {
      return NextResponse.json({ error: 'No access' }, { status: 404 });
    }

    // Deserialize subjects back to objects for the client
    if (campaign.subjects) {
      campaign.subjects = campaign.subjects.map((s) => {
        try { return JSON.parse(s); } catch { return s; }
      });
    }

    return NextResponse.json({ campaign });
  } catch (error) {
    console.error('[Campaign API] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Update campaign
export async function PUT(request, { params }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.campaign.findUnique({
      where: { id },
      select: { siteId: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const site = await verifySiteAccess(existing.siteId, user.id);
    if (!site) {
      return NextResponse.json({ error: 'No access' }, { status: 404 });
    }

    // Build update data, only include fields that were sent
    const updateData = {};
    const allowedFields = [
      'name', 'color', 'status', 'publishDays',
      'publishTimeMode', 'publishTimeStart', 'publishTimeEnd',
      'postsCount', 'articleTypes', 'contentSettings',
      'subjects', 'subjectSuggestions', 'keywordIds', 'textPrompt', 'imagePrompt',
      'generatedPlan', 'lastCompletedStep',
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    // Serialize subjects: Prisma expects String[] but the client sends objects
    if (updateData.subjects) {
      updateData.subjects = updateData.subjects.map((s) =>
        typeof s === 'string' ? s : JSON.stringify(s)
      );
    }

    // Handle date fields separately (convert to Date)
    if (body.startDate) updateData.startDate = new Date(body.startDate);
    if (body.endDate) updateData.endDate = new Date(body.endDate);

    const campaign = await prisma.campaign.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ campaign });
  } catch (error) {
    console.error('[Campaign API] PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Delete campaign, remove ungenerated posts, preserve generated ones
export async function DELETE(request, { params }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const existing = await prisma.campaign.findUnique({
      where: { id },
      select: { siteId: true, name: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const site = await verifySiteAccess(existing.siteId, user.id);
    if (!site) {
      return NextResponse.json({ error: 'No access' }, { status: 404 });
    }

    // Fetch all contents linked to this campaign
    const contents = await prisma.content.findMany({
      where: { campaignId: id },
      select: { id: true, status: true, aiGenerated: true },
    });

    // Split: ungenerated (DRAFT/SCHEDULED and not AI-generated) → delete
    //        generated/published → unlink but preserve campaign name
    const toDelete = contents.filter(
      c => !c.aiGenerated && (c.status === 'DRAFT' || c.status === 'SCHEDULED')
    );
    const toKeep = contents.filter(
      c => c.aiGenerated || (c.status !== 'DRAFT' && c.status !== 'SCHEDULED')
    );

    const deletedContentIds = toDelete.map(c => c.id);

    // Delete ungenerated contents (ContentBody first, then Content)
    if (deletedContentIds.length > 0) {
      await prisma.contentBody.deleteMany({
        where: { contentId: { in: deletedContentIds } },
      });
      await prisma.content.deleteMany({
        where: { id: { in: deletedContentIds } },
      });
    }

    // Unlink generated contents and store the deleted campaign name
    if (toKeep.length > 0) {
      await prisma.content.updateMany({
        where: { id: { in: toKeep.map(c => c.id) } },
        data: { campaignId: null, campaignDeletedName: existing.name },
      });
    }

    await prisma.campaign.delete({ where: { id } });

    return NextResponse.json({ success: true, deletedContentIds });
  } catch (error) {
    console.error('[Campaign API] DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
