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
        lastSelectedAccountId: true,
        accountMemberships: { select: { accountId: true } },
      },
    });
  } catch {
    return null;
  }
}

/**
 * GET /api/notifications — fetch notifications for the current user
 * Query params: ?limit=20&unreadOnly=false&cursor=<id>&type=audit_complete
 */
export async function GET(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const unreadOnly = searchParams.get('unreadOnly') === 'true';
    const readOnly = searchParams.get('readOnly') === 'true';
    const cursor = searchParams.get('cursor'); // last notification id for pagination
    const type = searchParams.get('type'); // filter by notification type

    const where = { userId: user.id };
    if (unreadOnly) where.read = false;
    else if (readOnly) where.read = true;
    if (type) where.type = type;

    const findArgs = {
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1, // fetch one extra to detect hasMore
    };

    if (cursor) {
      findArgs.skip = 1;
      findArgs.cursor = { id: cursor };
    }

    const [results, unreadCount, totalCount] = await Promise.all([
      prisma.notification.findMany(findArgs),
      prisma.notification.count({
        where: { userId: user.id, read: false },
      }),
      prisma.notification.count({ where: { userId: user.id } }),
    ]);

    const hasMore = results.length > limit;
    const notifications = hasMore ? results.slice(0, limit) : results;
    const nextCursor = hasMore ? notifications[notifications.length - 1]?.id : null;

    return NextResponse.json({ notifications, unreadCount, totalCount, hasMore, nextCursor });
  } catch (error) {
    console.error('[API/notifications] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/notifications — mark notification(s) as read/unread
 * Body: { id: "single_id", read?: boolean } or { all: true }
 * If `read` is omitted, defaults to true (mark as read)
 */
export async function PATCH(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const readValue = body.read !== undefined ? body.read : true;

    if (body.all) {
      await prisma.notification.updateMany({
        where: { userId: user.id, read: !readValue },
        data: { read: readValue },
      });
    } else if (body.id) {
      await prisma.notification.updateMany({
        where: { id: body.id, userId: user.id },
        data: { read: readValue },
      });
    } else {
      return NextResponse.json({ error: 'Provide id or all:true' }, { status: 400 });
    }

    const unreadCount = await prisma.notification.count({
      where: { userId: user.id, read: false },
    });

    return NextResponse.json({ success: true, unreadCount });
  } catch (error) {
    console.error('[API/notifications] PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/notifications — dismiss/delete notification(s)
 * Body: { id: "single_id" } or { all: true }
 */
export async function DELETE(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    if (body.all) {
      await prisma.notification.deleteMany({
        where: { userId: user.id },
      });
    } else if (body.id) {
      await prisma.notification.deleteMany({
        where: { id: body.id, userId: user.id },
      });
    } else {
      return NextResponse.json({ error: 'Provide id or all:true' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API/notifications] DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
