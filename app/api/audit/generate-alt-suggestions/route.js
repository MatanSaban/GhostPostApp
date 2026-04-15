import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';

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

/**
 * Fetch an image URL and return a base64-encoded data object for Gemini vision.
 * Returns null if the image can't be fetched or is too large (>4MB).
 */
async function fetchImageForVision(imageUrl) {
  try {
    const res = await fetch(imageUrl, {
      signal: AbortSignal.timeout(15000),
      headers: { 'Accept': 'image/*' },
    });
    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await res.arrayBuffer());

    // Skip huge images (Gemini limit)
    if (buffer.length > 4 * 1024 * 1024) return null;

    return { type: 'image', image: buffer, mimeType: contentType };
  } catch {
    return null;
  }
}

const altTextSchema = z.object({
  altText: z
    .string()
    .min(5)
    .max(200)
    .describe('Descriptive, SEO-friendly alt text for the image'),
});

/**
 * POST: Generate AI alt-text suggestions for images without alt attributes
 *
 * Body: { auditId, siteId, locale? }
 *
 * Cost: FREE (preview only - credits charged on apply)
 * Returns: { suggestions: [{ pageUrl, imageUrl, fileName, altText, reason }] }
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

    // Find issues with images missing alt text
    const altIssues = (audit.issues || []).filter(
      (i) => i.message === 'audit.issues.imagesNoAlt'
    );

    if (altIssues.length === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    // Collect all images across all affected pages
    // Each issue has detailedSources: [{ url, fileName }]
    const allImages = [];
    for (const issue of altIssues) {
      const sources = issue.detailedSources || [];
      for (const src of sources) {
        if (!src.url) continue;
        // Skip data URIs, empty, or SVG placeholder images
        if (src.url.startsWith('data:') || src.url.length < 10) continue;
        allImages.push({
          pageUrl: issue.url,
          imageUrl: src.url,
          fileName: src.fileName || '',
        });
      }
    }

    // Deduplicate by imageUrl (same image can appear on multiple pages)
    const seen = new Set();
    const uniqueImages = allImages.filter((img) => {
      if (seen.has(img.imageUrl)) return false;
      seen.add(img.imageUrl);
      return true;
    });

    // Limit to 20 images per request (vision API is expensive)
    const imagesToProcess = uniqueImages.slice(0, 20);

    if (imagesToProcess.length === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    // Detect website language from page titles in audit data
    const pageResults = audit.pageResults || [];
    const sampleTitles = pageResults
      .map((p) => p.title)
      .filter(Boolean)
      .slice(0, 5)
      .join(', ');
    const langHint = sampleTitles
      ? `The website's page titles are: "${sampleTitles}". Detect the language from these titles and write the alt text in the SAME language.`
      : `Detect the language from the website name "${site.name || site.url}" and write the alt text in that language.`;

    // Process images in parallel batches of 5
    const BATCH_SIZE = 5;
    const suggestions = [];

    for (let i = 0; i < imagesToProcess.length; i += BATCH_SIZE) {
      const batch = imagesToProcess.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.allSettled(
        batch.map(async (img) => {
          const imageData = await fetchImageForVision(img.imageUrl);
          if (!imageData) {
            return { ...img, altText: '', reason: 'Could not fetch image', skipped: true };
          }

          try {
            const result = await generateObject({
              model: google('gemini-3.1-pro-preview'),
              schema: altTextSchema,
              messages: [
                {
                  role: 'user',
                  content: [
                    imageData,
                    {
                      type: 'text',
                      text: `You are an SEO and accessibility expert. Look at this image from the website "${site.name || site.url}" and generate a descriptive, SEO-friendly alt text.

${langHint}

First, determine the TYPE of this visual element:
1. **Logo** - a brand/company logo or wordmark → describe it as "[Brand name] logo" (e.g. "Ghost Post logo", "לוגו גוסט פוסט")
2. **Icon** - a small UI icon, symbol, or pictogram → describe its meaning/action briefly (e.g. "Search icon", "אייקון חיפוש")
3. **Image** - a photo, illustration, graphic, or banner → describe the actual content in detail

Rules:
- Write alt text ONLY in the website's detected language (never mix languages)
- For logos: "[brand/company name] logo" format (5-30 chars)
- For icons: describe the function/meaning, not appearance (5-30 chars)
- For images: describe what is visible concisely (10-125 chars)
- Be specific: mention objects, people, actions, colors when relevant
- Don't start with "Image of", "Picture of", "Photo of" - just describe the content
- If the image contains meaningful text, include it in the alt text
- The filename is: "${img.fileName}" (use as a context hint only, not as the alt text)

Generate the alt text.`,
                    },
                  ],
                },
              ],
              temperature: 0.3,
            });

            return {
              ...img,
              altText: result.object.altText,
              reason: '',
            };
          } catch (err) {
            console.warn('[GenAltSuggestions] Vision failed for', img.imageUrl, err.message);
            return { ...img, altText: '', reason: err.message, skipped: true };
          }
        })
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value && !result.value.skipped) {
          suggestions.push(result.value);
        }
      }
    }

    return NextResponse.json({
      suggestions,
      totalImages: uniqueImages.length,
      processedImages: imagesToProcess.length,
      creditCostPerImage: 1,
    });
  } catch (error) {
    console.error('[API/audit/generate-alt-suggestions] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
