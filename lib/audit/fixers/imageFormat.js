/**
 * Image Format Fix Handler
 *
 * Issues handled: imagesNotNextGen | imagesTooLarge | imagesLargeWarning |
 *                 imagesNoDimensions
 *
 * For format/size issues:
 *   Preview: AI recommends a target format (webp/avif/keep) per image,
 *            applying professional SEO rules (use AVIF for hero/LCP, WebP
 *            for general use, keep for OG/<15KB/SVG, etc.).
 *   WP-auto apply: calls the plugin's /media/convert-image-format endpoint
 *            (falls back to legacy /media/convert-to-webp for v<1.11.0).
 *   Manual:  returns `instructions` ManualOutput with practical steps
 *            (since the user can't convert formats without tooling).
 *
 * For imagesNoDimensions:
 *   Preview/manual returns a `snippet` ManualOutput showing how to add
 *   width/height attributes — there's no AI-side fix for this in WP land
 *   (it's a theme template change), so the manual path is what matters.
 */

import { z } from 'zod';
import { generateObject } from 'ai';
import { googleGlobal } from '@/lib/ai/vertex-provider.js';
import { GEMINI_MODEL } from '@/lib/ai/models.js';
import { makePluginRequest } from '@/lib/wp-api-client';
import { instructions as instructionsOutput, snippet as snippetOutput } from '@/lib/audit/fix-manual-output';
import prisma from '@/lib/prisma';
import {
  resolveAttachmentIds, updateAuditWithRetry, localeName,
} from './_shared';

const FORMAT_ISSUE_KEYS = new Set([
  'audit.issues.imagesNotNextGen',
  'audit.issues.imagesTooLarge',
  'audit.issues.imagesLargeWarning',
]);
const NO_DIMENSIONS_KEY = 'audit.issues.imagesNoDimensions';

const MAX_IMAGES_PER_REQUEST = 30;

const recommendationsSchema = z.object({
  recommendations: z.array(z.object({
    imageUrl: z.string(),
    currentFormat: z.string(),
    recommendedFormat: z.enum(['webp', 'avif', 'keep']),
    reason: z.string().max(200),
  })),
});

export async function preview({ site, payload = {}, wpAuto }) {
  const { auditId, issueType, locale } = payload;
  const audit = auditId ? await prisma.siteAudit.findUnique({
    where: { id: auditId },
    select: { issues: true },
  }) : null;

  // Special-case: noDimensions has no AI step — return a single instructions/snippet output.
  if (issueType === NO_DIMENSIONS_KEY) {
    return previewNoDimensions(wpAuto);
  }

  const issues = (audit?.issues || []).filter((i) => FORMAT_ISSUE_KEYS.has(i.message));
  if (issues.length === 0) {
    return wpAuto ? { suggestions: [], usage: null } : { manualOutputs: [], usage: null };
  }

  const allImages = [];
  for (const issue of issues) {
    for (const src of (issue.detailedSources || [])) {
      if (!src.url || src.url.startsWith('data:') || src.url.length < 10) continue;
      allImages.push({
        pageUrl: issue.url,
        imageUrl: src.url,
        fileName: src.fileName || src.url.split('/').pop()?.split('?')[0] || '',
        sizeKB: src.size || null,
        issueType: issue.message,
      });
    }
  }
  // Dedupe.
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

  const reasonLang = localeName(locale);
  const imageList = imagesToProcess.map((img, i) => {
    const ext = img.fileName.split('.').pop()?.toLowerCase() || 'unknown';
    const size = img.sizeKB ? ` (${img.sizeKB})` : '';
    return `${i + 1}. URL: ${img.imageUrl}\n   Format: ${ext}${size}\n   Filename: ${img.fileName}`;
  }).join('\n');

  const result = await generateObject({
    model: googleGlobal(GEMINI_MODEL),
    schema: recommendationsSchema,
    messages: [{
      role: 'user',
      content: `You are an SEO and web performance expert. Recommend the optimal image format for each image from "${site.name || site.url}".

## Format Selection Rules:

### Use AVIF for:
- Hero/LCP images (above the fold), large photography/ecommerce product images
- Images where maximum compression matters most

### Use WebP for (default ~90% of cases):
- All general website images (articles, products, backgrounds, thumbnails)
- PNG images with transparency (WebP supports transparency too)

### Keep original format when:
- OG images (og:image) — social platforms prefer JPEG
- Very small images under 15KB
- Already in WebP or AVIF
- SVG files (already optimal)

### PNG rules:
- Logos, icons with sharp edges, text overlays → keep PNG
- Screenshots/diagrams → keep PNG
- BUT if PNG over 100KB → recommend WebP

## Images:
${imageList}

For each image:
- Infer type from filename/URL context (e.g. "logo" → keep, "hero" → avif, "blog-thumbnail" → webp)
- Write the reason in ${reasonLang}
- If already in next-gen, recommend "keep"
- When unsure, recommend "webp" as the safe default`,
    }],
    temperature: 0.2,
  });

  const recs = result.object?.recommendations || [];
  const recMap = new Map(recs.map((r) => [r.imageUrl, r]));

  const suggestions = imagesToProcess.map((img) => {
    const rec = recMap.get(img.imageUrl);
    return {
      imageUrl: img.imageUrl,
      fileName: img.fileName,
      pageUrl: img.pageUrl,
      sizeKB: img.sizeKB,
      currentFormat: rec?.currentFormat || img.fileName.split('.').pop()?.toLowerCase() || 'unknown',
      recommendedFormat: rec?.recommendedFormat || 'webp',
      reason: rec?.reason || '',
    };
  });

  const actionable = suggestions.filter((s) => s.recommendedFormat !== 'keep');
  const usage = result.usage || null;

  if (wpAuto) {
    return {
      suggestions: actionable,
      keptImages: suggestions.filter((s) => s.recommendedFormat === 'keep'),
      usage,
    };
  }

  // Non-WP path: instructions on how to convert.
  const grouped = groupBy(actionable, (s) => s.recommendedFormat);
  const manualOutputs = Object.entries(grouped).map(([format, items]) => instructionsOutput({
    title: `Convert ${items.length} image${items.length === 1 ? '' : 's'} to ${format.toUpperCase()}`,
    why: items[0]?.reason || `${format.toUpperCase()} compresses ${items.length === 1 ? 'this image' : 'these images'} significantly without visible quality loss.`,
    instructions: [
      `Convert each of the following images to **${format.toUpperCase()}** and replace them on your site:`,
      '',
      ...items.map((it) => `- [${it.fileName || it.imageUrl}](${it.imageUrl})${it.sizeKB ? ` — ${it.sizeKB}` : ''}`),
      '',
      `**Tools:** [Squoosh.app](https://squoosh.app) (free, browser-based), \`cwebp\`/\`avifenc\` CLI, or your image-optimization plugin.`,
      '',
      `After converting, **upload the new file** to your CMS, **update the references** in posts/templates, and **delete the old file** to reclaim space.`,
    ].join('\n'),
  }));

  return { manualOutputs, usage };
}

function previewNoDimensions(wpAuto) {
  // No AI needed for this issue.
  if (wpAuto) return { suggestions: [], usage: null };
  return {
    manualOutputs: [snippetOutput({
      title: 'Add explicit width and height to images',
      why: 'Browsers can reserve layout space before images load — eliminates Cumulative Layout Shift (CLS) and improves Core Web Vitals.',
      instructions: 'Add `width` and `height` attributes (in **pixels**, no units) to every `<img>` tag. The CSS can still resize them. In WordPress, modern themes do this automatically; if yours doesn\'t, the snippet below shows the pattern.',
      language: 'html',
      code: '<img src="/path/to/image.jpg" width="1200" height="800" alt="..." />',
      where: 'in your theme templates / page HTML',
    })],
    usage: null,
  };
}

function groupBy(arr, keyFn) {
  return arr.reduce((acc, item) => {
    const k = keyFn(item);
    (acc[k] ||= []).push(item);
    return acc;
  }, {});
}

export async function apply({ site, payload = {}, audit }) {
  const fixes = Array.isArray(payload.fixes) ? payload.fixes : [];
  if (fixes.length === 0) return { results: [], auditUpdated: false };

  // Resolve all image URLs to attachment IDs.
  const imageUrls = fixes.map((f) => f.imageUrl);
  const resolveResults = await resolveAttachmentIds(site, imageUrls);

  const conversions = [];
  for (const fix of fixes) {
    const r = resolveResults[fix.imageUrl];
    if (r?.found && r?.attachmentId) {
      conversions.push({ id: r.attachmentId, format: fix.recommendedFormat });
    }
  }

  let pluginResults = [];
  if (conversions.length > 0) {
    try {
      const r = await makePluginRequest(site, '/media/convert-image-format', 'POST', {
        conversions, keep_backups: true, flush_cache: true, replace_urls: true,
      });
      pluginResults = r.results || [];
    } catch (e) {
      // Legacy fallback for plugins < 1.11.0 (only WebP supported).
      if (!e.message?.includes('404')) throw e;
      const webpIds = conversions.filter((c) => c.format === 'webp').map((c) => c.id);
      const avifIds = conversions.filter((c) => c.format === 'avif').map((c) => c.id);
      if (webpIds.length > 0) {
        const legacy = await makePluginRequest(site, '/media/convert-to-webp', 'POST', {
          ids: webpIds, keep_backups: true,
        });
        for (const id of webpIds) {
          const failed = (legacy.errors || []).find((er) => er.id === id);
          pluginResults.push({ id, format: 'webp', success: !failed, error: failed?.error || null });
        }
      }
      for (const id of avifIds) {
        pluginResults.push({ id, format: 'avif', success: false,
          error: 'AVIF conversion requires plugin update to v1.11.0+' });
      }
    }
  }

  const results = fixes.map((fix) => {
    const r = resolveResults[fix.imageUrl];
    if (!r?.found) {
      return { imageUrl: fix.imageUrl, format: fix.recommendedFormat, pushed: false,
               pushError: 'Image not found in WordPress media library' };
    }
    const pr = pluginResults.find((p) => p.id === r.attachmentId);
    return { imageUrl: fix.imageUrl, format: fix.recommendedFormat,
             pushed: pr?.success ?? false, pushError: pr?.error || null };
  });

  const successful = results.filter((r) => r.pushed);
  const auditUpdated = (audit?.id && successful.length > 0)
    ? await applyImageFormatAuditUpdate(audit.id, successful, site.id)
    : false;

  return { results, auditUpdated };
}

async function applyImageFormatAuditUpdate(auditId, successful, siteId) {
  const fixedImageUrls = new Set(successful.map((f) => f.imageUrl));
  const stripWpSize = (u) => u.replace(/-\d+x\d+(?=\.[a-z]+$)/i, '');
  const fixedBaseUrls = new Set(successful.map((f) => stripWpSize(f.imageUrl)));
  const isFixed = (srcUrl) => fixedImageUrls.has(srcUrl) || fixedBaseUrls.has(stripWpSize(srcUrl));

  return updateAuditWithRetry(auditId, (audit) => {
    const updatedIssues = (audit.issues || []).map((issue) => {
      if (!FORMAT_ISSUE_KEYS.has(issue.message)) return issue;
      const remaining = (issue.detailedSources || []).filter((src) => !isFixed(src.url));
      if (remaining.length === 0) {
        return {
          ...issue, severity: 'passed', suggestion: null, detailedSources: [],
          message: issue.message === 'audit.issues.imagesNotNextGen'
            ? 'audit.issues.imagesNextGenGood'
            : 'audit.issues.imagesSizeGood',
        };
      }
      return {
        ...issue,
        details: issue.message === 'audit.issues.imagesNotNextGen'
          ? `${remaining.length}/${issue.details?.split('/')?.pop() || remaining.length}`
          : `${remaining.length} images`,
        detailedSources: remaining,
      };
    });
    return { issues: updatedIssues };
  }, { invalidateSiteId: siteId, fields: ['issues'] });
}
