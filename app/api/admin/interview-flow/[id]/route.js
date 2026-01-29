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
    });

    if (!question) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    return NextResponse.json({ question });
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

    // Check if question exists
    const existing = await prisma.interviewQuestion.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    // Check for duplicate translation key if changing
    if (translationKey && translationKey !== existing.translationKey) {
      const duplicate = await prisma.interviewQuestion.findUnique({
        where: { translationKey },
      });

      if (duplicate) {
        return NextResponse.json(
          { error: 'A question with this translation key already exists' },
          { status: 409 }
        );
      }
    }

    const question = await prisma.interviewQuestion.update({
      where: { id },
      data: {
        ...(translationKey !== undefined && { translationKey }),
        ...(questionType !== undefined && { questionType }),
        ...(inputConfig !== undefined && { inputConfig }),
        ...(validation !== undefined && { validation }),
        ...(aiPromptHint !== undefined && { aiPromptHint }),
        ...(allowedActions !== undefined && { allowedActions }),
        ...(autoActions !== undefined && { autoActions }),
        ...(saveToField !== undefined && { saveToField }),
        ...(dependsOn !== undefined && { dependsOn }),
        ...(showCondition !== undefined && { showCondition }),
        ...(isActive !== undefined && { isActive }),
        ...(order !== undefined && { order }),
      },
    });

    return NextResponse.json({ question });
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

    // Check if question exists
    const existing = await prisma.interviewQuestion.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    await prisma.interviewQuestion.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting interview question:', error);
    return NextResponse.json(
      { error: 'Failed to delete interview question' },
      { status: 500 }
    );
  }
}
