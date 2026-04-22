/**
 * Structured Data (JSON-LD) Fix Handler
 *
 * Issue handled: noStructuredData
 *
 * Picks the best schema.org type for each page (Article / FAQPage / HowTo /
 * Product / LocalBusiness / WebPage) based on the URL + title + meta + headings,
 * then emits a valid JSON-LD object the user can drop inside
 * `<script type="application/ld+json">`.
 *
 * Why no auto-apply path: the WP plugin SEO endpoint doesn't take a JSON-LD
 * payload, and `wp_kses_post` strips `<script>` tags from post bodies — so
 * even on wpAuto we surface manualOutputs (snippet) and `apply` is a no-op
 * that records the user's acknowledgement. They re-run the audit after
 * pasting it into their theme / header-injection plugin.
 */

import { z } from 'zod';
import { generateObject } from 'ai';
import { googleGlobal } from '@/lib/ai/vertex-provider.js';
import { GEMINI_MODEL } from '@/lib/ai/models.js';
import { snippet as snippetOutput } from '@/lib/audit/fix-manual-output';
import prisma from '@/lib/prisma';
import { shortPath, localeName, brandName } from './_shared';

const SCHEMA_TYPES = ['Article', 'FAQPage', 'HowTo', 'Product', 'LocalBusiness', 'WebPage'];

const suggestionsSchema = z.object({
  suggestions: z.array(z.object({
    url: z.string(),
    schemaType: z.enum(SCHEMA_TYPES),
    jsonLd: z.string().describe(
      'Single-line compact JSON string for the JSON-LD object. MUST be parseable via JSON.parse(). Include @context and @type.'
    ),
    reason: z.string(),
  })),
});

export async function preview({ site, payload = {}, wpAuto: _wpAuto }) {
  const { auditId, urls: requestedUrls, locale } = payload;
  const audit = auditId ? await prisma.siteAudit.findUnique({
    where: { id: auditId },
    select: { issues: true, pageResults: true },
  }) : null;

  const issues = (audit?.issues || []).filter((i) => i.message === 'audit.issues.noStructuredData');
  const issueUrls = [...new Set(issues.map((i) => i.url).filter(Boolean))];
  const targetUrls = (Array.isArray(requestedUrls) && requestedUrls.length ? requestedUrls : issueUrls);

  if (targetUrls.length === 0) {
    return { suggestions: [], manualOutputs: [], usage: null };
  }

  const pageResults = audit?.pageResults || [];
  const pages = targetUrls.map((url) => {
    const pr = pageResults.find((p) => p.url === url);
    const headings = (pr?.headings || []).slice(0, 8)
      .map((h) => `${h.level || 'h?'}: ${h.text || ''}`).join(' | ');
    return {
      url,
      title: pr?.title || '',
      metaDescription: pr?.metaDescription || '',
      headings,
      excerpt: (pr?.contentExcerpt || pr?.bodyText || '').slice(0, 800),
    };
  });

  const reasonLang = localeName(locale);
  const pagesContext = pages.map((p, i) =>
    `${i + 1}. URL: ${p.url}\n   Title: "${p.title}"\n   Meta: "${p.metaDescription}"\n   Headings: ${p.headings}\n   Excerpt: ${p.excerpt}`
  ).join('\n\n');

  const prompt = `You are a structured-data (schema.org) specialist. For each page from "${brandName(site)}", pick the BEST-fitting schema.org type and emit valid JSON-LD.

## Type selection rules
- **Article** — blog posts, news, guides, editorial content (most common for content pages).
- **FAQPage** — pages built around question/answer pairs (use only if you can extract ≥3 real Q/A pairs from the content).
- **HowTo** — step-by-step instructional pages with a clear ordered procedure.
- **Product** — e-commerce product pages (must have a price/availability hint in the content).
- **LocalBusiness** — business homepage / contact pages with address/hours/phone.
- **WebPage** — generic fallback when nothing else clearly fits.

## JSON-LD requirements
- Output \`jsonLd\` as a SINGLE-LINE compact JSON string, parseable via JSON.parse().
- Always include \`"@context": "https://schema.org"\` and \`"@type"\`.
- Populate values ONLY from the page content shown — never invent facts, prices, dates, or addresses.
- For **Article**: include headline, description, mainEntityOfPage (= the URL), author (use site name), datePublished only if visible in the excerpt; otherwise omit it.
- For **FAQPage**: at least 3 \`mainEntity\` Question/Answer pairs from the actual content.
- For **HowTo**: include name, description, and a \`step\` array with \`{"@type":"HowToStep","name":"...","text":"..."}\`.
- For **Product**: include name + description; omit \`offers\` unless a price is clearly visible.
- For **LocalBusiness**: include name + url; omit address/telephone unless visible.
- For **WebPage**: include name, description, url.
- String fields should match the page's language.
- Write the "reason" field in ${reasonLang}.

## Pages
${pagesContext}`;

  const result = await generateObject({
    model: googleGlobal(GEMINI_MODEL),
    schema: suggestionsSchema,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
  });

  const rawSuggestions = result.object?.suggestions || [];
  const usage = result.usage || null;

  // Validate every JSON-LD parses; drop the ones that don't (better to skip
  // than give the user something broken to paste).
  const suggestions = rawSuggestions.filter((s) => {
    try { JSON.parse(s.jsonLd); return true; }
    catch { return false; }
  });

  const manualOutputs = suggestions.map((s) => snippetOutput({
    title: `${s.schemaType} schema for ${shortPath(s.url)}`,
    why: s.reason,
    instructions: `Paste this inside the \`<head>\` of [${shortPath(s.url)}](${s.url}). In WordPress: use a header-injection plugin (e.g. **Insert Headers and Footers**) or your theme's \`header.php\`. Validate at [validator.schema.org](https://validator.schema.org).`,
    language: 'html',
    code: `<script type="application/ld+json">\n${prettyJson(s.jsonLd)}\n</script>`,
    where: 'inside <head>',
  }));

  // Always surface manualOutputs alongside suggestions because there's no auto-apply.
  return { suggestions, manualOutputs, usage };
}

function prettyJson(jsonString) {
  try { return JSON.stringify(JSON.parse(jsonString), null, 2); }
  catch { return jsonString; }
}

export async function apply({ payload = {} }) {
  const fixes = Array.isArray(payload.fixes) ? payload.fixes : [];
  return {
    results: fixes.map((f) => ({
      ...f,
      pushed: false,
      pushError: 'Structured-data injection requires header access — paste the snippet into your theme or a header-injection plugin.',
    })),
    auditUpdated: false,
  };
}
