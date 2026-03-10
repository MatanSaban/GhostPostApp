import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generateTextResponse } from '@/lib/ai/gemini';

const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 3;
const RETRY_DELAY_MS = 15 * 60 * 1000; // 15 minutes

// ─── Security ────────────────────────────────────────────────────────
function verifyAuth(request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // Development mode: allow all when no secret configured
  if (!cronSecret) return true;

  return authHeader === `Bearer ${cronSecret}`;
}

// ─── Content-type label map ──────────────────────────────────────────
const TYPE_LABELS = {
  BLOG_POST: 'Blog Post',
  SEO: 'SEO Article',
  GUIDE: 'Comprehensive Guide',
  HOW_TO: 'How-to Article',
  LISTICLE: 'Listicle',
  COMPARISON: 'Comparison Article',
  REVIEW: 'Review',
  NEWS: 'News Article',
  TUTORIAL: 'Tutorial',
  CASE_STUDY: 'Case Study',
  PAGE: 'Web Page',
  PRODUCT: 'Product Page',
  LANDING_PAGE: 'Landing Page',
};

// ─── AI Article Generation ───────────────────────────────────────────
/**
 * Generate a full article using Gemini AI.
 *
 * Uses campaign settings (textPrompt, contentSettings, keyword, type)
 * to build a detailed prompt and returns structured article data.
 *
 * @param {object} content  - Content record (with campaign + keyword includes)
 * @returns {Promise<object>} - { title, html, metaTitle, metaDescription, excerpt, slug, wordCount }
 */
async function generateAiArticle(content) {
  const { campaign, keyword } = content;

  // Extract campaign-level settings
  const settings = campaign?.contentSettings || {};
  const wordCountRange = settings.wordCounts || { min: 800, max: 1500 };
  const targetWordCount = Math.round((wordCountRange.min + wordCountRange.max) / 2);
  const includeFeaturedImage = settings.featuredImage !== false;
  const includeContentImages = settings.contentImages !== false;

  const typeLabel = TYPE_LABELS[content.type] || 'Blog Post';
  const keywordText = keyword?.keyword || '';
  const customPrompt = campaign?.textPrompt || '';

  // ── Build the system prompt ────────────────────────────────────
  const systemPrompt = `You are an expert SEO content writer. Your job is to write a complete, publish-ready article in HTML format.

Rules:
1. Write approximately ${targetWordCount} words.
2. Format the output as clean HTML. Use <h2>, <h3>, <p>, <ul>/<ol>, <strong>, <em> as needed.
3. Do NOT include <html>, <head>, <body>, or <h1> tags — return the article body only.
4. The <h1> title will be set separately. Start your HTML with the first <h2> or <p>.
5. Write naturally and engagingly. Avoid filler sentences.
6. The article type is "${typeLabel}" — match the tone and structure accordingly.
7. Include a compelling meta title (max 60 chars) and meta description (max 155 chars).
8. Include a short excerpt (1-2 sentences) summarizing the article.
9. Suggest a URL-friendly slug based on the title (lowercase, hyphens, no special chars).
${keywordText ? `10. Target keyword: "${keywordText}". Work it naturally into headings and the first paragraph.` : ''}
${includeFeaturedImage ? '11. Suggest an alt-text description for a featured image in the "featuredImageAlt" field.' : ''}
${includeContentImages ? '12. Where appropriate, add <!-- IMAGE: description --> placeholders for inline images.' : ''}
${customPrompt ? `\nAdditional instructions from the user:\n${customPrompt}` : ''}

Reply ONLY with a JSON object (no markdown fences) containing exactly these fields:
{
  "title": "...",
  "html": "...",
  "metaTitle": "...",
  "metaDescription": "...",
  "excerpt": "...",
  "slug": "...",
  "featuredImageAlt": "..."
}`;

  const userPrompt = `Write a ${typeLabel} titled: "${content.title}"${keywordText ? ` targeting the keyword "${keywordText}"` : ''}.`;

  // ── Call Gemini ────────────────────────────────────────────────
  const raw = await generateTextResponse({
    system: systemPrompt,
    prompt: userPrompt,
    maxTokens: 8192,
    temperature: 0.7,
    operation: 'FULL_ARTICLE',
    metadata: {
      contentId: content.id,
      campaignId: campaign?.id,
      type: content.type,
      keyword: keywordText,
    },
  });

  // Parse JSON from the AI response (strip markdown fences if present)
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Fallback: if the AI returned non-JSON, wrap the raw text as html
    console.warn('[process-content] AI response was not valid JSON, using raw text.');
    parsed = {
      title: content.title,
      html: cleaned,
      metaTitle: content.title,
      metaDescription: '',
      excerpt: '',
      slug: '',
    };
  }

  // Count words in the generated HTML (strip tags)
  const textOnly = (parsed.html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const wordCount = textOnly.split(' ').filter(Boolean).length;

  return {
    title: parsed.title || content.title,
    html: parsed.html || '',
    metaTitle: parsed.metaTitle || parsed.title || content.title,
    metaDescription: parsed.metaDescription || '',
    excerpt: parsed.excerpt || '',
    slug: parsed.slug || '',
    featuredImageAlt: parsed.featuredImageAlt || '',
    wordCount,
  };
}

// ─── Dispatcher: Fetch & Lock ────────────────────────────────────────
/**
 * Atomically find SCHEDULED content that is due and lock it for processing.
 * Uses a two-step fetch-then-lock pattern with a WHERE guard to prevent
 * race conditions between concurrent cron invocations.
 */
async function acquireBatch() {
  const now = new Date();

  // 1. Find candidates — from ACTIVE or COMPLETED campaigns (for retried content), or orphan content
  const candidates = await prisma.content.findMany({
    where: {
      status: 'SCHEDULED',
      scheduledAt: { lte: now },
      processingAttempts: { lt: MAX_ATTEMPTS },
      OR: [
        { campaign: { status: { in: ['ACTIVE', 'COMPLETED'] } } },
        { campaignId: null },
      ],
    },
    orderBy: { scheduledAt: 'asc' },
    take: BATCH_SIZE,
    select: { id: true },
  });

  if (candidates.length === 0) return [];

  const ids = candidates.map((c) => c.id);

  // 2. Atomic lock — only flip to PROCESSING if still SCHEDULED.
  //    If another worker already grabbed a record, the WHERE clause
  //    excludes it so we never double-process.
  await prisma.content.updateMany({
    where: {
      id: { in: ids },
      status: 'SCHEDULED', // guard against race condition
    },
    data: {
      status: 'PROCESSING',
      lastAttemptAt: now,
    },
  });

  // 3. Re-fetch the records we successfully locked (status = PROCESSING)
  const locked = await prisma.content.findMany({
    where: {
      id: { in: ids },
      status: 'PROCESSING',
    },
    include: {
      campaign: {
        select: {
          id: true,
          name: true,
          contentSettings: true,
          textPrompt: true,
          imagePrompt: true,
        },
      },
      keyword: {
        select: { id: true, keyword: true },
      },
    },
  });

  return locked;
}

// ─── Worker: Process a Single Content Record ─────────────────────────
async function processContent(content) {
  const attempt = content.processingAttempts + 1;

  try {
    // Increment attempt counter immediately
    await prisma.content.update({
      where: { id: content.id },
      data: { processingAttempts: attempt },
    });

    // Call the AI generation function
    const result = await generateAiArticle(content);

    // Success → READY_TO_PUBLISH
    await prisma.content.update({
      where: { id: content.id },
      data: {
        status: 'READY_TO_PUBLISH',
        aiResult: result,
        errorMessage: null,
      },
    });

    return { id: content.id, title: content.title, status: 'READY_TO_PUBLISH' };
  } catch (err) {
    const errorMsg = err?.message || String(err);
    console.error(`[process-content] Failed content ${content.id} (attempt ${attempt}):`, errorMsg);

    if (attempt >= MAX_ATTEMPTS) {
      // Max retries exhausted → FAILED
      await prisma.content.update({
        where: { id: content.id },
        data: {
          status: 'FAILED',
          errorMessage: errorMsg,
        },
      });

      return { id: content.id, title: content.title, status: 'FAILED', error: errorMsg };
    }

    // Retry later → back to SCHEDULED with a 15-minute delay
    const retryAt = new Date(Date.now() + RETRY_DELAY_MS);
    await prisma.content.update({
      where: { id: content.id },
      data: {
        status: 'SCHEDULED',
        scheduledAt: retryAt,
        errorMessage: errorMsg,
      },
    });

    return { id: content.id, title: content.title, status: 'RETRY', retryAt: retryAt.toISOString(), error: errorMsg };
  }
}

// ─── Auto-Complete Campaigns ─────────────────────────────────────────
/**
 * After processing a batch, check if any ACTIVE campaign is fully finished
 * (all Content records are PUBLISHED or FAILED — none left SCHEDULED/PROCESSING/READY_TO_PUBLISH).
 */
async function autoCompleteCampaigns(processedBatch) {
  const campaignIds = [...new Set(processedBatch.map(c => c.campaignId).filter(Boolean))];
  if (campaignIds.length === 0) return;

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
      console.log(`[process-content] Campaign ${campaignId} auto-completed.`);
    }
  }
}

// ─── API Route Handler ───────────────────────────────────────────────
export async function GET(request) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  try {
    const batch = await acquireBatch();

    if (batch.length === 0) {
      return NextResponse.json({ ok: true, message: 'No content to process', processed: [] });
    }

    // Process all locked records sequentially to stay within serverless limits
    const results = [];
    for (const content of batch) {
      const result = await processContent(content);
      results.push(result);
    }

    const summary = {
      ok: true,
      processed: results.length,
      readyToPublish: results.filter((r) => r.status === 'READY_TO_PUBLISH').length,
      retried: results.filter((r) => r.status === 'RETRY').length,
      failed: results.filter((r) => r.status === 'FAILED').length,
      details: results,
    };

    console.log('[process-content] Batch complete:', JSON.stringify(summary));

    // ── Auto-complete campaigns whose content is all done ────────
    try {
      await autoCompleteCampaigns(batch);
    } catch (err) {
      console.error('[process-content] autoCompleteCampaigns error:', err);
    }

    return NextResponse.json(summary);
  } catch (err) {
    console.error('[process-content] Dispatcher error:', err);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
