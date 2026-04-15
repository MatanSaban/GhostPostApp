/**
 * Push Questions API for Users
 * GET - Get active push questions for a site (excluding answered)
 * POST - Submit an answer to a push question
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

// Get authenticated user with account memberships
async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        isSuperAdmin: true,
        accountMemberships: {
          select: {
            accountId: true,
          },
        },
      },
    });

    return user;
  } catch (error) {
    console.error('[PushQuestions] Auth error:', error);
    return null;
  }
}

// GET - Get pending push questions for a site
export async function GET(request, { params }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: siteId } = await params;
    
    // Get language preference from query params or default to EN
    const { searchParams } = new URL(request.url);
    const lang = searchParams.get('lang') || 'EN';

    // Verify site access
    let site;
    if (user.isSuperAdmin) {
      site = await prisma.site.findUnique({
        where: { id: siteId },
        select: { id: true, name: true },
      });
    } else {
      const accountIds = user.accountMemberships.map(m => m.accountId);
      site = await prisma.site.findFirst({
        where: user.isSuperAdmin ? { id: siteId } : { id: siteId, accountId: { in: accountIds } },
        select: { id: true, name: true },
      });
    }

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Get already answered question IDs for this site
    const answeredQuestionIds = await prisma.pushQuestionAnswer.findMany({
      where: { siteId },
      select: { questionId: true },
    });
    const answeredIds = new Set(answeredQuestionIds.map(a => a.questionId));

    // Get active questions that target this site with translations
    const questions = await prisma.pushQuestion.findMany({
      where: {
        isActive: true,
        OR: [
          { targetAll: true },
          { targetSiteIds: { has: siteId } },
        ],
      },
      orderBy: { order: 'asc' },
      include: {
        translations: true,
      },
    });

    // Filter out already answered questions
    const pendingQuestions = questions.filter(q => !answeredIds.has(q.id));

    // Format for client - use translation if available and requested language is not EN
    const formattedQuestions = pendingQuestions.map((q) => {
      const translation = q.translations.find(t => t.language === lang);
      
      return {
        id: q.id,
        question: translation?.question || q.question,
        description: translation?.description || q.description,
        questionType: q.questionType,
        options: translation?.options || q.options,
        required: q.required,
        category: q.category,
      };
    });

    return NextResponse.json({
      questions: formattedQuestions,
      totalPending: formattedQuestions.length,
    });
  } catch (error) {
    console.error('[PushQuestions] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch push questions' },
      { status: 500 }
    );
  }
}

// POST - Submit an answer to a push question
export async function POST(request, { params }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: siteId } = await params;
    const body = await request.json();
    const { questionId, answer, skipped = false } = body;

    if (!questionId) {
      return NextResponse.json(
        { error: 'Question ID is required' },
        { status: 400 }
      );
    }

    // Verify site access
    let site;
    if (user.isSuperAdmin) {
      site = await prisma.site.findUnique({
        where: { id: siteId },
        select: { id: true },
      });
    } else {
      const accountIds = user.accountMemberships.map(m => m.accountId);
      site = await prisma.site.findFirst({
        where: user.isSuperAdmin ? { id: siteId } : { id: siteId, accountId: { in: accountIds } },
        select: { id: true },
      });
    }

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Verify question exists and is active
    const question = await prisma.pushQuestion.findFirst({
      where: {
        id: questionId,
        isActive: true,
        OR: [
          { targetAll: true },
          { targetSiteIds: { has: siteId } },
        ],
      },
    });

    if (!question) {
      return NextResponse.json(
        { error: 'Question not found or not applicable' },
        { status: 404 }
      );
    }

    // Check if already answered
    const existingAnswer = await prisma.pushQuestionAnswer.findUnique({
      where: {
        questionId_siteId: {
          questionId,
          siteId,
        },
      },
    });

    if (existingAnswer) {
      // Update existing answer
      await prisma.pushQuestionAnswer.update({
        where: { id: existingAnswer.id },
        data: {
          answer: skipped ? null : (typeof answer === 'string' ? answer : JSON.stringify(answer)),
          skipped,
          updatedAt: new Date(),
        },
      });
    } else {
      // Create new answer
      await prisma.pushQuestionAnswer.create({
        data: {
          questionId,
          siteId,
          userId: user.id,
          answer: skipped ? null : (typeof answer === 'string' ? answer : JSON.stringify(answer)),
          skipped,
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[PushQuestions] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to submit answer' },
      { status: 500 }
    );
  }
}
