import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyWorkerAuth } from '@/lib/worker-auth';
import { notifyAccountMembers } from '@/lib/notifications';
import { cms } from '@/lib/cms';
import { applyChange, canApplyNatively } from '@/lib/cms/apply';

const MAX_PUBLISH_ATTEMPTS = 3;

// ─── Payload builders ────────────────────────────────────────────────
function buildPostPayload(aiResult, featuredImageId) {
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
  if (featuredImageId) {
    payload.featured_image_id = featuredImageId;
    payload.featured_image = featuredImageId;
  }
  return payload;
}

function buildSeoPayload(aiResult) {
  return {
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
  };
}

// Output stored for sites with no native write path, so the user can publish it
// manually (or a later transport can pick it up). This is what replaces the old
// "mark PUBLISHED while writing nothing" behavior.
function buildAssistedOutput(aiResult) {
  return {
    title: aiResult.title,
    slug: aiResult.slug || '',
    html: aiResult.html,
    excerpt: aiResult.excerpt || '',
    metaTitle: aiResult.metaTitle || '',
    metaDescription: aiResult.metaDescription || '',
    canonicalUrl: aiResult.canonicalUrl || '',
    focusKeyword: aiResult.focusKeyword || '',
    featuredImage: aiResult.featuredImage || '',
    featuredImageAlt: aiResult.featuredImageAlt || '',
  };
}

// Upload the featured image to the site's media library when the adapter can
// do it natively (e.g. WordPress). Returns an attachment id or null.
async function uploadFeatured(site, imageUrl, altText) {
  if (!imageUrl) return null;
  if (!canApplyNatively(site, 'uploadMediaFromUrl')) return null;
  try {
    const result = await cms.uploadMediaFromUrl(site, imageUrl, {
      alt: altText || '',
      title: altText || '',
    });
    return result?.id || result?.attachment_id || null;
  } catch (err) {
    console.warn('[worker:publish-article] Featured image upload failed:', err.message);
    return null;
  }
}

// ─── Publish via the site's active transport (or report assisted) ──────
async function publishContent(site, aiResult, content) {
  const featuredImageId = await uploadFeatured(
    site,
    aiResult.featuredImage || content.featuredImage,
    aiResult.featuredImageAlt || ''
  );

  const payload = buildPostPayload(aiResult, featuredImageId);
  const createRes = await applyChange(site, 'createPost', ['post', payload], { manualKinds: ['snippet'] });

  if (createRes.mode === 'error') {
    throw new Error(createRes.error || 'Publish failed');
  }

  // No applied write path → hand back the generated output for manual publish.
  // (createPost is never contract-carried, so custom sites always land here.)
  if (!createRes.applied) {
    return { mode: 'ASSISTED', assistedOutput: buildAssistedOutput(aiResult) };
  }

  const externalId = createRes.result?.id;
  if (externalId) {
    // Best-effort SEO update via the dedicated endpoint (OG, Twitter, canonical).
    const seoRes = await applyChange(site, 'updateSeoData', [externalId, buildSeoPayload(aiResult)]);
    if (seoRes.mode === 'error') {
      console.warn('[worker:publish-article] SEO update failed:', seoRes.error);
    }
  }
  return { mode: 'NATIVE', externalId: externalId || null };
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
            platform: true,
            integrationType: true,
            siteKey: true,
            siteSecret: true,
            shopifyAccessToken: true,
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

  try {
    if (!aiResult) {
      throw new Error('aiResult is missing - nothing to publish');
    }

    // Route through the CMS dispatcher: writes natively when the site's active
    // transport supports it (WordPress plugin, Shopify, …), otherwise returns
    // ASSISTED so we store the generated output for manual publish instead of
    // marking PUBLISHED while writing nothing.
    const published = await publishContent(site, aiResult, content);

    // Persist the external post id for future updates (native writes only).
    if (published.mode === 'NATIVE' && published.externalId) {
      await prisma.content.update({
        where: { id: contentId },
        data: {
          aiResult: { ...aiResult, externalPostId: published.externalId, wpPostId: published.externalId },
        },
      });
    }

    // ── Mark PUBLISHED (NATIVE) or PUBLISHED-ASSISTED ──────────────
    const now = new Date();
    await prisma.content.update({
      where: { id: contentId },
      data: {
        status: 'PUBLISHED',
        publishedAt: now,
        errorMessage: null,
        publishMode: published.mode, // 'NATIVE' | 'ASSISTED'
        assistedOutput: published.mode === 'ASSISTED' ? published.assistedOutput : undefined,
      },
    });

    return NextResponse.json({
      ok: true,
      contentId,
      status: 'PUBLISHED',
      publishMode: published.mode,
      pushed: published.mode === 'NATIVE',
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
      { attempt, campaignId: content.campaignId }
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
              platform: site.platform || null,
              isConnected: site.connectionStatus === 'CONNECTED',
              hasAiResult: !!aiResult,
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
