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

// POST /api/translations/invalidate - Invalidate client cache
export async function POST() {
  const admin = await verifySuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Return a new cache version that clients can use to bust their cache
  const cacheVersion = Date.now();
  
  return NextResponse.json({ 
    success: true, 
    cacheVersion,
    message: 'Cache invalidated. Clients will refetch on next load.'
  });
}
