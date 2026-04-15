import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) return null;

    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        isSuperAdmin: true,
        accountMemberships: { select: { accountId: true } },
      },
    });
  } catch {
    return null;
  }
}

// PATCH - Toggle isProtected on an entity
export async function PATCH(request, { params }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { isProtected } = await request.json();

    if (typeof isProtected !== 'boolean') {
      return NextResponse.json({ error: 'isProtected must be a boolean' }, { status: 400 });
    }

    const accountIds = user.accountMemberships.map(m => m.accountId);

    const entity = await prisma.siteEntity.findUnique({
      where: { id },
      include: { site: { select: { accountId: true } } },
    });

    if (!entity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
    }

    if (!accountIds.includes(entity.site.accountId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const updated = await prisma.siteEntity.update({
      where: { id },
      data: { isProtected },
      select: { id: true, isProtected: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to toggle protection:', error);
    return NextResponse.json({ error: 'Failed to toggle protection' }, { status: 500 });
  }
}
