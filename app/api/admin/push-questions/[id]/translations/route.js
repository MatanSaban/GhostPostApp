import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

// Verify super admin access
async function verifySuperAdmin() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) return null;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isSuperAdmin: true },
    });

    if (!user || !user.isSuperAdmin) return null;
    return user;
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

// GET - Get all translations for a push question
export async function GET(request, { params }) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const translations = await prisma.pushQuestionTranslation.findMany({
      where: { questionId: id },
      orderBy: { language: 'asc' },
    });

    return NextResponse.json({ translations });
  } catch (error) {
    console.error('Error fetching push question translations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch translations' },
      { status: 500 }
    );
  }
}

// POST - Create or update a translation for a push question
export async function POST(request, { params }) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { language, question, description, options } = body;

    if (!language || !question) {
      return NextResponse.json(
        { error: 'Language and question are required' },
        { status: 400 }
      );
    }

    // Check if push question exists
    const pushQuestion = await prisma.pushQuestion.findUnique({ where: { id } });
    if (!pushQuestion) {
      return NextResponse.json({ error: 'Push question not found' }, { status: 404 });
    }

    // Upsert translation
    const translation = await prisma.pushQuestionTranslation.upsert({
      where: {
        questionId_language: {
          questionId: id,
          language,
        },
      },
      update: {
        question,
        description: description || null,
        options: options || null,
      },
      create: {
        questionId: id,
        language,
        question,
        description: description || null,
        options: options || null,
      },
    });

    return NextResponse.json({ translation });
  } catch (error) {
    console.error('Error saving push question translation:', error);
    return NextResponse.json(
      { error: 'Failed to save translation' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a translation
export async function DELETE(request, { params }) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const language = searchParams.get('language');

    if (!language) {
      return NextResponse.json(
        { error: 'Language parameter is required' },
        { status: 400 }
      );
    }

    await prisma.pushQuestionTranslation.delete({
      where: {
        questionId_language: {
          questionId: id,
          language,
        },
      },
    });

    return NextResponse.json({ message: 'Translation deleted' });
  } catch (error) {
    console.error('Error deleting push question translation:', error);
    return NextResponse.json(
      { error: 'Failed to delete translation' },
      { status: 500 }
    );
  }
}
