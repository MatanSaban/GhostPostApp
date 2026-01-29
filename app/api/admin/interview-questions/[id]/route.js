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

// GET - Fetch a single interview question
export async function GET(request, { params }) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const question = await prisma.interviewQuestion.findUnique({
      where: { id },
      include: { category: true },
    });

    if (!question) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    return NextResponse.json({
      question: {
        id: question.id,
        question: question.question,
        questionKey: question.questionKey,
        type: question.type.toLowerCase(),
        categoryId: question.categoryId,
        categoryName: question.category?.name || 'Uncategorized',
        placeholder: question.placeholder,
        options: question.options,
        scaleMin: question.scaleMin,
        scaleMax: question.scaleMax,
        required: question.required,
        order: question.order,
        isActive: question.isActive,
      },
    });
  } catch (error) {
    console.error('Error fetching interview question:', error);
    return NextResponse.json(
      { error: 'Failed to fetch interview question' },
      { status: 500 }
    );
  }
}

// PUT - Update an interview question
export async function PUT(request, { params }) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
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
      isActive,
    } = data;

    // Build update data object
    const updateData = {};
    if (question !== undefined) updateData.question = question;
    if (questionKey !== undefined) updateData.questionKey = questionKey;
    if (type !== undefined) updateData.type = type.toUpperCase();
    if (categoryId !== undefined) updateData.categoryId = categoryId;
    if (placeholder !== undefined) updateData.placeholder = placeholder;
    if (options !== undefined) updateData.options = options;
    if (scaleMin !== undefined) updateData.scaleMin = scaleMin;
    if (scaleMax !== undefined) updateData.scaleMax = scaleMax;
    if (required !== undefined) updateData.required = required;
    if (order !== undefined) updateData.order = order;
    if (isActive !== undefined) updateData.isActive = isActive;

    const updatedQuestion = await prisma.interviewQuestion.update({
      where: { id },
      data: updateData,
      include: { category: true },
    });

    return NextResponse.json({
      message: 'Question updated successfully',
      question: {
        id: updatedQuestion.id,
        question: updatedQuestion.question,
        questionKey: updatedQuestion.questionKey,
        type: updatedQuestion.type.toLowerCase(),
        categoryId: updatedQuestion.categoryId,
        categoryName: updatedQuestion.category?.name || 'Uncategorized',
        placeholder: updatedQuestion.placeholder,
        options: updatedQuestion.options,
        scaleMin: updatedQuestion.scaleMin,
        scaleMax: updatedQuestion.scaleMax,
        required: updatedQuestion.required,
        order: updatedQuestion.order,
        isActive: updatedQuestion.isActive,
      },
    });
  } catch (error) {
    console.error('Error updating interview question:', error);
    return NextResponse.json(
      { error: 'Failed to update interview question' },
      { status: 500 }
    );
  }
}

// DELETE - Delete an interview question
export async function DELETE(request, { params }) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    await prisma.interviewQuestion.delete({
      where: { id },
    });

    return NextResponse.json({
      message: 'Question deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting interview question:', error);
    return NextResponse.json(
      { error: 'Failed to delete interview question' },
      { status: 500 }
    );
  }
}
