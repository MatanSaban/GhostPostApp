/**
 * Heading Structure Fix Handler
 *
 * Issues handled: noH1 | multipleH1 | noH2
 *
 * The fix style depends on the issue:
 *
 *   noH1 / noH2 - AI suggests the right heading text from the page's
 *   title and content. We can't push HTML into a WP post body via the
 *   plugin's SEO endpoint, so even on WP-auto we return manual outputs:
 *   a `value` for the recommended text + a `snippet` showing where to
 *   place it.
 *
 *   multipleH1 - there's no good way to programmatically pick which H1
 *   to demote, so we always return `instructions` describing the audit
 *   step the user must do in their editor.
 *
 * Because no path actually pushes via the plugin, `apply` is a no-op
 * that records the user's acknowledgement (the audit doc is only
 * updated when they manually re-run the audit).
 */

import { z } from 'zod';
import { generateObject } from 'ai';
import { googleGlobal } from '@/lib/ai/vertex-provider.js';
import { GEMINI_MODEL } from '@/lib/ai/models.js';
import { value as valueOutput, snippet as snippetOutput, instructions as instructionsOutput, composite as compositeOutput } from '@/lib/audit/fix-manual-output';
import prisma from '@/lib/prisma';
import { shortPath, localeName, brandName } from './_shared';

const HEADING_ISSUES_NEEDING_TEXT = new Set([
  'audit.issues.noH1',
  'audit.issues.noH2',
]);

const suggestionsSchema = z.object({
  suggestions: z.array(z.object({
    url: z.string(),
    headingLevel: z.enum(['h1', 'h2']),
    headingText: z.string().min(5).max(150),
    reason: z.string(),
  })),
});

export async function preview({ site, payload = {}, wpAuto }) {
  const { auditId, issueType, urls: requestedUrls, locale } = payload;
  const audit = auditId ? await prisma.siteAudit.findUnique({
    where: { id: auditId },
    select: { issues: true, pageResults: true },
  }) : null;

  // multipleH1 doesn't need AI - it's structural advice only.
  if (issueType === 'audit.issues.multipleH1') {
    return previewMultipleH1(audit, requestedUrls, wpAuto);
  }

  if (!HEADING_ISSUES_NEEDING_TEXT.has(issueType)) {
    return wpAuto ? { suggestions: [], usage: null } : { manualOutputs: [], usage: null };
  }

  const level = issueType === 'audit.issues.noH1' ? 'h1' : 'h2';
  const issues = (audit?.issues || []).filter((i) => i.message === issueType);
  const issueUrls = [...new Set(issues.map((i) => i.url).filter(Boolean))];
  const targetUrls = (Array.isArray(requestedUrls) && requestedUrls.length ? requestedUrls : issueUrls);

  if (targetUrls.length === 0) {
    return wpAuto ? { suggestions: [], usage: null } : { manualOutputs: [], usage: null };
  }

  const pageResults = audit?.pageResults || [];
  const pages = targetUrls.map((url) => {
    const pr = pageResults.find((p) => p.url === url);
    return {
      url,
      title: pr?.title || '',
      metaDescription: pr?.metaDescription || '',
      existingHeadings: pr?.headings || [],
    };
  });

  const reasonLang = localeName(locale);
  const pagesContext = pages.map((p, i) =>
    `${i + 1}. URL: ${p.url}\n   Title: "${p.title}"\n   Meta: "${p.metaDescription}"\n   Existing headings: ${JSON.stringify(p.existingHeadings).slice(0, 200)}`
  ).join('\n');

  const prompt = `You are an SEO and content expert. Generate a recommended ${level.toUpperCase()} heading for each page below from "${brandName(site)}".

Requirements:
- ${level === 'h1' ? 'Each page needs ONE H1 - the main page heading' : 'Each page needs an H2 - a clear major section heading'}.
- ${level === 'h1' ? 'Often similar to the <title> but optimized for human reading on the page.' : 'Should describe the most important content section.'}
- 5-80 characters typical, max 150.
- Match the page\'s existing language.
- Write the "reason" field in ${reasonLang}.
- Don\'t duplicate any text already in "Existing headings".`;

  const result = await generateObject({
    model: googleGlobal(GEMINI_MODEL),
    schema: suggestionsSchema,
    messages: [{ role: 'user', content: `${prompt}\n\nPages:\n${pagesContext}` }],
    temperature: 0.4,
  });

  const suggestions = (result.object?.suggestions || []).map((s) => ({ ...s, headingLevel: level }));
  const usage = result.usage || null;

  // Heading text can't be pushed via the plugin SEO endpoint - both paths
  // get manual outputs, but for WP-auto we still return suggestions so the
  // modal can show the AI text alongside copy/instructions.
  const manualOutputs = suggestions.map((s) => compositeOutput({
    title: `Add ${s.headingLevel.toUpperCase()} to ${shortPath(s.url)}`,
    why: s.reason,
    instructions: `Edit [${shortPath(s.url)}](${s.url}) and add the heading near the top of the main content area (before the first paragraph).`,
    parts: [
      valueOutput({
        title: `Recommended ${s.headingLevel.toUpperCase()} text`,
        instructions: 'Copy this and paste it as the heading.',
        value: s.headingText,
        field: `${s.headingLevel.toUpperCase()} text`,
      }),
      snippetOutput({
        title: 'HTML version',
        instructions: 'If editing HTML directly, use this:',
        language: 'html',
        code: `<${s.headingLevel}>${escapeHtml(s.headingText)}</${s.headingLevel}>`,
      }),
    ],
  }));

  // Even on wpAuto we surface manualOutputs because there's no auto-apply.
  return { suggestions, manualOutputs, usage };
}

function previewMultipleH1(audit, requestedUrls, _wpAuto) {
  const issues = (audit?.issues || []).filter((i) => i.message === 'audit.issues.multipleH1');
  const issueUrls = [...new Set(issues.map((i) => i.url).filter(Boolean))];
  const targetUrls = (Array.isArray(requestedUrls) && requestedUrls.length ? requestedUrls : issueUrls);

  const manualOutputs = targetUrls.map((url) => instructionsOutput({
    title: `Demote extra H1s on ${shortPath(url)}`,
    why: 'Pages should have exactly one H1 - the main heading. Extra H1s split topical authority and confuse search engines about what the page is about.',
    instructions: `1. Open [${shortPath(url)}](${url}) in your editor.\n2. Find every \`<h1>\` tag - there should be only one.\n3. Demote the extras to \`<h2>\` (or the appropriate level for the section's nesting depth).\n4. Re-run the audit to verify.\n\n**Tip:** in WordPress Gutenberg, click the heading block and change the level dropdown from H1 to H2. In Elementor, edit the widget's "HTML Tag".`,
  }));

  return { suggestions: [], manualOutputs, usage: null };
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// No auto-apply path - heading edits require body-content access we don't have.
export async function apply({ payload = {} }) {
  const fixes = Array.isArray(payload.fixes) ? payload.fixes : [];
  return {
    results: fixes.map((f) => ({
      ...f,
      pushed: false,
      pushError: 'Heading edits require manual content updates - not supported by the WP plugin SEO endpoint.',
    })),
    auditUpdated: false,
  };
}
