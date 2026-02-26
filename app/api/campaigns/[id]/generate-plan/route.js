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

/**
 * Generate publishing dates based on campaign schedule
 */
function generatePublishDates(startDate, endDate, publishDays, postsCount) {
  const dayMap = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const allowedDays = new Set(publishDays.map(d => dayMap[d]).filter(d => d !== undefined));

  const dates = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end && dates.length < postsCount) {
    if (allowedDays.has(current.getDay())) {
      dates.push(new Date(current));
    }
    current.setDate(current.getDate() + 1);
  }

  // If not enough dates found, cycle through available dates
  if (dates.length < postsCount && dates.length > 0) {
    let idx = 0;
    while (dates.length < postsCount) {
      const base = new Date(dates[idx % dates.length]);
      // Push a week ahead from the last date
      const extra = new Date(dates[dates.length - 1]);
      extra.setDate(extra.getDate() + 1);
      while (!allowedDays.has(extra.getDay())) {
        extra.setDate(extra.getDate() + 1);
      }
      dates.push(new Date(extra));
      idx++;
    }
  }

  return dates.slice(0, postsCount);
}

/**
 * Assign publish times based on mode
 */
function assignPublishTime(date, mode, timeStart, timeEnd) {
  const d = new Date(date);

  if (mode === 'fixed' && timeStart) {
    const [h, m] = timeStart.split(':').map(Number);
    d.setHours(h, m, 0, 0);
  } else {
    // Random time within range
    const startH = timeStart ? parseInt(timeStart.split(':')[0]) : 9;
    const endH = timeEnd ? parseInt(timeEnd.split(':')[0]) : 18;
    const hour = Math.floor(Math.random() * (endH - startH)) + startH;
    const minute = Math.floor(Math.random() * 60);
    d.setHours(hour, minute, 0, 0);
  }

  return d;
}

/**
 * Distribute article types across posts
 */
function distributeArticleTypes(articleTypes, postsCount) {
  const assignments = [];
  for (const type of articleTypes) {
    for (let i = 0; i < type.count; i++) {
      assignments.push(type.id);
    }
  }
  // Fill remaining with first type if distribution doesn't match postsCount
  while (assignments.length < postsCount) {
    assignments.push(articleTypes[0]?.id || 'BLOG_POST');
  }
  return assignments.slice(0, postsCount);
}

// POST - Generate content plan for a campaign
export async function POST(request, { params }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const campaign = await prisma.campaign.findUnique({
      where: { id },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const site = await verifySiteAccess(campaign.siteId, user.id);
    if (!site) {
      return NextResponse.json({ error: 'No access' }, { status: 404 });
    }

    // Generate dates
    const dates = generatePublishDates(
      campaign.startDate,
      campaign.endDate,
      campaign.publishDays,
      campaign.postsCount
    );

    // Assign times
    const scheduledDates = dates.map(d =>
      assignPublishTime(d, campaign.publishTimeMode, campaign.publishTimeStart, campaign.publishTimeEnd)
    );

    // Distribute article types
    const articleTypes = campaign.articleTypes || [];
    const typeAssignments = distributeArticleTypes(articleTypes, campaign.postsCount);

    // Distribute subjects and keywords round-robin
    const subjects = campaign.subjects || [];
    const keywordIds = campaign.keywordIds || [];

    // Fetch keyword data for context
    let keywords = [];
    if (keywordIds.length > 0) {
      keywords = await prisma.keyword.findMany({
        where: { id: { in: keywordIds } },
        select: { id: true, keyword: true },
      });
    }

    // Build planned posts
    const plannedPosts = scheduledDates.map((date, i) => {
      const subject = subjects.length > 0 ? subjects[i % subjects.length] : '';
      const keyword = keywords.length > 0 ? keywords[i % keywords.length] : null;
      const type = typeAssignments[i];

      // Generate a placeholder title (will be editable in the UI)
      const titleParts = [subject, keyword?.keyword].filter(Boolean);
      const title = titleParts.length > 0
        ? titleParts.join(' - ')
        : `Post ${i + 1}`;

      return {
        index: i,
        title,
        type,
        subject,
        keywordId: keyword?.id || null,
        keywordText: keyword?.keyword || null,
        scheduledAt: date.toISOString(),
      };
    });

    return NextResponse.json({ plan: plannedPosts });
  } catch (error) {
    console.error('[Campaign Generate Plan] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
