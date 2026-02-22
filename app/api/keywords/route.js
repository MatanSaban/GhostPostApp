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

// GET - Fetch keywords for a site
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

    // Verify user has access to this site
    const site = await prisma.site.findFirst({
      where: {
        id: siteId,
        account: {
          members: {
            some: { userId: user.id },
          },
        },
      },
      select: { id: true },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found or no access' }, { status: 404 });
    }

    const keywords = await prisma.keyword.findMany({
      where: { siteId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        keyword: true,
        searchVolume: true,
        difficulty: true,
        cpc: true,
        intent: true,
        position: true,
        url: true,
        status: true,
        tags: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ keywords });
  } catch (error) {
    console.error('[Keywords API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Add keyword(s) manually
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { siteId, keywords: keywordsInput } = await request.json();

    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
    }

    // Verify user has access to this site
    const site = await prisma.site.findFirst({
      where: {
        id: siteId,
        account: {
          members: {
            some: { userId: user.id },
          },
        },
      },
      select: { id: true },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found or no access' }, { status: 404 });
    }

    // Normalize input: accept string or array
    const keywordsList = Array.isArray(keywordsInput)
      ? keywordsInput.map(k => k.trim()).filter(Boolean)
      : [keywordsInput?.trim()].filter(Boolean);

    if (keywordsList.length === 0) {
      return NextResponse.json({ error: 'At least one keyword is required' }, { status: 400 });
    }

    // Deduplicate against existing keywords
    const existing = await prisma.keyword.findMany({
      where: { siteId },
      select: { keyword: true },
    });
    const existingSet = new Set(existing.map(k => k.keyword.toLowerCase().trim()));

    const newKeywords = keywordsList
      .filter(kw => !existingSet.has(kw.toLowerCase()))
      .map(kw => ({
        siteId,
        keyword: kw,
        status: 'TRACKING',
        tags: ['manual'],
      }));

    if (newKeywords.length === 0) {
      return NextResponse.json({ error: 'All keywords already exist', duplicates: true }, { status: 409 });
    }

    await prisma.keyword.createMany({ data: newKeywords });

    // Fetch freshly created keywords to return
    const created = await prisma.keyword.findMany({
      where: {
        siteId,
        keyword: { in: newKeywords.map(k => k.keyword) },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ keywords: created, count: created.length });
  } catch (error) {
    console.error('[Keywords API] POST Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
