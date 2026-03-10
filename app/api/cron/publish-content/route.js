import { NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { notifyAccountMembers } from '@/lib/notifications';

const BATCH_SIZE = 5;
const MAX_PUBLISH_ATTEMPTS = 3;

// ─── Security ────────────────────────────────────────────────────────
function verifyAuth(request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) return true; // dev mode
  return authHeader === `Bearer ${cronSecret}`;
}

// ─── HMAC Signature ──────────────────────────────────────────────────
/**
 * Generate an HMAC-SHA256 signature for authenticating requests
 * to the Ghost Post WordPress plugin.
 *
 * The plugin validates: HMAC( timestamp + '.' + body ) using siteSecret.
 *
 * @param {string} siteSecret - Shared secret for HMAC signing
 * @param {string} body       - JSON stringified request body
 * @param {number} timestamp  - Unix timestamp (seconds)
 * @returns {string}          - Hex-encoded HMAC signature
 */
function generateHmacSignature(siteSecret, body, timestamp) {
  const payload = `${timestamp}.${body}`;
  return crypto.createHmac('sha256', siteSecret).update(payload).digest('hex');
}

// ─── WordPress Publisher ─────────────────────────────────────────────
/**
 * Push content to the client's WordPress site via our Ghost Post plugin.
 *
 * @param {object} site     - Site record with url, siteKey, siteSecret
 * @param {object} aiResult - Generated article data from the AI worker
 * @returns {Promise<object>} - WordPress API response data
 */
async function pushToWordPress(site, aiResult) {
  const wpEndpoint = `${site.url.replace(/\/+$/, '')}/wp-json/ghost-post/v1/posts`;
  const timestamp = Math.floor(Date.now() / 1000);

  const payload = {
    title: aiResult.title,
    content: aiResult.html,
    excerpt: aiResult.excerpt || '',
    slug: aiResult.slug || '',
    status: 'publish',
    // Flag so the plugin knows this came from gp-platform
    // and won't send a webhook back (conflict prevention)
    source: 'gp-platform',
    // SEO meta fields - works with Yoast, Rank Math, or as generic post meta
    meta: {
      _yoast_wpseo_title: aiResult.metaTitle || '',
      _yoast_wpseo_metadesc: aiResult.metaDescription || '',
      // Rank Math equivalents
      rank_math_title: aiResult.metaTitle || '',
      rank_math_description: aiResult.metaDescription || '',
    },
  };

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
    signal: AbortSignal.timeout(30_000), // 30s timeout
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`WordPress responded ${response.status}: ${text.slice(0, 500)}`);
  }

  return response.json();
}

// ─── Fetch Ready Content ─────────────────────────────────────────────
async function fetchReadyContent() {
  const now = new Date();

  return prisma.content.findMany({
    where: {
      status: 'READY_TO_PUBLISH',
      scheduledAt: { lte: now },
      publishAttempts: { lt: MAX_PUBLISH_ATTEMPTS },
      // Include ACTIVE, PAUSED, and COMPLETED campaigns (for retried content)
      // Exclude only DRAFT campaigns that haven't started yet
      OR: [
        { campaign: { status: { in: ['ACTIVE', 'PAUSED', 'COMPLETED'] } } },
        { campaignId: null },
      ],
    },
    orderBy: { scheduledAt: 'asc' },
    take: BATCH_SIZE,
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
}

// ─── Publish a Single Content Record ─────────────────────────────────
async function publishContent(content) {
  const { site, aiResult } = content;
  const attempt = content.publishAttempts + 1;

  // Increment attempt counter immediately
  await prisma.content.update({
    where: { id: content.id },
    data: { publishAttempts: attempt, lastAttemptAt: new Date() },
  });

  const isConnected =
    site.connectionStatus === 'CONNECTED' &&
    site.siteKey &&
    site.siteSecret;

  try {
    if (isConnected) {
      // ── WordPress Push ───────────────────────────────────────────
      if (!aiResult) {
        throw new Error('aiResult is missing — nothing to publish');
      }

      await pushToWordPress(site, aiResult);
    }
    // If NOT connected, we skip the external push — the content
    // lives in the Ghost Post dashboard as the source of truth.

    // ── Mark PUBLISHED ─────────────────────────────────────────────
    const now = new Date();
    await prisma.content.update({
      where: { id: content.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: now,
        content: aiResult?.html || content.content,
        title: aiResult?.title || content.title,
        metaTitle: aiResult?.metaTitle || content.metaTitle,
        metaDescription: aiResult?.metaDescription || content.metaDescription,
        excerpt: aiResult?.excerpt || content.excerpt,
        wordCount: aiResult?.wordCount || content.wordCount,
        errorMessage: null,
      },
    });

    return {
      id: content.id,
      title: content.title,
      status: 'PUBLISHED',
      pushedToWp: isConnected,
    };
  } catch (err) {
    const errorMsg = err?.message || String(err);
    console.error(
      `[publish-content] Failed ${content.id} (attempt ${attempt}):`,
      errorMsg
    );

    if (attempt >= MAX_PUBLISH_ATTEMPTS) {
      // Max retries exhausted → FAILED
      await prisma.content.update({
        where: { id: content.id },
        data: {
          status: 'FAILED',
          errorMessage: `Publish failed after ${attempt} attempts: ${errorMsg}`,
        },
      });

      // Create notification for failed publish
      if (site.accountId) {
        await notifyAccountMembers(site.accountId, {
          type: 'content_publish_failed',
          title: 'notifications.contentPublishFailed.title',
          message: 'notifications.contentPublishFailed.message',
          link: `/dashboard/strategy/content-planner?contentId=${content.id}`,
          data: {
            contentId: content.id,
            contentTitle: aiResult?.title || content.title,
            siteName: site.name,
            siteId: site.id,
            errorMessage: errorMsg,
            aiResult: aiResult || null,
            isConnected,
          },
        });
      }

      return {
        id: content.id,
        title: content.title,
        status: 'FAILED',
        error: errorMsg,
      };
    }

    // Keep as READY_TO_PUBLISH so the next cron run retries it
    await prisma.content.update({
      where: { id: content.id },
      data: {
        errorMessage: `Attempt ${attempt} failed: ${errorMsg}`,
      },
    });

    return {
      id: content.id,
      title: content.title,
      status: 'RETRY',
      attempt,
      error: errorMsg,
    };
  }
}

// ─── API Route Handler ───────────────────────────────────────────────
export async function GET(request) {
  if (!verifyAuth(request)) {
    return NextResponse.json(
      { ok: false, error: 'UNAUTHORIZED' },
      { status: 401 }
    );
  }

  try {
    const now = new Date();
    console.log(`[publish-content] Starting at ${now.toISOString()}`);

    const batch = await fetchReadyContent();
    console.log(`[publish-content] Found ${batch.length} content items ready to publish`);

    if (batch.length === 0) {
      // Debug: check if there are any READY_TO_PUBLISH that didn't match
      const allReady = await prisma.content.findMany({
        where: { status: 'READY_TO_PUBLISH' },
        select: {
          id: true,
          scheduledAt: true,
          publishAttempts: true,
          campaign: { select: { id: true, status: true } },
        },
        take: 10,
      });
      if (allReady.length > 0) {
        console.log('[publish-content] READY_TO_PUBLISH content exists but not matched:', 
          allReady.map(c => ({
            id: c.id,
            scheduledAt: c.scheduledAt?.toISOString(),
            scheduledDue: c.scheduledAt ? c.scheduledAt <= now : 'no date',
            attempts: c.publishAttempts,
            campaignStatus: c.campaign?.status || 'no campaign',
          }))
        );
      }

      return NextResponse.json({
        ok: true,
        message: 'No content ready to publish',
        processed: [],
      });
    }

    // Process sequentially to stay within serverless limits
    const results = [];
    for (const content of batch) {
      const result = await publishContent(content);
      results.push(result);
    }

    const summary = {
      ok: true,
      processed: results.length,
      published: results.filter((r) => r.status === 'PUBLISHED').length,
      retried: results.filter((r) => r.status === 'RETRY').length,
      failed: results.filter((r) => r.status === 'FAILED').length,
      details: results,
    };

    console.log('[publish-content] Batch complete:', JSON.stringify(summary));

    // ── Auto-complete campaigns whose content is all finished ────
    try {
      const campaignIds = [...new Set(batch.map(c => c.campaignId).filter(Boolean))];
      for (const campaignId of campaignIds) {
        const remaining = await prisma.content.count({
          where: {
            campaignId,
            status: { in: ['SCHEDULED', 'PROCESSING', 'READY_TO_PUBLISH'] },
          },
        });
        if (remaining === 0) {
          await prisma.campaign.updateMany({
            where: { id: campaignId, status: 'ACTIVE' },
            data: { status: 'COMPLETED' },
          });
          console.log(`[publish-content] Campaign ${campaignId} auto-completed.`);
        }
      }
    } catch (err) {
      console.error('[publish-content] autoCompleteCampaigns error:', err);
    }

    return NextResponse.json(summary);
  } catch (err) {
    console.error('[publish-content] Publisher error:', err);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
