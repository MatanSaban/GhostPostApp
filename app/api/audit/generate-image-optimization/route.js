import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { generateObject } from 'ai';
import { googleGlobal } from '@/lib/ai/vertex-provider.js';
import { GEMINI_MODEL } from '@/lib/ai/models.js';
import { z } from 'zod';
import { deductAiCredits } from '@/lib/account-utils';

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
        isSuperAdmin: true,
        accountMemberships: {
          select: { accountId: true },
        },
      },
    });
  } catch {
    return null;
  }
}

const imageOptimizationSchema = z.object({
  recommendations: z.array(
    z.object({
      imageUrl: z.string().describe('The full URL of the image'),
      currentFormat: z.string().describe('Current format: jpeg, png, gif, etc'),
      recommendedFormat: z
        .enum(['webp', 'avif', 'keep'])
        .describe('Recommended target format or "keep" to leave as-is'),
      reason: z
        .string()
        .max(200)
        .describe('Brief explanation of why this format was chosen'),
    })
  ),
});

/**
 * POST: Generate AI image format optimization suggestions
 *
 * Body: { auditId, siteId, locale? }
 *
 * Analyzes images from audit that use old formats (JPEG, PNG, GIF)
 * and recommends the best target format (WebP or AVIF) based on
 * professional SEO guidelines.
 *
 * Cost: FREE (preview only - credits charged on apply)
 * Returns: { suggestions: [{ imageUrl, fileName, pageUrl, currentFormat, recommendedFormat, reason, sizeKB? }] }
 */
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { auditId, siteId, locale } = await request.json();
    const reasonLang = locale === 'he' ? 'Hebrew' : 'English';

    if (!auditId || !siteId) {
      return NextResponse.json(
        { error: 'auditId and siteId are required' },
        { status: 400 }
      );
    }

    // Verify site access
    const accountIds = user.accountMemberships.map((m) => m.accountId);
    const site = await prisma.site.findFirst({
      where: user.isSuperAdmin ? { id: siteId } : { id: siteId, accountId: { in: accountIds } },
      select: { id: true, url: true, name: true, accountId: true },
    });
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Get the audit
    const audit = await prisma.siteAudit.findFirst({
      where: { id: auditId, siteId },
    });
    if (!audit) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    }

    // Collect images from both format and size issues
    const relevantIssueKeys = new Set([
      'audit.issues.imagesNotNextGen',
      'audit.issues.imagesTooLarge',
      'audit.issues.imagesLargeWarning',
    ]);

    const issues = (audit.issues || []).filter((i) =>
      relevantIssueKeys.has(i.message)
    );

    if (issues.length === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    // Collect all images across all affected pages
    const allImages = [];
    for (const issue of issues) {
      const sources = issue.detailedSources || [];
      for (const src of sources) {
        if (!src.url) continue;
        if (src.url.startsWith('data:') || src.url.length < 10) continue;
        allImages.push({
          pageUrl: issue.url,
          imageUrl: src.url,
          fileName: src.fileName || src.url.split('/').pop()?.split('?')[0] || '',
          sizeKB: src.size || null,
          issueType: issue.message,
        });
      }
    }

    // Deduplicate by imageUrl
    const seen = new Set();
    const uniqueImages = allImages.filter((img) => {
      if (seen.has(img.imageUrl)) return false;
      seen.add(img.imageUrl);
      return true;
    });

    // Limit to 30 images per request
    const imagesToProcess = uniqueImages.slice(0, 30);

    if (imagesToProcess.length === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    // Build the image list for the AI prompt
    const imageList = imagesToProcess
      .map((img, i) => {
        const ext = img.fileName.split('.').pop()?.toLowerCase() || 'unknown';
        const size = img.sizeKB ? ` (${img.sizeKB})` : '';
        return `${i + 1}. URL: ${img.imageUrl}\n   Format: ${ext}${size}\n   Filename: ${img.fileName}`;
      })
      .join('\n');

    // Use AI to recommend optimal format per image
    const result = await generateObject({
      model: googleGlobal(GEMINI_MODEL),
      schema: imageOptimizationSchema,
      messages: [
        {
          role: 'user',
          content: `You are an SEO and web performance expert. Analyze these images from the website "${site.name || site.url}" and recommend the optimal image format for each one.

## Format Selection Rules (from professional SEO guidelines):

### Use AVIF for:
- Hero/LCP images (above the fold), large photography/ecommerce product images
- Images where maximum compression matters most
- Note: AVIF has CPU-intensive encoding, best for key images only

### Use WebP for (default ~90% of cases):
- All general website images (articles, products, backgrounds, thumbnails)
- Bulk conversions where speed matters
- PNG images with transparency (WebP supports transparency too)
- Default choice when unsure

### Keep original format when:
- OG images (og:image) - social platforms prefer JPEG
- Very small images under 15KB - savings negligible
- Already in WebP or AVIF format
- SVG files (already optimal)

### Special PNG rules:
- Logos, icons with sharp edges, and text overlays → keep PNG
- Screenshots and diagrams → keep PNG
- BUT if PNG is over 100KB → recommend WebP Lossless

## Images to analyze:
${imageList}

## Instructions:
- For each image, determine the recommended format based on the rules above
- Infer the image type from the filename and URL context (e.g., "logo" → keep, "hero" → avif, "blog-thumbnail" → webp)
- Write the reason in ${reasonLang}
- If an image is already in a next-gen format (webp, avif), recommend "keep"
- Be practical: when in doubt, recommend "webp" as the safe default`,
        },
      ],
      temperature: 0.2,
    });

    // Map AI recommendations back to our image data
    const recommendations = result.object.recommendations || [];
    const recMap = new Map();
    for (const rec of recommendations) {
      recMap.set(rec.imageUrl, rec);
    }

    const suggestions = imagesToProcess.map((img) => {
      const rec = recMap.get(img.imageUrl);
      return {
        imageUrl: img.imageUrl,
        fileName: img.fileName,
        pageUrl: img.pageUrl,
        sizeKB: img.sizeKB,
        currentFormat:
          rec?.currentFormat ||
          img.fileName.split('.').pop()?.toLowerCase() ||
          'unknown',
        recommendedFormat: rec?.recommendedFormat || 'webp',
        reason: rec?.reason || '',
      };
    });

    // Filter out "keep" recommendations since those don't need conversion
    const actionableSuggestions = suggestions.filter(
      (s) => s.recommendedFormat !== 'keep'
    );

    const usage = result.usage || {};
    const deduction = await deductAiCredits(site.accountId, 1, {
      userId: user.id,
      siteId,
      source: 'ai_image_optimization',
      description: `AI Image Format Suggestions: ${imagesToProcess.length} image(s)`,
      metadata: {
        model: GEMINI_MODEL,
        inputTokens: usage.inputTokens || 0,
        outputTokens: usage.outputTokens || 0,
        totalTokens: usage.totalTokens || 0,
      },
    });
    if (!deduction.success) {
      const isInsufficient = deduction.error?.includes('Insufficient');
      return NextResponse.json(
        { error: deduction.error || 'Credit deduction failed', code: isInsufficient ? 'INSUFFICIENT_CREDITS' : 'CREDIT_ERROR', resourceKey: isInsufficient ? 'aiCredits' : undefined },
        { status: 402 }
      );
    }

    return NextResponse.json({
      suggestions: actionableSuggestions,
      keptImages: suggestions.filter((s) => s.recommendedFormat === 'keep'),
      totalImages: uniqueImages.length,
      processedImages: imagesToProcess.length,
    });
  } catch (error) {
    console.error('[API/audit/generate-image-optimization] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
