import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

// Check if user is super admin
async function verifySuperAdmin() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, isSuperAdmin: true }
    });

    if (!user?.isSuperAdmin) return null;
    return user;
  } catch {
    return null;
  }
}

// GET /api/admin/bot-actions - List all bot actions
export async function GET() {
  const admin = await verifySuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const actions = await prisma.botAction.findMany({
      orderBy: { name: 'asc' }
    });

    return NextResponse.json({ actions });
  } catch (e) {
    console.error('Error fetching bot actions:', e);
    return NextResponse.json({ error: 'Failed to fetch bot actions' }, { status: 500 });
  }
}

// POST /api/admin/bot-actions - Create a new bot action
export async function POST(request) {
  const admin = await verifySuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { name, description, handler, parameters, returns, example, requiresAuth, isActive } = body;

    if (!name || !description || !handler || !parameters || !returns) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Check if action with same name exists
    const existing = await prisma.botAction.findUnique({
      where: { name }
    });

    if (existing) {
      return NextResponse.json({ error: 'Action with this name already exists' }, { status: 409 });
    }

    const action = await prisma.botAction.create({
      data: {
        name,
        description,
        handler,
        parameters,
        returns,
        example: example || null,
        requiresAuth: requiresAuth ?? true,
        isActive: isActive ?? true
      }
    });

    return NextResponse.json({ action }, { status: 201 });
  } catch (e) {
    console.error('Error creating bot action:', e);
    return NextResponse.json({ error: 'Failed to create bot action' }, { status: 500 });
  }
}
