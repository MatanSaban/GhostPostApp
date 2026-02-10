import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

// Verify user is a super admin
async function verifySuperAdmin() {
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
      },
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

// GET translations for an add-on
export async function GET(request, { params }) {
  try {
    const { id } = await params;

    const translations = await prisma.addOnTranslation.findMany({
      where: { addOnId: id },
    });

    return NextResponse.json({ translations });
  } catch (error) {
    console.error('Error fetching add-on translations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch translations' },
      { status: 500 }
    );
  }
}

// Create or update a translation
export async function POST(request, { params }) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { language, name, description } = body;

    if (!language || !name) {
      return NextResponse.json(
        { error: 'Language and name are required' },
        { status: 400 }
      );
    }

    // Validate language
    const validLanguages = ['EN', 'HE', 'AR', 'ES', 'FR', 'DE', 'PT', 'IT', 'RU', 'ZH', 'JA', 'KO'];
    if (!validLanguages.includes(language)) {
      return NextResponse.json(
        { error: `Invalid language. Must be one of: ${validLanguages.join(', ')}` },
        { status: 400 }
      );
    }

    // Check if add-on exists
    const addOn = await prisma.addOn.findUnique({ where: { id } });
    if (!addOn) {
      return NextResponse.json({ error: 'Add-on not found' }, { status: 404 });
    }

    // Upsert translation
    const translation = await prisma.addOnTranslation.upsert({
      where: {
        addOnId_language: {
          addOnId: id,
          language,
        },
      },
      update: {
        name,
        description: description || '',
      },
      create: {
        addOnId: id,
        language,
        name,
        description: description || '',
      },
    });

    return NextResponse.json({ 
      translation, 
      message: 'Translation saved successfully' 
    });
  } catch (error) {
    console.error('Error saving add-on translation:', error);
    return NextResponse.json(
      { error: 'Failed to save translation' },
      { status: 500 }
    );
  }
}

// Delete a translation
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

    // Check if translation exists
    const existing = await prisma.addOnTranslation.findUnique({
      where: {
        addOnId_language: {
          addOnId: id,
          language,
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Translation not found' },
        { status: 404 }
      );
    }

    await prisma.addOnTranslation.delete({
      where: {
        addOnId_language: {
          addOnId: id,
          language,
        },
      },
    });

    return NextResponse.json({ message: 'Translation deleted successfully' });
  } catch (error) {
    console.error('Error deleting add-on translation:', error);
    return NextResponse.json(
      { error: 'Failed to delete translation' },
      { status: 500 }
    );
  }
}
