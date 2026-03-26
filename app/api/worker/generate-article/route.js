import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyWorkerAuth } from '@/lib/worker-auth';
import { generateTextResponse, generateImage } from '@/lib/ai/gemini';
import { gatherImageContext, buildImagePrompt } from '@/lib/ai/image-context';
import { uploadBase64ToCloudinary } from '@/lib/cloudinary-upload';

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

// ─── Determine number of content images based on word count ──────────
function getContentImageCount(wordCount) {
  if (wordCount < 600) return 1;
  if (wordCount < 1200) return 2;
  return 3;
}

// ─── AI Article Generation ───────────────────────────────────────────
async function generateAiArticle(content, site) {
  const { campaign, keyword } = content;

  const settings = campaign?.contentSettings || {};
  const wordCountRange = settings.wordCounts || { min: 800, max: 1500 };
  const targetWordCount = Math.round((wordCountRange.min + wordCountRange.max) / 2);
  const includeFeaturedImage = settings.featuredImage !== false;
  const includeContentImages = settings.contentImages !== false;
  const contentImageCount = getContentImageCount(targetWordCount);

  const typeLabel = TYPE_LABELS[content.type] || 'Blog Post';
  const keywordText = keyword?.keyword || '';
  const customPrompt = campaign?.textPrompt || '';

  const siteUrl = (site.url || '').replace(/\/+$/, '');

  const systemPrompt = `You are an expert SEO content writer. Your job is to write a complete, publish-ready article in HTML format.

Rules:
1. Write approximately ${targetWordCount} words.
2. Format the output as clean HTML. Use <h2>, <h3>, <p>, <ul>/<ol>, <strong>, <em> as needed.
3. Do NOT include <html>, <head>, <body>, or <h1> tags — return the article body only.
4. The <h1> title will be set separately. Use ONLY <h2> tags for main section titles and <h3> for sub-sections. Never use <h1> inside the content.
5. Write naturally and engagingly. Avoid filler sentences.
6. The article type is "${typeLabel}" — match the tone and structure accordingly.
7. Include a compelling meta title (max 60 chars) and meta description (max 155 chars).
8. Include a short excerpt (1-2 sentences) summarizing the article.
9. The "slug" field MUST be a short, descriptive, SEO-friendly English slug — even if the article is written in another language. Use lowercase, hyphens, no special chars, max 5-6 words.
${keywordText ? `10. Target keyword: "${keywordText}". This is the main focus keyword. Work it naturally into the first <h2>, the first paragraph, and sprinkle throughout. Return it in the "focusKeyword" field.` : '10. Identify the most important keyword/phrase from the article and return it in "focusKeyword".'}
${includeFeaturedImage ? '11. Write a vivid, descriptive alt-text for the featured image in "featuredImageAlt". Describe what the ideal image should depict.' : ''}
${includeContentImages ? `12. Add exactly ${contentImageCount} inline image placeholders using <!-- IMAGE: detailed description of what this image should show --> format. Spread them evenly through the article. Each description should be specific and detailed (20-40 words).` : ''}
13. Generate Open Graph and Twitter Card metadata:
    - "ogTitle": compelling social share title (max 70 chars)
    - "ogDescription": engaging social description (max 200 chars) — make it shareable
    - "twitterTitle": same as ogTitle or slightly different for Twitter
    - "twitterDescription": same as ogDescription or slightly different for Twitter
${siteUrl ? `14. The canonical URL should be: "${siteUrl}/" followed by the slug. Return it in "canonicalUrl".` : ''}
${customPrompt ? `\nAdditional instructions from the user:\n${customPrompt}` : ''}

Reply ONLY with a JSON object (no markdown fences) containing exactly these fields:
{
  "title": "...",
  "html": "...",
  "metaTitle": "...",
  "metaDescription": "...",
  "excerpt": "...",
  "slug": "...",
  "focusKeyword": "...",
  "featuredImageAlt": "...",
  "ogTitle": "...",
  "ogDescription": "...",
  "twitterTitle": "...",
  "twitterDescription": "...",
  "canonicalUrl": "..."
}`;

  const userPrompt = `Write a ${typeLabel} titled: "${content.title}"${keywordText ? ` targeting the keyword "${keywordText}"` : ''}.`;

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

  const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.warn('[worker:generate-article] AI response was not valid JSON, using raw text.');
    parsed = {
      title: content.title,
      html: cleaned,
      metaTitle: content.title,
      metaDescription: '',
      excerpt: '',
      slug: '',
    };
  }

  // Ensure slug is always English and clean
  let slug = (parsed.slug || '').toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').substring(0, 60);
  if (!slug) {
    slug = (parsed.title || content.title).toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').substring(0, 60);
  }

  const canonicalUrl = parsed.canonicalUrl || (siteUrl ? `${siteUrl}/${slug}/` : '');

  const textOnly = (parsed.html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const wordCount = textOnly.split(' ').filter(Boolean).length;

  return {
    title: parsed.title || content.title,
    html: parsed.html || '',
    metaTitle: parsed.metaTitle || parsed.title || content.title,
    metaDescription: parsed.metaDescription || '',
    excerpt: parsed.excerpt || '',
    slug,
    featuredImageAlt: parsed.featuredImageAlt || '',
    focusKeyword: parsed.focusKeyword || keywordText || '',
    ogTitle: parsed.ogTitle || parsed.metaTitle || parsed.title || '',
    ogDescription: parsed.ogDescription || parsed.metaDescription || '',
    twitterTitle: parsed.twitterTitle || parsed.ogTitle || parsed.metaTitle || '',
    twitterDescription: parsed.twitterDescription || parsed.ogDescription || parsed.metaDescription || '',
    canonicalUrl,
    wordCount,
    _aiPrompt: systemPrompt + '\n---\n' + userPrompt,
    _rawResponse: raw,
  };
}

// ─── Generate featured image using Nano Banana Pro ───────────────────
async function generateFeaturedImage(result, site, imageContext, imagePromptOverride) {
  const prompt = buildImagePrompt({
    imageContext,
    keyword: result.focusKeyword,
    postTitle: result.title,
    postExcerpt: result.excerpt,
    userPrompt: imagePromptOverride,
    imageType: 'featured',
  });

  console.log('[worker:generate-article] Generating featured image...');
  const images = await generateImage({
    prompt,
    aspectRatio: '16:9',
    operation: 'GENERATE_IMAGE',
    metadata: { type: 'featured', siteId: site.id },
  });

  if (!images.length) return null;

  const publicId = `${result.slug}-featured-${Date.now()}`;
  const base64Data = `data:${images[0].mimeType};base64,${images[0].base64}`;
  const cdnUrl = await uploadBase64ToCloudinary(base64Data, 'ghostpost/posts', publicId);
  console.log('[worker:generate-article] Featured image uploaded:', cdnUrl);
  return cdnUrl;
}

// ─── Generate content images and replace placeholders ────────────────
async function generateContentImages(html, result, site, imageContext, imagePromptOverride) {
  const placeholderRegex = /<!--\s*IMAGE:\s*(.+?)\s*-->/g;
  const placeholders = [];
  let match;
  while ((match = placeholderRegex.exec(html)) !== null) {
    placeholders.push({ fullMatch: match[0], description: match[1].trim() });
  }

  if (placeholders.length === 0) return html;

  console.log(`[worker:generate-article] Generating ${placeholders.length} content images...`);

  let processedHtml = html;
  for (let i = 0; i < placeholders.length; i++) {
    const { fullMatch, description } = placeholders[i];
    try {
      // Get nearby content for better context
      const placeholderIndex = processedHtml.indexOf(fullMatch);
      const nearbyContent = processedHtml.substring(
        Math.max(0, placeholderIndex - 500),
        Math.min(processedHtml.length, placeholderIndex + 500)
      );

      const prompt = buildImagePrompt({
        imageContext,
        keyword: result.focusKeyword,
        postTitle: result.title,
        postExcerpt: result.excerpt,
        userPrompt: imagePromptOverride,
        imageType: 'content',
        imageDescription: description,
        nearbyContent,
      });

      const images = await generateImage({
        prompt,
        aspectRatio: '16:9',
        operation: 'GENERATE_IMAGE',
        metadata: { type: 'content', index: i, siteId: site.id },
      });

      if (images.length) {
        const publicId = `${result.slug}-content-${i + 1}-${Date.now()}`;
        const base64Data = `data:${images[0].mimeType};base64,${images[0].base64}`;
        const cdnUrl = await uploadBase64ToCloudinary(base64Data, 'ghostpost/posts', publicId);
        const imgTag = `<img src="${cdnUrl}" alt="${description.replace(/"/g, '&quot;')}" loading="lazy" />`;
        processedHtml = processedHtml.replace(fullMatch, imgTag);
        console.log(`[worker:generate-article] Content image ${i + 1} uploaded:`, cdnUrl);
      }
    } catch (imgErr) {
      console.warn(`[worker:generate-article] Content image ${i + 1} failed:`, imgErr.message);
      // Remove the placeholder if image generation fails
      processedHtml = processedHtml.replace(fullMatch, '');
    }
  }

  return processedHtml;
}

// ─── Log error to SystemLog ──────────────────────────────────────────
async function logError(contentId, siteId, accountId, message, stack, metadata) {
  try {
    await prisma.systemLog.create({
      data: {
        level: 'ERROR',
        source: 'worker:generate-article',
        contentId,
        siteId,
        accountId,
        message: (message || 'Unknown error').slice(0, 500),
        stack: (stack || '').slice(0, 5000),
        metadata,
      },
    });
  } catch (logErr) {
    console.error('[worker:generate-article] Failed to write SystemLog:', logErr);
  }
}

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 15 * 60 * 1000; // 15 minutes

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

  // ── Fetch the content record (with campaign + keyword + site for prompt building) ──
  let content;
  try {
    content = await prisma.content.findUnique({
      where: { id: contentId },
      include: {
        site: {
          select: {
            id: true,
            url: true,
            name: true,
            contentLanguage: true,
            businessName: true,
            businessCategory: true,
            businessAbout: true,
            writingStyle: true,
            crawledData: true,
            seoStrategy: true,
          },
        },
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
  } catch (err) {
    return NextResponse.json({ ok: false, error: 'DB read error' }, { status: 500 });
  }

  if (!content) {
    return NextResponse.json({ ok: false, error: 'Content not found' }, { status: 404 });
  }

  // Guard: only process if still PROCESSING (dispatcher already locked it)
  if (content.status !== 'PROCESSING') {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: `Status is ${content.status}, expected PROCESSING`,
    });
  }

  const attempt = content.processingAttempts + 1;
  const site = content.site;
  const settings = content.campaign?.contentSettings || {};
  const includeFeaturedImage = settings.featuredImage !== false;
  const includeContentImages = settings.contentImages !== false;

  try {
    // Increment attempt counter immediately
    await prisma.content.update({
      where: { id: contentId },
      data: { processingAttempts: attempt },
    });

    // ── Step 1: Generate article text ──────────────────────────────
    const result = await generateAiArticle(content, site);
    let finalHtml = result.html;
    let featuredImageUrl = null;

    // ── Step 2: Generate images (featured + content) ───────────────
    let imageContext = null;
    if (includeFeaturedImage || includeContentImages) {
      try {
        imageContext = await gatherImageContext(site);
      } catch (ctxErr) {
        console.warn('[worker:generate-article] Image context gathering failed:', ctxErr.message);
        imageContext = {
          businessName: site.businessName || site.name,
          businessCategory: site.businessCategory,
          language: site.contentLanguage || 'en',
        };
      }
    }

    // Generate featured image
    if (includeFeaturedImage && imageContext) {
      try {
        featuredImageUrl = await generateFeaturedImage(
          result, site, imageContext, content.campaign?.imagePrompt
        );
      } catch (imgErr) {
        console.warn('[worker:generate-article] Featured image generation failed:', imgErr.message);
      }
    }

    // Generate and insert content images
    if (includeContentImages && imageContext) {
      try {
        finalHtml = await generateContentImages(
          finalHtml, result, site, imageContext, content.campaign?.imagePrompt
        );
      } catch (imgErr) {
        console.warn('[worker:generate-article] Content image generation failed:', imgErr.message);
      }
    }

    // ── Step 3: Build aiResult with all metadata ───────────────────
    const aiResult = {
      title: result.title,
      html: finalHtml,
      metaTitle: result.metaTitle,
      metaDescription: result.metaDescription,
      excerpt: result.excerpt,
      slug: result.slug,
      featuredImageAlt: result.featuredImageAlt,
      featuredImage: featuredImageUrl,
      focusKeyword: result.focusKeyword,
      ogTitle: result.ogTitle,
      ogDescription: result.ogDescription,
      twitterTitle: result.twitterTitle,
      twitterDescription: result.twitterDescription,
      canonicalUrl: result.canonicalUrl,
      wordCount: result.wordCount,
    };

    // ── Step 4: Upsert ContentBody (heavy payload audit trail) ─────
    await prisma.contentBody.upsert({
      where: { contentId },
      create: {
        contentId,
        generatedHtml: finalHtml,
        aiPrompt: result._aiPrompt,
        rawAiResponse: result._rawResponse,
        featuredImageAlt: result.featuredImageAlt,
      },
      update: {
        generatedHtml: finalHtml,
        aiPrompt: result._aiPrompt,
        rawAiResponse: result._rawResponse,
        featuredImageAlt: result.featuredImageAlt,
      },
    });

    // ── Step 5: Update Content record with all fields so user can edit ──
    await prisma.content.update({
      where: { id: contentId },
      data: {
        status: 'READY_TO_PUBLISH',
        title: result.title,
        slug: result.slug,
        content: finalHtml,
        excerpt: result.excerpt,
        metaTitle: result.metaTitle,
        metaDescription: result.metaDescription,
        featuredImage: featuredImageUrl,
        wordCount: result.wordCount,
        aiResult,
        errorMessage: null,
      },
    });

    return NextResponse.json({ ok: true, contentId, status: 'READY_TO_PUBLISH' });
  } catch (err) {
    const errorMsg = err?.message || String(err);
    console.error(`[worker:generate-article] Failed ${contentId} (attempt ${attempt}):`, errorMsg);

    // Log full error to SystemLog (not in Content table)
    await logError(
      contentId,
      content.siteId,
      null,
      errorMsg,
      err?.stack,
      { attempt, campaignId: content.campaignId, type: content.type }
    );

    if (attempt >= MAX_ATTEMPTS) {
      // Max retries exhausted → FAILED (short message only in Content)
      await prisma.content.update({
        where: { id: contentId },
        data: {
          status: 'FAILED',
          errorMessage: `AI generation failed after ${attempt} attempts`,
        },
      });

      return NextResponse.json({ ok: false, contentId, status: 'FAILED', error: errorMsg });
    }

    // Retry later → back to SCHEDULED with a 15-minute delay
    const retryAt = new Date(Date.now() + RETRY_DELAY_MS);
    await prisma.content.update({
      where: { id: contentId },
      data: {
        status: 'SCHEDULED',
        scheduledAt: retryAt,
        errorMessage: `Attempt ${attempt} failed, retrying at ${retryAt.toISOString()}`,
      },
    });

    return NextResponse.json({ ok: false, contentId, status: 'RETRY', retryAt: retryAt.toISOString() });
  }
}
