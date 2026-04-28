/**
 * AI Visual Analyzer - Gemini Vision Integration
 *
 * Sends desktop + mobile screenshots to Gemini 3.1 Pro for
 * automated UI/UX and accessibility analysis.
 *
 * This is the "killer feature" that goes beyond Semrush/Ahrefs by
 * leveraging AI to detect visual issues humans would notice:
 * - Responsiveness problems (overflow, small text, horizontal scroll)
 * - Accessibility concerns (contrast, touch targets)
 * - Visual bugs (broken layouts, overlapping elements)
 * - UX problems (cluttered navigation, missing CTA)
 *
 * Uses Vercel AI SDK with Google Gemini (multimodal).
 */

import { generateObject } from 'ai';
import { googleGlobal } from '@/lib/ai/vertex-provider.js';
import { GEMINI_VISION_MODEL } from '@/lib/ai/models.js';
import { z } from 'zod';
import { deductAiCredits } from '@/lib/account-utils';

const visualIssueSchema = z.object({
  issues: z.array(
    z.object({
      severity: z.enum(['error', 'warning', 'notice']).describe('Severity: error for broken layouts, warning for usability problems, notice for minor improvements'),
      message: z.string().describe('Clear, specific description of the visual/UX issue found'),
      suggestion: z.string().describe('Specific actionable fix for this issue'),
      device: z.enum(['desktop', 'mobile', 'both']).describe('Which device this issue appears on: desktop only, mobile only, or both'),
      pageUrl: z.string().optional().describe('The URL of the page where the issue was found. Must match one of the page URLs provided.'),
      region: z.object({
        x: z.number().describe('Approximate X coordinate (0-100% of viewport width) of the issue center'),
        y: z.number().describe('Approximate Y coordinate (0-100% of viewport height from top) of the issue center'),
        width: z.number().describe('Approximate width (0-100% of viewport width) of the affected region'),
        height: z.number().describe('Approximate height (0-100% of viewport height) of the affected region'),
      }).optional().describe('Approximate bounding box of the issue in percentage coordinates. Only provide if the issue is localized to a specific area.'),
    })
  ),
});

// Hard cap on pages sent to Gemini Vision per audit.
// Each page is 2 images (desktop + mobile) - beyond this the context becomes
// too large, costs spike, and the model's recall on early pages drops.
const MAX_VISION_PAGES = 5;

// Issue budget grows sub-linearly with page count so the model doesn't pad
// responses with weak findings on small audits or drop critical ones on large.
function issueBudget(pageCount) {
  return Math.min(25, 6 + pageCount * 3);
}

const SYSTEM_PROMPT_TEMPLATE = `You are a professional UI/UX and Web Accessibility Auditor.

You will receive screenshots from MULTIPLE PAGES of a website. Each page has a Desktop version (1920×1080) and a Mobile version (375×812 iPhone). Screenshots are labeled with the page URL.

Analyze ALL screenshots and identify SPECIFIC, VISIBLE issues in these categories:

1. **Responsiveness**:
   - Elements overflowing the mobile screen or causing horizontal scrolling
   - Text too small to read on mobile (under ~14px equivalent)
   - Navigation not adapted for mobile (desktop menu still showing)
   - Images not scaling properly, getting cut off or stretched

2. **Accessibility**:
   - Color contrast issues (light text on light backgrounds, etc.)
   - Buttons or links too close together on mobile (touch targets < 44px)
   - Text over images without sufficient contrast overlay
   - Missing visual hierarchy or confusing layout

3. **Visual Bugs**:
   - Broken or misaligned layouts
   - Overlapping text or elements
   - Missing or broken images (broken image placeholder icons)
   - Inconsistent spacing or alignment
   - Elements hidden or cut off unintentionally

4. **UX Problems**:
   - No clear call-to-action visible above the fold
   - Cluttered layout making it hard to find key content
   - Important content pushed below very large headers/banners
   - Confusing navigation structure

5. **Cross-Page Consistency**:
   - Inconsistent styling, fonts, or colors between pages
   - Navigation that changes layout/behavior across pages
   - Inconsistent spacing or alignment between pages

RULES:
- Only report issues you can ACTUALLY SEE in the screenshots
- Be specific about WHAT element, WHERE on the page, and WHICH PAGE
- Do NOT invent issues - if the site looks clean, return an empty array
- Focus on the most impactful issues first (max {{MAX_ISSUES}} issues total across all pages)
- Write clear messages a website owner can understand
- For each issue, specify the DEVICE: "desktop" if only on desktop, "mobile" if only on mobile, "both" if visible on both screenshots
- For each issue, specify the PAGE URL where the issue appears
- When possible, provide an approximate REGION (bounding box in percentage coordinates 0-100) where the issue appears in the screenshot. The coordinates are relative: x=0 is left edge, x=100 is right edge, y=0 is top, y=100 is bottom of the visible viewport.`;

/**
 * Analyze screenshots using Gemini Vision - supports multiple pages.
 *
 * @param {Array<{ url: string, desktop?: Buffer, mobile?: Buffer }>} pages
 *   Array of pages with their screenshot buffers (max ~5 recommended)
 * @param {string} siteUrl - The site base URL (for context)
 * @returns {Array<AuditIssue>}
 */
export async function analyzeVisualIssues(pages, siteUrl, context = {}) {
  // Support legacy single-page call: analyzeVisualIssues(desktop, mobile, url)
  if (Buffer.isBuffer(pages) || pages === null) {
    const desktop = pages;
    const mobile = siteUrl;
    const url = arguments[2] || '';
    pages = [{ url, desktop, mobile }];
    siteUrl = url;
  }

  // Filter to pages that actually have screenshots, then cap at MAX_VISION_PAGES
  // to keep token cost bounded. Priority goes to the earliest pages (which are
  // typically most representative: homepage + top internal pages).
  const allValidPages = (Array.isArray(pages) ? pages : []).filter(
    (p) => p && (p.desktop || p.mobile)
  );
  if (allValidPages.length === 0) return [];
  const validPages = allValidPages.slice(0, MAX_VISION_PAGES);
  if (allValidPages.length > MAX_VISION_PAGES) {
    console.log(
      `[VisionAnalyzer] Capping vision analysis to ${MAX_VISION_PAGES}/${allValidPages.length} pages`
    );
  }

  const maxIssues = issueBudget(validPages.length);
  const systemPrompt = SYSTEM_PROMPT_TEMPLATE.replace('{{MAX_ISSUES}}', String(maxIssues));

  // Build multimodal message content with labeled screenshots per page
  const content = [
    { type: 'text', text: `Analyze the following screenshots from ${validPages.length} page(s) of ${siteUrl}:` },
  ];

  for (const page of validPages) {
    const pathLabel = (() => {
      try { return new URL(page.url).pathname || '/'; } catch { return page.url; }
    })();

    content.push({ type: 'text', text: `\n── PAGE: ${page.url} (${pathLabel}) ──` });

    if (page.desktop) {
      content.push(
        { type: 'text', text: `DESKTOP Screenshot (1920×1080) - ${pathLabel}:` },
        { type: 'image', image: page.desktop }
      );
    }
    if (page.mobile) {
      content.push(
        { type: 'text', text: `MOBILE Screenshot (375×812, iPhone) - ${pathLabel}:` },
        { type: 'image', image: page.mobile }
      );
    }
  }

  try {
    const result = await generateObject({
      model: googleGlobal(GEMINI_VISION_MODEL),
      schema: visualIssueSchema,
      system: systemPrompt,
      messages: [{ role: 'user', content }],
      temperature: 0.2,
    });

    // Track AI usage and deduct credits
    const usage = result.usage || {};
    if (context.accountId) {
      await deductAiCredits(context.accountId, 2, {
        userId: context.userId,
        siteId: context.siteId,
        source: 'audit_vision',
        description: `AI Vision analysis: ${validPages.length} page(s)`,
        metadata: {
          model: GEMINI_VISION_MODEL,
          inputTokens: usage.inputTokens || 0,
          outputTokens: usage.outputTokens || 0,
          totalTokens: usage.totalTokens || 0,
        },
      });
    }

    // Convert AI output to AuditIssue format. Normalise the AI-reported URL
    // against the set we actually sent - Gemini occasionally hallucinates a
    // slightly different form (trailing slash, www, etc.), and we want
    // drill-down to always resolve to a scanned page.
    const sentUrls = new Set(validPages.map((p) => p.url));
    const normUrl = (u) => {
      try {
        const parsed = new URL(u);
        parsed.hash = '';
        return parsed.toString();
      } catch { return u; }
    };
    const normSent = new Map(validPages.map((p) => [normUrl(p.url), p.url]));

    return (result.object?.issues || []).map((issue) => {
      let url = issue.pageUrl || siteUrl;
      if (url && !sentUrls.has(url)) {
        const canonical = normSent.get(normUrl(url));
        if (canonical) url = canonical;
      }
      return {
        type: 'visual',
        severity: issue.severity === 'notice' ? 'warning' : issue.severity,
        message: issue.message,
        url,
        suggestion: issue.suggestion,
        source: 'ai-vision',
        device: issue.device || 'both',
        boundingBox: issue.region || null,
      };
    });
  } catch (err) {
    console.error('[VisionAnalyzer] Gemini analysis failed:', err.message);
    return [];
  }
}
