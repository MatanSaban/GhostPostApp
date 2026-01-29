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

// GET /api/admin/bot-actions/[id] - Get a single bot action
export async function GET(request, { params }) {
  const admin = await verifySuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const action = await prisma.botAction.findUnique({
      where: { id }
    });

    if (!action) {
      return NextResponse.json({ error: 'Action not found' }, { status: 404 });
    }

    return NextResponse.json({ action });
  } catch (e) {
    console.error('Error fetching bot action:', e);
    return NextResponse.json({ error: 'Failed to fetch bot action' }, { status: 500 });
  }
}

// PUT /api/admin/bot-actions/[id] - Update a bot action
export async function PUT(request, { params }) {
  const admin = await verifySuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const { name, description, handler, parameters, returns, example, requiresAuth, isActive } = body;

    // Check if action exists
    const existing = await prisma.botAction.findUnique({
      where: { id }
    });

    if (!existing) {
      return NextResponse.json({ error: 'Action not found' }, { status: 404 });
    }

    // If name is changing, check for conflicts
    if (name && name !== existing.name) {
      const nameConflict = await prisma.botAction.findUnique({
        where: { name }
      });
      if (nameConflict) {
        return NextResponse.json({ error: 'Action with this name already exists' }, { status: 409 });
      }
    }

    const action = await prisma.botAction.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(handler !== undefined && { handler }),
        ...(parameters !== undefined && { parameters }),
        ...(returns !== undefined && { returns }),
        ...(example !== undefined && { example }),
        ...(requiresAuth !== undefined && { requiresAuth }),
        ...(isActive !== undefined && { isActive })
      }
    });

    return NextResponse.json({ action });
  } catch (e) {
    console.error('Error updating bot action:', e);
    return NextResponse.json({ error: 'Failed to update bot action' }, { status: 500 });
  }
}

// DELETE /api/admin/bot-actions/[id] - Delete a bot action
export async function DELETE(request, { params }) {
  const admin = await verifySuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const existing = await prisma.botAction.findUnique({
      where: { id }
    });

    if (!existing) {
      return NextResponse.json({ error: 'Action not found' }, { status: 404 });
    }

    await prisma.botAction.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Error deleting bot action:', e);
    return NextResponse.json({ error: 'Failed to delete bot action' }, { status: 500 });
  }
}
