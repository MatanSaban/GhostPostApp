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

// GET - List campaigns for a site
export async function GET(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');

    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
    }

    const site = await verifySiteAccess(siteId, user.id);
    if (!site) {
      return NextResponse.json({ error: 'Site not found or no access' }, { status: 404 });
    }

    const campaigns = await prisma.campaign.findMany({
      where: { siteId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { contents: true } },
      },
    });

    // Deserialize subjects (stored as JSON strings in String[])
    for (const campaign of campaigns) {
      if (campaign.subjects) {
        campaign.subjects = campaign.subjects.map((s) => {
          try { return typeof s === 'string' ? JSON.parse(s) : s; } catch { return s; }
        });
      }
    }

    return NextResponse.json({ campaigns });
  } catch (error) {
    console.error('[Campaigns API] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create a new campaign
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      siteId,
      name,
      color,
      startDate,
      endDate,
      publishDays,
      publishTimeMode,
      publishTimeStart,
      publishTimeEnd,
      postsCount,
      articleTypes,
      contentSettings,
      subjects,
      keywordIds,
      textPrompt,
      imagePrompt,
    } = body;

    if (!siteId || !name || !startDate || !endDate || !postsCount) {
      return NextResponse.json(
        { error: 'Missing required fields: siteId, name, startDate, endDate, postsCount' },
        { status: 400 }
      );
    }

    const site = await verifySiteAccess(siteId, user.id);
    if (!site) {
      return NextResponse.json({ error: 'Site not found or no access' }, { status: 404 });
    }

    const campaign = await prisma.campaign.create({
      data: {
        siteId,
        name,
        color: color || '#6366f1',
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        publishDays: publishDays || [],
        publishTimeMode: publishTimeMode || 'random',
        publishTimeStart: publishTimeStart || null,
        publishTimeEnd: publishTimeEnd || null,
        postsCount,
        articleTypes: articleTypes || [],
        contentSettings: contentSettings || {},
        subjects: (subjects || []).map((s) => (typeof s === 'string' ? s : JSON.stringify(s))),
        subjectSuggestions: body.subjectSuggestions || null,
        keywordIds: keywordIds || [],
        textPrompt: textPrompt || '',
        imagePrompt: imagePrompt || '',
        status: 'DRAFT',
      },
    });

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    console.error('[Campaigns API] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
