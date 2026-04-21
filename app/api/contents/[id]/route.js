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
    select: { id: true, email: true, isSuperAdmin: true },
  });
}

async function verifySiteAccess(siteId, user) {
  const where = user.isSuperAdmin
    ? { id: siteId }
    : { id: siteId, account: { members: { some: { userId: user.id } } } };
  return prisma.site.findFirst({ where,
    select: { id: true } });
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
      select: { siteId: true, status: true, aiResult: true, slug: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    }

    const site = await verifySiteAccess(existing.siteId, user.id);
    if (!site) {
      return NextResponse.json({ error: 'No access' }, { status: 404 });
    }

    // Build update - only safe fields
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

    // For published posts with a title change: update WordPress FIRST.
    // The platform Content record is NOT updated here - the WP plugin will
    // fire the entity-updated webhook which syncs the data back.
    if (updateData.title && existing.status === 'PUBLISHED') {
      const siteRecord = await prisma.site.findUnique({
        where: { id: existing.siteId },
        select: { id: true, url: true, siteKey: true, siteSecret: true, connectionStatus: true, platform: true },
      });
      if (!siteRecord?.platform || siteRecord.platform !== 'wordpress' || siteRecord.connectionStatus !== 'CONNECTED' || !siteRecord.siteKey || !siteRecord.siteSecret) {
        return NextResponse.json({ error: 'WordPress site not connected' }, { status: 400 });
      }

      const { makePluginRequest, getPostBySlug } = await import('@/lib/wp-api-client');

      // Resolve WP post ID: try stored value, then slug lookup
      let wpPostId = existing.aiResult?.wpPostId;
      if (!wpPostId) {
        const slug = existing.aiResult?.slug || existing.slug;
        if (slug) {
          const wpPost = await getPostBySlug(siteRecord, 'post', slug);
          if (wpPost?.id) {
            wpPostId = wpPost.id;
            // Cache for future use
            await prisma.content.update({
              where: { id },
              data: { aiResult: { ...(existing.aiResult || {}), wpPostId } },
            });
          }
        }
      }

      if (!wpPostId) {
        return NextResponse.json({ error: 'Could not find post on WordPress' }, { status: 404 });
      }

      // Update WordPress - if this fails the request fails (no platform change)
      await makePluginRequest(siteRecord, `/posts/${wpPostId}`, 'PUT', {
        title: updateData.title,
      });

      // Don't update the Content title locally - let the WP plugin webhook
      // push the updated entity data back to the platform.
      delete updateData.title;

      // If no other fields to update, return early
      if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ content: { id }, wpSynced: true });
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

/**
 * DELETE /api/contents/[id]
 *
 * Delete a single Content record and its associated ContentBody.
 */
export async function DELETE(request, { params }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const existing = await prisma.content.findUnique({
      where: { id },
      select: { siteId: true, status: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    }

    if (existing.status === 'PUBLISHED') {
      return NextResponse.json({ error: 'Cannot delete a published post' }, { status: 400 });
    }

    const site = await verifySiteAccess(existing.siteId, user.id);
    if (!site) {
      return NextResponse.json({ error: 'No access' }, { status: 404 });
    }

    // Delete ContentBody first (if exists), then the Content record
    await prisma.contentBody.deleteMany({ where: { contentId: id } });
    await prisma.content.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Contents API] DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
