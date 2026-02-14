/**
 * AI Visual Analyzer — Gemini Vision Integration
 *
 * Sends desktop + mobile screenshots to Gemini 2.0 Flash for
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
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { logAIUsage } from '@/lib/ai/credits.js';

const VISION_MODEL = 'gemini-2.0-flash';

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

const SYSTEM_PROMPT = `You are a professional UI/UX and Web Accessibility Auditor.

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
- Do NOT invent issues — if the site looks clean, return an empty array
- Focus on the most impactful issues first (max 15 issues total across all pages)
- Write clear messages a website owner can understand
- For each issue, specify the DEVICE: "desktop" if only on desktop, "mobile" if only on mobile, "both" if visible on both screenshots
- For each issue, specify the PAGE URL where the issue appears
- When possible, provide an approximate REGION (bounding box in percentage coordinates 0-100) where the issue appears in the screenshot. The coordinates are relative: x=0 is left edge, x=100 is right edge, y=0 is top, y=100 is bottom of the visible viewport.`;

/**
 * Analyze screenshots using Gemini Vision — supports multiple pages.
 *
 * @param {Array<{ url: string, desktop?: Buffer, mobile?: Buffer }>} pages
 *   Array of pages with their screenshot buffers (max ~5 recommended)
 * @param {string} siteUrl - The site base URL (for context)
 * @returns {Array<AuditIssue>}
 */
export async function analyzeVisualIssues(pages, siteUrl) {
  // Support legacy single-page call: analyzeVisualIssues(desktop, mobile, url)
  if (Buffer.isBuffer(pages) || pages === null) {
    const desktop = pages;
    const mobile = siteUrl;
    const url = arguments[2] || '';
    pages = [{ url, desktop, mobile }];
    siteUrl = url;
  }

  // Filter to pages that actually have screenshots
  const validPages = (Array.isArray(pages) ? pages : []).filter(
    (p) => p && (p.desktop || p.mobile)
  );
  if (validPages.length === 0) return [];

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
        { type: 'text', text: `DESKTOP Screenshot (1920×1080) — ${pathLabel}:` },
        { type: 'image', image: page.desktop }
      );
    }
    if (page.mobile) {
      content.push(
        { type: 'text', text: `MOBILE Screenshot (375×812, iPhone) — ${pathLabel}:` },
        { type: 'image', image: page.mobile }
      );
    }
  }

  try {
    const result = await generateObject({
      model: google(VISION_MODEL),
      schema: visualIssueSchema,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
      temperature: 0.2,
    });

    // Log AI usage for credits tracking
    const usage = result.usage || {};
    logAIUsage({
      operation: 'SITE_AUDIT_VISION',
      inputTokens: usage.promptTokens || 0,
      outputTokens: usage.completionTokens || 0,
      totalTokens: usage.totalTokens || 0,
      model: VISION_MODEL,
      metadata: {
        siteUrl,
        pagesAnalyzed: validPages.length,
        issueCount: result.object?.issues?.length || 0,
      },
    });

    // Convert AI output to AuditIssue format
    return (result.object?.issues || []).map((issue) => ({
      type: 'visual',
      severity: issue.severity === 'notice' ? 'warning' : issue.severity,
      message: issue.message,
      url: issue.pageUrl || siteUrl,
      suggestion: issue.suggestion,
      source: 'ai-vision',
      device: issue.device || 'both',
      boundingBox: issue.region || null,
    }));
  } catch (err) {
    console.error('[VisionAnalyzer] Gemini analysis failed:', err.message);
    return [];
  }
}
