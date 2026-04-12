import { NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { verifyWorkerAuth } from '@/lib/worker-auth';
import { notifyAccountMembers } from '@/lib/notifications';
import { uploadMediaFromUrl, updateSeoData } from '@/lib/wp-api-client';

const MAX_PUBLISH_ATTEMPTS = 3;

// ─── HMAC Signature ──────────────────────────────────────────────────
function generateHmacSignature(siteSecret, body, timestamp) {
  const payload = `${timestamp}.${body}`;
  return crypto.createHmac('sha256', siteSecret).update(payload).digest('hex');
}

// ─── Upload featured image to WordPress ──────────────────────────────
async function uploadFeaturedToWp(site, imageUrl, altText) {
  if (!imageUrl) return null;
  try {
    const result = await uploadMediaFromUrl(site, imageUrl, {
      alt: altText || '',
      title: altText || '',
    });
    return result?.id || result?.attachment_id || null;
  } catch (err) {
    console.warn('[worker:publish-article] Featured image upload failed:', err.message);
    return null;
  }
}

// ─── WordPress Publisher ─────────────────────────────────────────────
async function pushToWordPress(site, aiResult, content) {
  const wpEndpoint = `${site.url.replace(/\/+$/, '')}/wp-json/ghost-post/v1/posts`;
  const timestamp = Math.floor(Date.now() / 1000);

  // Upload featured image to WP media library
  const featuredImageId = await uploadFeaturedToWp(
    site,
    aiResult.featuredImage || content.featuredImage,
    aiResult.featuredImageAlt || ''
  );

  const payload = {
    title: aiResult.title,
    content: aiResult.html,
    excerpt: aiResult.excerpt || '',
    slug: aiResult.slug || '',
    status: 'publish',
    source: 'gp-platform',
    meta: {
      // Yoast SEO
      _yoast_wpseo_title: aiResult.metaTitle || '',
      _yoast_wpseo_metadesc: aiResult.metaDescription || '',
      _yoast_wpseo_focuskw: aiResult.focusKeyword || '',
      _yoast_wpseo_canonical: aiResult.canonicalUrl || '',
      // Rank Math
      rank_math_title: aiResult.metaTitle || '',
      rank_math_description: aiResult.metaDescription || '',
      rank_math_focus_keyword: aiResult.focusKeyword || '',
      rank_math_canonical_url: aiResult.canonicalUrl || '',
    },
  };

  // Set featured image if uploaded
  if (featuredImageId) {
    payload.featured_image_id = featuredImageId;
    payload.featured_image = featuredImageId;
  }

  const body = JSON.stringify(payload);
  const signature = generateHmacSignature(site.siteSecret, body, timestamp);

  const response = await fetch(wpEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-GP-Site-Key': site.siteKey,
      'X-GP-Timestamp': String(timestamp),
      'X-GP-Signature': signature,
    },
    body,
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`WordPress responded ${response.status}: ${text.slice(0, 500)}`);
  }

  const wpResult = await response.json();
  const wpPostId = wpResult?.id;

  // Update SEO data via dedicated endpoint (handles OG, Twitter, canonical)
  if (wpPostId) {
    try {
      await updateSeoData(site, wpPostId, {
        title: aiResult.metaTitle || '',
        description: aiResult.metaDescription || '',
        canonical: aiResult.canonicalUrl || '',
        focusKeyword: aiResult.focusKeyword || '',
        og: {
          title: aiResult.ogTitle || aiResult.metaTitle || '',
          description: aiResult.ogDescription || aiResult.metaDescription || '',
          image: aiResult.featuredImage || '',
        },
        twitter: {
          title: aiResult.twitterTitle || aiResult.metaTitle || '',
          description: aiResult.twitterDescription || aiResult.metaDescription || '',
          image: aiResult.featuredImage || '',
        },
      });
    } catch (seoErr) {
      console.warn('[worker:publish-article] SEO update failed:', seoErr.message);
    }
  }

  return wpResult;
}

// ─── Log error to SystemLog ──────────────────────────────────────────
async function logError(contentId, siteId, accountId, message, stack, metadata) {
  try {
    await prisma.systemLog.create({
      data: {
        level: 'ERROR',
        source: 'worker:publish-article',
        contentId,
        siteId,
        accountId,
        message: (message || 'Unknown error').slice(0, 500),
        stack: (stack || '').slice(0, 5000),
        metadata,
      },
    });
  } catch (logErr) {
    console.error('[worker:publish-article] Failed to write SystemLog:', logErr);
  }
}

// ─── Worker Route Handler ────────────────────────────────────────────
export async function POST(request) {
  // ── Auth ─────────────────────────────────────────────────────────
  const auth = verifyWorkerAuth(request);
  if (!auth.valid) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const { contentId } = body;
  if (!contentId) {
    return NextResponse.json({ ok: false, error: 'Missing contentId' }, { status: 400 });
  }

  // ── Fetch content with site info ─────────────────────────────────
  let content;
  try {
    content = await prisma.content.findUnique({
      where: { id: contentId },
      include: {
        site: {
          select: {
            id: true,
            accountId: true,
            url: true,
            name: true,
            siteKey: true,
            siteSecret: true,
            connectionStatus: true,
            sitePermissions: true,
          },
        },
      },
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: 'DB read error' }, { status: 500 });
  }

  if (!content) {
    return NextResponse.json({ ok: false, error: 'Content not found' }, { status: 404 });
  }

  // Guard: only publish if still READY_TO_PUBLISH
  if (content.status !== 'READY_TO_PUBLISH') {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: `Status is ${content.status}, expected READY_TO_PUBLISH`,
    });
  }

  const { site, aiResult } = content;
  const attempt = content.publishAttempts + 1;

  // Increment attempt counter immediately
  await prisma.content.update({
    where: { id: contentId },
    data: { publishAttempts: attempt, lastAttemptAt: new Date() },
  });

  const isConnected =
    site.connectionStatus === 'CONNECTED' &&
    site.siteKey &&
    site.siteSecret;

  try {
    if (isConnected) {
      if (!aiResult) {
        throw new Error('aiResult is missing - nothing to publish');
      }
      const wpResult = await pushToWordPress(site, aiResult, content);
      // Persist the WordPress post ID inside aiResult for future updates
      if (wpResult?.id) {
        await prisma.content.update({
          where: { id: contentId },
          data: { aiResult: { ...aiResult, wpPostId: wpResult.id } },
        });
      }
    }

    // ── Mark PUBLISHED ─────────────────────────────────────────────
    const now = new Date();
    await prisma.content.update({
      where: { id: contentId },
      data: {
        status: 'PUBLISHED',
        publishedAt: now,
        errorMessage: null,
      },
    });

    return NextResponse.json({
      ok: true,
      contentId,
      status: 'PUBLISHED',
      pushedToWp: isConnected,
    });
  } catch (err) {
    const errorMsg = err?.message || String(err);
    console.error(`[worker:publish-article] Failed ${contentId} (attempt ${attempt}):`, errorMsg);

    // Log full error to SystemLog
    await logError(
      contentId,
      site.id,
      site.accountId,
      errorMsg,
      err?.stack,
      { attempt, isConnected, campaignId: content.campaignId }
    );

    if (attempt >= MAX_PUBLISH_ATTEMPTS) {
      await prisma.content.update({
        where: { id: contentId },
        data: {
          status: 'FAILED',
          errorMessage: `Publish failed after ${attempt} attempts`,
        },
      });

      // Notify account members of the failure
      if (site.accountId) {
        try {
          await notifyAccountMembers(site.accountId, {
            type: 'content_publish_failed',
            title: 'notifications.contentPublishFailed.title',
            message: 'notifications.contentPublishFailed.message',
            link: `/dashboard/strategy/content-planner?contentId=${contentId}`,
            data: {
              contentId,
              contentTitle: aiResult?.title || content.title,
              siteName: site.name,
              siteId: site.id,
              errorMessage: errorMsg,
            },
          });
        } catch (notifyErr) {
          console.error('[worker:publish-article] Failed to send notification:', notifyErr);
        }
      }

      return NextResponse.json({ ok: false, contentId, status: 'FAILED', error: errorMsg });
    }

    // Keep as READY_TO_PUBLISH so the next cron run retries it
    await prisma.content.update({
      where: { id: contentId },
      data: {
        errorMessage: `Attempt ${attempt} failed, retrying next cycle`,
      },
    });

    return NextResponse.json({ ok: false, contentId, status: 'RETRY', attempt });
  }
}
