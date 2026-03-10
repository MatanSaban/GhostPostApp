import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!userId) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });
}

async function verifySiteAccess(siteId, userId) {
  return prisma.site.findFirst({
    where: {
      id: siteId,
      account: { members: { some: { userId } } },
    },
    select: { id: true },
  });
}

/**
 * PATCH /api/contents/[id]
 *
 * Update a single Content record. Only allowed fields are accepted.
 */
export async function PATCH(request, { params }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.content.findUnique({
      where: { id },
      select: { siteId: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    }

    const site = await verifySiteAccess(existing.siteId, user.id);
    if (!site) {
      return NextResponse.json({ error: 'No access' }, { status: 404 });
    }

    // Build update — only safe fields
    const updateData = {};
    const allowedFields = [
      'scheduledAt',
      'title',
      'status',
      'publishAttempts',
      'processingAttempts',
      'errorMessage',
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    // Convert date strings to Date
    if (updateData.scheduledAt) {
      updateData.scheduledAt = new Date(updateData.scheduledAt);
    }

    // When retrying, reset the attempt counter and clear errors
    if (body.status === 'READY_TO_PUBLISH' || body.status === 'SCHEDULED') {
      if (body.publishAttempts === 0) {
        updateData.publishAttempts = 0;
      }
      if (body.processingAttempts === 0) {
        updateData.processingAttempts = 0;
      }
      if (body.errorMessage === null) {
        updateData.errorMessage = null;
      }
    }

    const content = await prisma.content.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ content });
  } catch (error) {
    console.error('[Contents API] PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
