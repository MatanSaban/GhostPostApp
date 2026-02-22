import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { fetchArticles } from '@/lib/bot-actions/handlers/fetch-articles';

const SESSION_COOKIE = 'user_session';

async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) return null;

    return await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
  } catch {
    return null;
  }
}

/**
 * POST - Fetch articles from a user-provided blog URL
 * Used when automatic blog discovery fails and user manually enters their blog page URL
 */
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { blogUrl, interviewId } = await request.json();

    if (!blogUrl) {
      return NextResponse.json({ error: 'Blog URL is required' }, { status: 400 });
    }

    // Validate URL format
    try {
      new URL(blogUrl);
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    // Find the interview
    const interview = await prisma.userInterview.findFirst({
      where: {
        userId: user.id,
        status: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
        ...(interviewId ? { id: interviewId } : {}),
      },
    });

    if (!interview) {
      return NextResponse.json({ error: 'No active interview found' }, { status: 404 });
    }

    // Create context for fetchArticles
    const context = {
      userId: user.id,
      siteId: interview.siteId || null,
      interviewId: interview.id,
      interview,
      responses: interview.responses || {},
      externalData: interview.externalData || {},
      prisma,
    };

    // Fetch articles using the manual blog URL
    const result = await fetchArticles({ limit: 10, blogUrl }, context);

    return NextResponse.json({
      success: result.success,
      articles: result.articles || [],
      total: result.total || 0,
      source: result.source || 'manual',
    });
  } catch (error) {
    console.error('[FetchBlogArticles] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch articles' },
      { status: 500 }
    );
  }
}
