import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { signWorkerPayload } from '@/lib/worker-auth';

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
 * Dispatch a call to the generate-article worker.
 */
function dispatchGenerate(contentId) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  const { token, timestamp } = signWorkerPayload(contentId);

  return fetch(`${baseUrl}/api/worker/generate-article`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-worker-token': token,
      'x-worker-timestamp': String(timestamp),
      'x-worker-content-id': contentId,
    },
    body: JSON.stringify({ contentId }),
    signal: AbortSignal.timeout(120_000),
  }).then(async (res) => {
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, ...body };
  });
}

/**
 * Dispatch a call to the publish-article worker.
 */
function dispatchPublish(contentId) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  const { token, timestamp } = signWorkerPayload(contentId);

  return fetch(`${baseUrl}/api/worker/publish-article`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-worker-token': token,
      'x-worker-timestamp': String(timestamp),
      'x-worker-content-id': contentId,
    },
    body: JSON.stringify({ contentId }),
    signal: AbortSignal.timeout(120_000),
  }).then(async (res) => {
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, ...body };
  });
}

/**
 * Resolve the WordPress post ID for a content item.
 * Tries aiResult.wpPostId first, then falls back to slug lookup via plugin API.
 * Caches the result back into aiResult for future calls.
 */
async function resolveWpPostId(content) {
  // Fast path: already stored
  if (content.aiResult?.wpPostId) return content.aiResult.wpPostId;

  // Fallback: look up by slug on WordPress
  const slug = content.aiResult?.slug || content.slug;
  if (!slug || !content.site?.siteKey || !content.site?.siteSecret) return null;

  try {
    const { getPostBySlug } = await import('@/lib/wp-api-client');
    const wpPost = await getPostBySlug(content.site, 'post', slug);
    if (wpPost?.id) {
      // Cache the WP post ID for future use
      await prisma.content.update({
        where: { id: content.id },
        data: { aiResult: { ...(content.aiResult || {}), wpPostId: wpPost.id } },
      });
      return wpPost.id;
    }
  } catch (err) {
    console.error('[transition] Failed to resolve WP post ID by slug:', err.message);
  }
  return null;
}

/**
 * POST /api/contents/[id]/transition
 *
 * Handle status transitions with real side effects:
 *
 * - → PUBLISHED: triggers publish worker (sets READY_TO_PUBLISH, then dispatches)
 * - → PROCESSING / READY_TO_PUBLISH: triggers generate worker (sets SCHEDULED, then dispatches)
 * - → DRAFT: if was PUBLISHED, unpublishes on WP (sets to DRAFT)
 *
 * Body: { targetStatus: 'PUBLISHED' | 'PROCESSING' | 'READY_TO_PUBLISH' | 'DRAFT' | 'SCHEDULED' }
 */
export async function POST(request, { params }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { targetStatus } = body;

    if (!targetStatus) {
      return NextResponse.json({ error: 'targetStatus is required' }, { status: 400 });
    }

    const validStatuses = ['DRAFT', 'SCHEDULED', 'PROCESSING', 'READY_TO_PUBLISH', 'PUBLISHED'];
    if (!validStatuses.includes(targetStatus)) {
      return NextResponse.json({ error: 'Invalid target status' }, { status: 400 });
    }

    const content = await prisma.content.findUnique({
      where: { id },
      include: {
        site: {
          select: {
            id: true,
            url: true,
            siteKey: true,
            siteSecret: true,
            connectionStatus: true,
          },
        },
      },
    });

    if (!content) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    }

    const site = await verifySiteAccess(content.siteId, user.id);
    if (!site) {
      return NextResponse.json({ error: 'No access' }, { status: 404 });
    }

    const currentStatus = content.status;

    // ── PUBLISHED target: trigger publish ──────────────────────────
    if (targetStatus === 'PUBLISHED') {
      const hasAiResult = content.aiResult && (content.aiResult.html || content.aiResult.title);

      if (!hasAiResult) {
        // No content generated yet — need to generate first, then it will publish after
        // Set to SCHEDULED so cron picks it up for generation → then publish
        // Only bump scheduledAt to now if the post's date is in the past
        const now = new Date();
        const dateInPast = !content.scheduledAt || content.scheduledAt < new Date(now.getFullYear(), now.getMonth(), now.getDate());
        await prisma.content.update({
          where: { id },
          data: {
            status: 'SCHEDULED',
            ...(dateInPast && { scheduledAt: now }),
            processingAttempts: 0,
            publishAttempts: 0,
            errorMessage: null,
          },
        });

        // Dispatch generate immediately
        const genResult = await dispatchGenerate(id);

        // After generation, if successful, the content will be READY_TO_PUBLISH
        // Now dispatch publish too
        if (genResult.ok && !genResult.error) {
          const pubResult = await dispatchPublish(id);
          // Fetch final state
          const final = await prisma.content.findUnique({ where: { id }, select: { status: true, errorMessage: true } });
          return NextResponse.json({
            content: final,
            action: 'generated_and_published',
            generateResult: genResult,
            publishResult: pubResult,
          });
        }

        // Generation failed
        const final = await prisma.content.findUnique({ where: { id }, select: { status: true, errorMessage: true } });
        return NextResponse.json({
          content: final,
          action: 'generate_failed',
          generateResult: genResult,
        });
      }

      // Has AI result — set to READY_TO_PUBLISH and dispatch publish
      // Only bump scheduledAt to now if the post's date is in the past
      const now = new Date();
      const dateInPast = !content.scheduledAt || content.scheduledAt < new Date(now.getFullYear(), now.getMonth(), now.getDate());
      await prisma.content.update({
        where: { id },
        data: {
          status: 'READY_TO_PUBLISH',
          ...(dateInPast && { scheduledAt: now }),
          publishAttempts: 0,
          errorMessage: null,
        },
      });

      const pubResult = await dispatchPublish(id);
      const final = await prisma.content.findUnique({ where: { id }, select: { status: true, errorMessage: true } });
      return NextResponse.json({
        content: final,
        action: 'published',
        publishResult: pubResult,
      });
    }

    // ── READY_TO_PUBLISH from PUBLISHED or READY_TO_PUBLISH: reschedule/set pending on WP ──
    if (targetStatus === 'READY_TO_PUBLISH' && (currentStatus === 'PUBLISHED' || currentStatus === 'READY_TO_PUBLISH')) {
      const newScheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : content.scheduledAt;
      const now = new Date();
      const isFuture = newScheduledAt && newScheduledAt > now;

      await prisma.content.update({
        where: { id },
        data: {
          status: 'READY_TO_PUBLISH',
          ...(body.scheduledAt && { scheduledAt: newScheduledAt }),
          errorMessage: null,
        },
      });

      // Update WordPress post status
      const wpPostId = await resolveWpPostId(content);
      if (wpPostId && content.site?.siteKey && content.site?.siteSecret) {
        try {
          const { makePluginRequest } = await import('@/lib/wp-api-client');
          if (isFuture) {
            // Future date → schedule on WP with that date
            await makePluginRequest(content.site, `/posts/${wpPostId}`, 'PUT', {
              status: 'future',
              date: newScheduledAt.toISOString(),
              date_gmt: newScheduledAt.toISOString(),
            });
          } else {
            // Past/current date → pending on WP
            await makePluginRequest(content.site, `/posts/${wpPostId}`, 'PUT', {
              status: 'pending',
            });
          }
        } catch (wpErr) {
          console.error('[transition] Failed to update WP status:', wpErr.message);
        }
      }

      const final = await prisma.content.findUnique({ where: { id }, select: { status: true, errorMessage: true } });
      return NextResponse.json({
        content: final,
        action: isFuture ? 'scheduled_on_wp' : 'set_pending_on_wp',
      });
    }

    // ── PROCESSING or READY_TO_PUBLISH target: trigger generation ──
    if (targetStatus === 'PROCESSING' || targetStatus === 'READY_TO_PUBLISH') {
      // Set to SCHEDULED so generate-article worker can lock it to PROCESSING
      // Update scheduledAt if provided (e.g. from drag-to-today)
      await prisma.content.update({
        where: { id },
        data: {
          status: 'SCHEDULED',
          ...(body.scheduledAt && { scheduledAt: new Date(body.scheduledAt) }),
          processingAttempts: 0,
          errorMessage: null,
        },
      });

      const genResult = await dispatchGenerate(id);
      const final = await prisma.content.findUnique({ where: { id }, select: { status: true, errorMessage: true } });
      return NextResponse.json({
        content: final,
        action: 'generated',
        generateResult: genResult,
      });
    }

    // ── DRAFT target: if published, unpublish on WP ────────────────
    if (targetStatus === 'DRAFT') {
      const wpPostId = await resolveWpPostId(content);
      if (currentStatus === 'PUBLISHED' && wpPostId && content.site?.siteKey && content.site?.siteSecret) {
        // Try to set post to draft on WordPress
        try {
          const { makePluginRequest } = await import('@/lib/wp-api-client');
          await makePluginRequest(content.site, `/posts/${wpPostId}`, 'PUT', {
            status: 'draft',
          });
        } catch (wpErr) {
          console.error('[transition] Failed to unpublish on WP:', wpErr.message);
          // Continue - still set to draft locally
        }
      }

      await prisma.content.update({
        where: { id },
        data: {
          status: 'DRAFT',
          errorMessage: null,
        },
      });

      const final = await prisma.content.findUnique({ where: { id }, select: { status: true, errorMessage: true } });
      return NextResponse.json({ content: final, action: 'set_draft' });
    }

    // ── SCHEDULED target: simple status change ─────────────────────
    if (targetStatus === 'SCHEDULED') {
      await prisma.content.update({
        where: { id },
        data: {
          status: 'SCHEDULED',
          errorMessage: null,
          processingAttempts: 0,
          publishAttempts: 0,
        },
      });

      const final = await prisma.content.findUnique({ where: { id }, select: { status: true, errorMessage: true } });
      return NextResponse.json({ content: final, action: 'set_scheduled' });
    }

    return NextResponse.json({ error: 'Unhandled transition' }, { status: 400 });
  } catch (error) {
    console.error('[Contents Transition API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
