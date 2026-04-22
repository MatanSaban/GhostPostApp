/**
 * Open Graph Fix Handler
 *
 * Issue handled: missingOG
 *
 * WP-auto: pushes og_title + og_description via /seo/{id}.
 * Manual:  returns one `snippet` ManualOutput per page with the
 *          ready-to-paste meta tags for the page's <head>.
 */

import { z } from 'zod';
import { generateObject } from 'ai';
import { googleGlobal } from '@/lib/ai/vertex-provider.js';
import { GEMINI_MODEL } from '@/lib/ai/models.js';
import { updateSeoData } from '@/lib/wp-api-client';
import { snippet as snippetOutput } from '@/lib/audit/fix-manual-output';
import prisma from '@/lib/prisma';
import {
  isArchiveUrl, shortPath, resolvePostIdFromUrl,
  updateAuditWithRetry, localeName,
} from './_shared';

const suggestionsSchema = z.object({
  suggestions: z.array(z.object({
    url: z.string(),
    ogTitle: z.string().min(15).max(70),
    ogDescription: z.string().min(50).max(200),
    reason: z.string(),
  })),
});

export async function preview({ site, payload = {}, wpAuto }) {
  const { auditId, urls: requestedUrls, locale } = payload;
  const audit = auditId ? await prisma.siteAudit.findUnique({
    where: { id: auditId },
    select: { issues: true, pageResults: true },
  }) : null;

  const ogIssues = (audit?.issues || []).filter((i) => i.message === 'audit.issues.missingOG');
  const issueUrls = [...new Set(ogIssues.map((i) => i.url).filter(Boolean))];
  const targetUrls = (Array.isArray(requestedUrls) && requestedUrls.length ? requestedUrls : issueUrls)
    .filter((u) => !isArchiveUrl(u));

  if (targetUrls.length === 0) {
    return wpAuto ? { suggestions: [], usage: null } : { manualOutputs: [], usage: null };
  }

  const issueByUrl = Object.fromEntries(ogIssues.map((i) => [i.url, i]));
  const pageResults = audit?.pageResults || [];
  const pages = targetUrls.map((url) => {
    const pr = pageResults.find((p) => p.url === url);
    return {
      url,
      currentTitle: pr?.title || '',
      currentDescription: pr?.metaDescription || '',
      missingDetails: issueByUrl[url]?.details || 'Missing: og:title, og:description, og:image',
    };
  });

  const reasonLang = localeName(locale);
  const pagesContext = pages.map((p, i) =>
    `${i + 1}. URL: ${p.url}\n   Page Title: "${p.currentTitle}"\n   Meta Description: "${p.currentDescription}"\n   ${p.missingDetails}`).join('\n');

  const prompt = `You are an SEO and social media expert. Generate Open Graph meta tags for the pages below from "${site.name || site.url}".

Requirements:
- og:title: 15-60 characters, compelling for social sharing (can differ from <title>).
- og:description: 50-160 characters, engaging preview text that drives clicks.
- Match each page's existing language.
- Write the "reason" field in ${reasonLang}.
- og:image is handled separately (we'll use the page's featured image), so do NOT generate it.

Pages:
${pagesContext}`;

  const result = await generateObject({
    model: googleGlobal(GEMINI_MODEL),
    schema: suggestionsSchema,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.4,
  });

  const suggestions = result.object?.suggestions || [];
  const usage = result.usage || null;

  if (wpAuto) return { suggestions, usage };

  const manualOutputs = suggestions.map((s) => snippetOutput({
    title: `Open Graph tags for ${shortPath(s.url)}`,
    why: s.reason,
    instructions: `Paste these inside the \`<head>\` of [${shortPath(s.url)}](${s.url}). The og:image should be the same as your page's hero/featured image — fill in the URL where shown.`,
    language: 'html',
    code: [
      `<meta property="og:title" content=${JSON.stringify(s.ogTitle)} />`,
      `<meta property="og:description" content=${JSON.stringify(s.ogDescription)} />`,
      `<meta property="og:url" content=${JSON.stringify(s.url)} />`,
      `<meta property="og:type" content="website" />`,
      `<meta property="og:image" content="https://your-site.com/path/to/featured-image.jpg" />`,
    ].join('\n'),
    where: 'inside <head>',
  }));

  return { manualOutputs, usage };
}

export async function apply({ site, payload = {}, audit }) {
  const fixes = Array.isArray(payload.fixes) ? payload.fixes : [];
  if (fixes.length === 0) return { results: [], auditUpdated: false };

  const results = [];
  for (const { url, ogTitle, ogDescription } of fixes) {
    if (!url || (!ogTitle && !ogDescription)) {
      results.push({ url, ogTitle, ogDescription, pushed: false, pushError: 'missing url or values' });
      continue;
    }
    if (isArchiveUrl(url)) {
      results.push({ url, ogTitle, ogDescription, pushed: false, pushError: 'archive/taxonomy pages cannot be updated', skipped: true });
      continue;
    }
    try {
      const postId = await resolvePostIdFromUrl(site, url);
      if (!postId) throw new Error(`WordPress post ID not found for ${url}`);
      const seoData = {};
      if (ogTitle) seoData.og_title = ogTitle;
      if (ogDescription) seoData.og_description = ogDescription;
      await updateSeoData(site, postId, seoData);
      results.push({ url, ogTitle, ogDescription, pushed: true });
    } catch (e) {
      results.push({ url, ogTitle, ogDescription, pushed: false, pushError: e.message });
    }
  }

  const successful = results.filter((r) => r.pushed);
  const auditUpdated = (audit?.id && successful.length > 0)
    ? await updateAuditWithRetry(audit.id, (a) => {
        const fixedUrlSet = new Set(successful.map((f) => f.url));
        const updatedIssues = (a.issues || []).map((issue) => {
          if (issue.message === 'audit.issues.missingOG' && issue.url && fixedUrlSet.has(issue.url)) {
            return { ...issue, severity: 'passed', message: 'audit.issues.ogTagsGood',
                     suggestion: null, details: 'OG tags set via AI fix' };
          }
          return issue;
        });
        return { issues: updatedIssues };
      }, { invalidateSiteId: site.id, fields: ['issues'] })
    : false;

  return { results, auditUpdated };
}
