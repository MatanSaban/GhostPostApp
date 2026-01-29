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

// GET - Fetch all interview questions and categories
export async function GET(request) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all categories
    const categories = await prisma.interviewCategory.findMany({
      orderBy: { order: 'asc' },
    });

    // Fetch all questions with their categories
    const questions = await prisma.interviewQuestion.findMany({
      include: {
        category: true,
      },
      orderBy: { order: 'asc' },
    });

    // Format the response
    const formattedCategories = categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      nameKey: cat.nameKey,
      order: cat.order,
      isActive: cat.isActive,
    }));

    const formattedQuestions = questions.map((q) => ({
      id: q.id,
      question: q.question,
      questionKey: q.questionKey,
      type: q.type.toLowerCase(),
      categoryId: q.categoryId,
      categoryName: q.category?.name || 'Uncategorized',
      placeholder: q.placeholder,
      options: q.options,
      scaleMin: q.scaleMin,
      scaleMax: q.scaleMax,
      required: q.required,
      order: q.order,
      isActive: q.isActive,
    }));

    // Calculate stats
    const stats = {
      totalQuestions: questions.length,
      totalCategories: categories.length,
      requiredQuestions: questions.filter((q) => q.required).length,
    };

    return NextResponse.json({
      questions: formattedQuestions,
      categories: formattedCategories,
      stats,
    });
  } catch (error) {
    console.error('Error fetching interview questions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch interview questions' },
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

    const data = await request.json();
    const {
      question,
      questionKey,
      type,
      categoryId,
      placeholder,
      options,
      scaleMin,
      scaleMax,
      required,
      order,
    } = data;

    if (!question || !categoryId) {
      return NextResponse.json(
        { error: 'Question and categoryId are required' },
        { status: 400 }
      );
    }

    // Get the max order for this category if order not provided
    let questionOrder = order;
    if (questionOrder === undefined) {
      const maxOrderQuestion = await prisma.interviewQuestion.findFirst({
        where: { categoryId },
        orderBy: { order: 'desc' },
      });
      questionOrder = (maxOrderQuestion?.order || 0) + 1;
    }

    const newQuestion = await prisma.interviewQuestion.create({
      data: {
        question,
        questionKey: questionKey || null,
        type: type?.toUpperCase() || 'TEXT',
        categoryId,
        placeholder: placeholder || null,
        options: options || [],
        scaleMin: scaleMin || null,
        scaleMax: scaleMax || null,
        required: required || false,
        order: questionOrder,
      },
      include: {
        category: true,
      },
    });

    return NextResponse.json({
      message: 'Question created successfully',
      question: {
        id: newQuestion.id,
        question: newQuestion.question,
        questionKey: newQuestion.questionKey,
        type: newQuestion.type.toLowerCase(),
        categoryId: newQuestion.categoryId,
        categoryName: newQuestion.category?.name || 'Uncategorized',
        placeholder: newQuestion.placeholder,
        options: newQuestion.options,
        scaleMin: newQuestion.scaleMin,
        scaleMax: newQuestion.scaleMax,
        required: newQuestion.required,
        order: newQuestion.order,
        isActive: newQuestion.isActive,
      },
    });
  } catch (error) {
    console.error('Error creating interview question:', error);
    return NextResponse.json(
      { error: 'Failed to create interview question' },
      { status: 500 }
    );
  }
}
