import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

// Verify super admin access
async function verifySuperAdmin() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isSuperAdmin: true },
    });

    if (!user || !user.isSuperAdmin) {
      return null;
    }

    return user;
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

// GET - Fetch all push questions
export async function GET(request) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const questions = await prisma.pushQuestion.findMany({
      orderBy: { order: 'asc' },
      include: {
        _count: {
          select: { answers: true },
        },
        translations: true,
      },
    });

    // Get all sites for targeting dropdown
    const sites = await prisma.site.findMany({
      select: {
        id: true,
        name: true,
        url: true,
      },
      orderBy: { name: 'asc' },
    });

    const formattedQuestions = questions.map((q) => {
      // Build translations map
      const translations = {};
      q.translations.forEach((t) => {
        translations[t.language] = {
          question: t.question,
          description: t.description,
          options: t.options,
        };
      });

      return {
        id: q.id,
        order: q.order,
        question: q.question,
        description: q.description,
        questionType: q.questionType,
        options: q.options,
        targetAll: q.targetAll,
        targetSiteIds: q.targetSiteIds,
        required: q.required,
        category: q.category,
        isActive: q.isActive,
        answersCount: q._count.answers,
        translations,
        createdAt: q.createdAt,
        updatedAt: q.updatedAt,
      };
    });

    // Get stats
    const stats = {
      totalQuestions: questions.length,
      activeQuestions: questions.filter((q) => q.isActive).length,
      requiredQuestions: questions.filter((q) => q.required).length,
      totalAnswers: questions.reduce((sum, q) => sum + q._count.answers, 0),
    };

    return NextResponse.json({
      questions: formattedQuestions,
      sites,
      stats,
    });
  } catch (error) {
    console.error('Error fetching push questions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch push questions' },
      { status: 500 }
    );
  }
}

// POST - Create a new push question
export async function POST(request) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.json();
    const {
      question,
      description,
      questionType = 'TEXT',
      options,
      targetAll = true,
      targetSiteIds = [],
      required = false,
      category,
      isActive = true,
    } = data;

    if (!question || question.trim() === '') {
      return NextResponse.json(
        { error: 'Question text is required' },
        { status: 400 }
      );
    }

    // Get the max order
    const maxOrderQuestion = await prisma.pushQuestion.findFirst({
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    const newOrder = (maxOrderQuestion?.order ?? -1) + 1;

    const newQuestion = await prisma.pushQuestion.create({
      data: {
        order: newOrder,
        question: question.trim(),
        description: description?.trim() || null,
        questionType,
        options: options || null,
        targetAll,
        targetSiteIds,
        required,
        category: category?.trim() || null,
        isActive,
      },
    });

    return NextResponse.json({ success: true, question: newQuestion });
  } catch (error) {
    console.error('Error creating push question:', error);
    return NextResponse.json(
      { error: 'Failed to create push question' },
      { status: 500 }
    );
  }
}

// PATCH - Update a push question
export async function PATCH(request) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.json();
    const { id, ...updateData } = data;

    if (!id) {
      return NextResponse.json(
        { error: 'Question ID is required' },
        { status: 400 }
      );
    }

    // Clean up the data
    const cleanData = {};
    if (updateData.question !== undefined) cleanData.question = updateData.question.trim();
    if (updateData.description !== undefined) cleanData.description = updateData.description?.trim() || null;
    if (updateData.questionType !== undefined) cleanData.questionType = updateData.questionType;
    if (updateData.options !== undefined) cleanData.options = updateData.options;
    if (updateData.targetAll !== undefined) cleanData.targetAll = updateData.targetAll;
    if (updateData.targetSiteIds !== undefined) cleanData.targetSiteIds = updateData.targetSiteIds;
    if (updateData.required !== undefined) cleanData.required = updateData.required;
    if (updateData.category !== undefined) cleanData.category = updateData.category?.trim() || null;
    if (updateData.isActive !== undefined) cleanData.isActive = updateData.isActive;
    if (updateData.order !== undefined) cleanData.order = updateData.order;

    const updatedQuestion = await prisma.pushQuestion.update({
      where: { id },
      data: cleanData,
    });

    return NextResponse.json({ success: true, question: updatedQuestion });
  } catch (error) {
    console.error('Error updating push question:', error);
    return NextResponse.json(
      { error: 'Failed to update push question' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a push question
export async function DELETE(request) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Question ID is required' },
        { status: 400 }
      );
    }

    // Delete the question (answers will cascade delete)
    await prisma.pushQuestion.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting push question:', error);
    return NextResponse.json(
      { error: 'Failed to delete push question' },
      { status: 500 }
    );
  }
}
