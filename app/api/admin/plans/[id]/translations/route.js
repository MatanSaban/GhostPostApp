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

// GET - Get all translations for a plan
export async function GET(request, { params }) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const translations = await prisma.planTranslation.findMany({
      where: { planId: id },
      orderBy: { language: 'asc' },
    });

    return NextResponse.json({ translations });
  } catch (error) {
    console.error('Error fetching plan translations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch translations' },
      { status: 500 }
    );
  }
}

// POST - Create or update a translation for a plan
export async function POST(request, { params }) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { language, name, description, features } = body;

    if (!language || !name) {
      return NextResponse.json(
        { error: 'Language and name are required' },
        { status: 400 }
      );
    }

    // Check if plan exists
    const plan = await prisma.plan.findUnique({ where: { id } });
    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    // Upsert translation
    const translation = await prisma.planTranslation.upsert({
      where: {
        planId_language: {
          planId: id,
          language,
        },
      },
      update: {
        name,
        description: description || null,
        features: features || [],
      },
      create: {
        planId: id,
        language,
        name,
        description: description || null,
        features: features || [],
      },
    });

    return NextResponse.json({ translation });
  } catch (error) {
    console.error('Error saving plan translation:', error);
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

    await prisma.planTranslation.delete({
      where: {
        planId_language: {
          planId: id,
          language,
        },
      },
    });

    return NextResponse.json({ message: 'Translation deleted' });
  } catch (error) {
    console.error('Error deleting plan translation:', error);
    return NextResponse.json(
      { error: 'Failed to delete translation' },
      { status: 500 }
    );
  }
}
