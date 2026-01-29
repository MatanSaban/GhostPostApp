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

// GET - Fetch all interview questions and available bot actions
export async function GET(request) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all questions
    const questions = await prisma.interviewQuestion.findMany({
      orderBy: { order: 'asc' },
    });

    // Fetch all bot actions for the action selector
    const botActions = await prisma.botAction.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        description: true,
      },
      orderBy: { name: 'asc' },
    });

    // Calculate stats
    const stats = {
      totalQuestions: questions.length,
      activeQuestions: questions.filter((q) => q.isActive).length,
      questionTypes: [...new Set(questions.map((q) => q.questionType))],
    };

    return NextResponse.json({
      questions,
      botActions,
      stats,
    });
  } catch (error) {
    console.error('Error fetching interview flow questions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch interview flow questions' },
      { status: 500 }
    );
  }
}

// POST - Create a new interview question
export async function POST(request) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      translationKey,
      questionType,
      inputConfig,
      validation,
      aiPromptHint,
      allowedActions,
      autoActions,
      saveToField,
      dependsOn,
      showCondition,
      isActive,
      order,
    } = body;

    if (!translationKey) {
      return NextResponse.json(
        { error: 'Translation key is required' },
        { status: 400 }
      );
    }

    // Check for duplicate translation key
    const existing = await prisma.interviewQuestion.findUnique({
      where: { translationKey },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'A question with this translation key already exists' },
        { status: 409 }
      );
    }

    // Get the next order number if not provided
    let questionOrder = order;
    if (questionOrder === undefined) {
      const lastQuestion = await prisma.interviewQuestion.findFirst({
        orderBy: { order: 'desc' },
      });
      questionOrder = (lastQuestion?.order || 0) + 1;
    }

    const question = await prisma.interviewQuestion.create({
      data: {
        translationKey,
        questionType: questionType || 'INPUT',
        inputConfig: inputConfig || null,
        validation: validation || null,
        aiPromptHint: aiPromptHint || null,
        allowedActions: allowedActions || [],
        autoActions: autoActions || null,
        saveToField: saveToField || null,
        dependsOn: dependsOn || null,
        showCondition: showCondition || null,
        isActive: isActive ?? true,
        order: questionOrder,
      },
    });

    return NextResponse.json({ question }, { status: 201 });
  } catch (error) {
    console.error('Error creating interview question:', error);
    return NextResponse.json(
      { error: 'Failed to create interview question' },
      { status: 500 }
    );
  }
}

// PUT - Reorder questions (bulk update)
export async function PUT(request) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { questions } = body;

    if (!questions || !Array.isArray(questions)) {
      return NextResponse.json(
        { error: 'Questions array is required' },
        { status: 400 }
      );
    }

    // Update order for each question
    await Promise.all(
      questions.map((q, index) =>
        prisma.interviewQuestion.update({
          where: { id: q.id },
          data: { order: index },
        })
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error reordering questions:', error);
    return NextResponse.json(
      { error: 'Failed to reorder questions' },
      { status: 500 }
    );
  }
}
