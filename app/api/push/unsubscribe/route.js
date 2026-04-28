// POST /api/push/unsubscribe
// Body: { endpoint }
// Deletes the caller's PushSubscription for that endpoint. Scoped to the
// caller's userId so one user can't reap another user's subscriptions.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

async function getUserId() {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value || null;
}

export async function POST(request) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { endpoint } = await request.json();
    if (!endpoint) {
      return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });
    }

    const result = await prisma.pushSubscription.deleteMany({
      where: { endpoint, userId },
    });

    return NextResponse.json({ ok: true, deleted: result.count });
  } catch (err) {
    console.error('[push/unsubscribe]', err);
    return NextResponse.json({ error: 'Unsubscribe failed' }, { status: 500 });
  }
}
