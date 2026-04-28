/**
 * Image Alt Text Fix Handler
 *
 * Issue handled: imagesNoAlt
 *
 * Preview phase:
 *   - Walks the audit's `imagesNoAlt` issues, collects every image (deduped),
 *     fetches each, and runs Gemini vision to generate descriptive alt text.
 *   - Detects logos / icons / images and writes type-appropriate alt copy.
 *
 * WP-auto apply:
 *   - Resolves each imageUrl → WP attachment ID via media-library search,
 *     then calls updateMedia(site, id, { alt }) for each.
 *
 * Manual:
 *   - Returns one `value` ManualOutput per image, with the imageUrl
 *     embedded in the instructions so the user can find the file in
 *     their CMS / media library.
 */

import { z } from 'zod';
import { generateObject } from 'ai';
import { googleGlobal } from '@/lib/ai/vertex-provider.js';
import { GEMINI_MODEL } from '@/lib/ai/models.js';
import { updateMedia } from '@/lib/wp-api-client';
import { value as valueOutput } from '@/lib/audit/fix-manual-output';
import { BOT_FETCH_HEADERS } from '@/lib/bot-identity';
import prisma from '@/lib/prisma';
import {
  resolveAttachmentIds, updateAuditWithRetry, brandName,
} from './_shared';

const MAX_IMAGES_PER_REQUEST = 20;
const VISION_BATCH_SIZE = 5;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const altTextSchema = z.object({
  altText: z.string().min(3).max(200),
});

async function fetchImageForVision(imageUrl) {
  try {
    const res = await fetch(imageUrl, {
      signal: AbortSignal.timeout(15000),
      headers: { ...BOT_FETCH_HEADERS, 'Accept': 'image/*' },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > MAX_IMAGE_BYTES) return null;
    return { type: 'image', image: buffer, mimeType: contentType };
  } catch {
    return null;
  }
}

export async function preview({ site, payload = {}, wpAuto }) {
  const { auditId } = payload;
  const audit = auditId ? await prisma.siteAudit.findUnique({
    where: { id: auditId },
    select: { issues: true, pageResults: true },
  }) : null;

  const altIssues = (audit?.issues || []).filter((i) => i.message === 'audit.issues.imagesNoAlt');
  if (altIssues.length === 0) {
    return wpAuto ? { suggestions: [], usage: null } : { manualOutputs: [], usage: null };
  }

  const allImages = [];
  for (const issue of altIssues) {
    for (const src of (issue.detailedSources || [])) {
      if (!src.url || src.url.startsWith('data:') || src.url.length < 10) continue;
      allImages.push({
        pageUrl: issue.url,
        imageUrl: src.url,
        fileName: src.fileName || '',
      });
    }
  }
  // Dedupe by imageUrl
  const seen = new Set();
  const uniqueImages = allImages.filter((img) => {
    if (seen.has(img.imageUrl)) return false;
    seen.add(img.imageUrl);
    return true;
  });
  const imagesToProcess = uniqueImages.slice(0, MAX_IMAGES_PER_REQUEST);

  if (imagesToProcess.length === 0) {
    return wpAuto ? { suggestions: [], usage: null } : { manualOutputs: [], usage: null };
  }

  // Detect site language hint from page titles.
  const sampleTitles = (audit?.pageResults || []).map((p) => p.title)
    .filter(Boolean).slice(0, 5).join(', ');
  const langHint = sampleTitles
    ? `The website's page titles are: "${sampleTitles}". Detect the language from these titles and write the alt text in the SAME language.`
    : `Detect the language from the website name "${brandName(site)}" and write the alt text in that language.`;

  const totalUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  const suggestions = [];

  for (let i = 0; i < imagesToProcess.length; i += VISION_BATCH_SIZE) {
    const batch = imagesToProcess.slice(i, i + VISION_BATCH_SIZE);
    const batchResults = await Promise.allSettled(batch.map(async (img) => {
      const imageData = await fetchImageForVision(img.imageUrl);
      if (!imageData) return { ...img, skipped: true, reason: 'Could not fetch image' };

      const result = await generateObject({
        model: googleGlobal(GEMINI_MODEL),
        schema: altTextSchema,
        messages: [{
          role: 'user',
          content: [
            imageData,
            { type: 'text', text: `You are an SEO and accessibility expert. Look at this image from "${brandName(site)}" and generate descriptive alt text.

${langHint}

Determine the TYPE of visual element:
1. Logo - brand/company logo or wordmark → "[Brand name] logo"
2. Icon - small UI icon, symbol, pictogram → describe meaning/action briefly
3. Image - photo, illustration, graphic, banner → describe content in detail

Rules:
- Write alt text ONLY in the website's detected language (never mix languages)
- Logos: "[brand/company name] logo" format (5-30 chars)
- Icons: describe the function/meaning, not appearance (5-30 chars)
- Images: describe what is visible concisely (10-125 chars)
- Be specific: mention objects, people, actions, colors when relevant
- Don't start with "Image of", "Picture of", "Photo of"
- If the image contains meaningful text, include it in the alt text
- The filename "${img.fileName}" is a context hint only, not the alt text`,
            },
          ],
        }],
        temperature: 0.3,
      });

      const usage = result.usage || {};
      totalUsage.inputTokens += usage.inputTokens || 0;
      totalUsage.outputTokens += usage.outputTokens || 0;
      totalUsage.totalTokens += usage.totalTokens || 0;

      return { ...img, altText: result.object.altText };
    }));

    for (const r of batchResults) {
      if (r.status === 'fulfilled' && r.value && !r.value.skipped) {
        suggestions.push(r.value);
      }
    }
  }

  if (wpAuto) return { suggestions, usage: totalUsage };

  const manualOutputs = suggestions.map((s) => valueOutput({
    title: `Alt text for ${s.fileName || 'image'}`,
    why: 'Improves accessibility and image SEO. Screen readers will announce this; search engines use it to understand the image.',
    instructions: `Add this as the **alt** attribute on the image at [${s.imageUrl}](${s.imageUrl}). In WordPress media library: open the image → "Alternative text". In raw HTML: \`<img src="..." alt="<the value>" />\`.`,
    value: s.altText,
    field: 'Image alt text',
    charLimit: 125,
  }));

  return { manualOutputs, usage: totalUsage };
}

export async function apply({ site, payload = {}, audit }) {
  const fixes = Array.isArray(payload.fixes) ? payload.fixes : [];
  if (fixes.length === 0) return { results: [], auditUpdated: false };

  // Resolve all image URLs in one batch.
  const imageUrls = fixes.map((f) => f.imageUrl).filter(Boolean);
  const resolveResults = await resolveAttachmentIds(site, imageUrls);

  const results = [];
  for (const fix of fixes) {
    const { imageUrl, altText } = fix;
    if (!imageUrl || !altText) {
      results.push({ imageUrl, altText, pushed: false, pushError: 'missing imageUrl or altText' });
      continue;
    }
    const resolved = resolveResults[imageUrl];
    if (!resolved?.found || !resolved?.attachmentId) {
      results.push({ imageUrl, altText, pushed: false,
        pushError: 'Image not found in WordPress media library (may be an external image)' });
      continue;
    }
    try {
      await updateMedia(site, resolved.attachmentId, { alt: altText });
      results.push({ imageUrl, altText, pushed: true });
    } catch (e) {
      results.push({ imageUrl, altText, pushed: false, pushError: e.message });
    }
  }

  const successful = results.filter((r) => r.pushed);
  const auditUpdated = (audit?.id && successful.length > 0)
    ? await applyAltAuditUpdate(audit.id, successful, site.id)
    : false;

  return { results, auditUpdated };
}

async function applyAltAuditUpdate(auditId, successful, siteId) {
  const fixedImageUrls = new Set(successful.map((f) => f.imageUrl));
  return updateAuditWithRetry(auditId, (audit) => {
    const updatedIssues = (audit.issues || []).map((issue) => {
      if (issue.message !== 'audit.issues.imagesNoAlt') return issue;
      const remaining = (issue.detailedSources || []).filter((src) => !fixedImageUrls.has(src.url));
      if (remaining.length === 0) {
        return { ...issue, severity: 'passed', message: 'audit.issues.allImagesHaveAlt',
                 suggestion: null, details: 'Alt text set via AI fix', detailedSources: [] };
      }
      const totalMatch = issue.details?.match(/\d+\/(\d+)/);
      const totalImages = totalMatch ? parseInt(totalMatch[1]) : remaining.length;
      return { ...issue, details: `${remaining.length}/${totalImages}`, detailedSources: remaining };
    });
    return { issues: updatedIssues };
  }, { invalidateSiteId: siteId, fields: ['issues'] });
}
