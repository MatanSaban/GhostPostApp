/**
 * Favicon Fix Handler
 *
 * Issue handled: noFavicon
 *
 * Preview phase:
 *   - Generates a square favicon image with Imagen (Nano Banana) based on
 *     the site's brand name + an optional `payload.brief` from the user.
 *   - Returns a base64 data URI as both an `image` ManualOutput and a
 *     `suggestion` (so the modal can render the preview thumbnail).
 *
 * Apply phase (WP-auto only):
 *   - Takes either:
 *       • payload.attachmentId  → existing WP media item, just call setFavicon
 *       • payload.imageBase64   → upload via uploadMediaFromBase64, then setFavicon
 *   - Updates the audit (noFavicon → faviconGood).
 *
 * Manual path:
 *   - Returns the generated image so the user can download it and upload to
 *     their CMS / hosting (favicon.ico endpoint or theme-level icon setting).
 */

import { generateImage } from '@/lib/ai/gemini';
import { setFavicon, uploadMediaFromBase64 } from '@/lib/wp-api-client';
import { image as imageOutput, instructions as instructionsOutput } from '@/lib/audit/fix-manual-output';
import { updateAuditWithRetry, brandName } from './_shared';

const FAVICON_FILENAME = 'gp-favicon';

function buildFaviconPrompt(site, brief) {
  const name = brandName(site);
  const userBrief = brief && typeof brief === 'string' ? brief.trim().slice(0, 300) : '';
  return [
    `Design a clean, modern square favicon for "${name}".`,
    'Style: minimal, bold, instantly recognizable at 16×16 pixels.',
    'Composition: a single strong shape or 1–2 letters, centered, with a solid or simple-gradient background.',
    'Avoid: text smaller than the largest letter, fine details, photorealism, logos with multiple words, drop shadows, complex illustrations.',
    'Output: square (1:1), high contrast, web-safe colors. The icon must read clearly when scaled to 32×32 and 16×16.',
    userBrief ? `Additional brief from the site owner: ${userBrief}` : null,
  ].filter(Boolean).join('\n');
}

export async function preview({ site, payload = {}, wpAuto: _wpAuto }) {
  const prompt = buildFaviconPrompt(site, payload.brief);

  const images = await generateImage({
    prompt,
    aspectRatio: '1:1',
    n: 1,
    operation: 'AUDIT_FIX_FAVICON',
    metadata: { siteId: site.id, siteUrl: site.url },
    // Intentionally NOT passing accountId - the dispatcher charges credits
    // separately via enforceCredits + deductAiCredits, not generateImage's
    // built-in tracker (which would double-bill).
  });

  if (!images || images.length === 0) {
    throw new Error('Imagen returned no images');
  }

  const img = images[0];
  const dataUri = `data:${img.mimeType};base64,${img.base64}`;
  const filename = `${FAVICON_FILENAME}.${(img.mimeType.split('/').pop() || 'png').toLowerCase()}`;

  // Suggestion shape for the modal - base64 is what apply() needs to push.
  const suggestion = {
    imageBase64: img.base64,
    mimeType: img.mimeType,
    filename,
    dataUri,
  };

  const manualOutputs = [
    imageOutput({
      title: 'Generated favicon',
      why: 'A favicon helps users recognize your site in browser tabs, bookmarks, and search results.',
      instructions: 'Download the image, then upload it as your favicon:\n- **WordPress**: Appearance → Customize → Site Identity → Site Icon.\n- **Shopify**: Online Store → Themes → Customize → Theme Settings → Favicon.\n- **Static site / hosting**: place the file at `/favicon.ico` (or `.png`) at your site root.',
      url: dataUri,
      filename,
      width: 1024,
      height: 1024,
      altText: `${brandName(site)} favicon`,
    }),
    instructionsOutput({
      title: 'Tip: regenerate if you don\'t love it',
      why: 'AI-generated icons vary; you can re-run the fix or pick a different existing image from your media library.',
      instructions: 'Click **Regenerate** to get another variation, or close this and pick an image from your existing media library instead.',
    }),
  ];

  // Both wpAuto and non-wpAuto get manualOutputs; suggestion carries the
  // base64 so apply() can upload it without re-generating.
  return {
    suggestions: [suggestion],
    manualOutputs,
    usage: null, // generateImage doesn't return token usage in the same shape
  };
}

export async function apply({ site, payload = {}, audit }) {
  const { attachmentId: providedAttachmentId, imageBase64, mimeType, filename } = payload;

  let attachmentId = providedAttachmentId;
  let uploadedFilename = filename || `${FAVICON_FILENAME}.png`;

  // Path A: caller already chose an existing media item.
  // Path B: caller passes the AI-generated base64 - we upload it first.
  if (!attachmentId) {
    if (!imageBase64) {
      return {
        results: [{ pushed: false, pushError: 'apply requires either attachmentId or imageBase64' }],
        auditUpdated: false,
      };
    }
    try {
      const uploaded = await uploadMediaFromBase64(site, imageBase64, uploadedFilename, {
        mime_type: mimeType || 'image/png',
        title: `${brandName(site)} favicon`,
        alt: `${brandName(site)} favicon`,
      });
      attachmentId = uploaded?.id || uploaded?.attachmentId;
      if (!attachmentId) {
        return {
          results: [{ pushed: false, pushError: 'Media upload returned no attachment ID' }],
          auditUpdated: false,
        };
      }
    } catch (e) {
      return {
        results: [{ pushed: false, pushError: `Media upload failed: ${e.message}` }],
        auditUpdated: false,
      };
    }
  }

  let pushed = false;
  let pushError = null;
  let faviconUrl = null;
  try {
    const result = await setFavicon(site, attachmentId);
    if (result?.success) {
      pushed = true;
      faviconUrl = result.faviconUrl || null;
    } else {
      pushError = result?.error || 'Plugin reported failure';
    }
  } catch (e) {
    pushError = e.message;
  }

  const auditUpdated = (pushed && audit?.id)
    ? await updateAuditWithRetry(audit.id, (a) => {
        const updatedIssues = (a.issues || []).map((issue) => {
          if (issue.message === 'audit.issues.noFavicon') {
            return {
              ...issue, severity: 'passed', message: 'audit.issues.faviconGood',
              suggestion: null, details: `Favicon set (attachment #${attachmentId})`,
            };
          }
          return issue;
        });
        return { issues: updatedIssues };
      }, { invalidateSiteId: site.id, fields: ['issues'] })
    : false;

  return {
    results: [{ attachmentId, pushed, pushError, faviconUrl }],
    auditUpdated,
  };
}
