// POST /api/push/subscribe
// Body: { endpoint, keys: { p256dh, auth }, userAgent? }
// Stores or refreshes the caller's PushSubscription. Endpoint is the unique
// identity issued by the browser's push service, so we upsert on it.

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

    const body = await request.json();
    const endpoint = body?.endpoint;
    const p256dh = body?.keys?.p256dh;
    const auth = body?.keys?.auth;

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json(
        { error: 'Missing endpoint or keys' },
        { status: 400 },
      );
    }

    const subscription = await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { userId, p256dh, auth, userAgent: body.userAgent || null },
      create: { userId, endpoint, p256dh, auth, userAgent: body.userAgent || null },
    });

    return NextResponse.json({ ok: true, id: subscription.id });
  } catch (err) {
    console.error('[push/subscribe]', err);
    return NextResponse.json({ error: 'Subscribe failed' }, { status: 500 });
  }
}
