/**
 * Meta Description Fix Handler
 *
 * Issues handled: noMetaDescription | metaDescriptionShort |
 *                 metaDescriptionLong | duplicateMetaDescription
 *
 * WP-auto: pushes via /seo/{id} { description: ... }
 * Manual:  returns one `value` ManualOutput per page.
 */

import { z } from 'zod';
import { generateObject } from 'ai';
import { googleGlobal } from '@/lib/ai/vertex-provider.js';
import { GEMINI_MODEL } from '@/lib/ai/models.js';
import { updateSeoData } from '@/lib/wp-api-client';
import { value as valueOutput } from '@/lib/audit/fix-manual-output';
import prisma from '@/lib/prisma';
import {
  isArchiveUrl, shortPath, resolvePostIdFromUrl,
  updateAuditWithRetry, localeName,
} from './_shared';

const DESC_ISSUE_KEYS = new Set([
  'audit.issues.noMetaDescription',
  'audit.issues.metaDescriptionShort',
  'audit.issues.metaDescriptionLong',
  'audit.issues.duplicateMetaDescription',
]);

const suggestionsSchema = z.object({
  suggestions: z.array(z.object({
    url: z.string(),
    oldDescription: z.string(),
    newDescription: z.string().min(80).max(180),
    reason: z.string(),
  })),
});

export async function preview({ site, payload = {}, wpAuto }) {
  const { auditId, urls: requestedUrls, locale } = payload;
  const audit = auditId ? await prisma.siteAudit.findUnique({
    where: { id: auditId },
    select: { issues: true, pageResults: true },
  }) : null;

  const issueUrls = [...new Set(
    (audit?.issues || [])
      .filter((i) => DESC_ISSUE_KEYS.has(i.message))
      .map((i) => i.url)
      .filter(Boolean)
  )];
  const targetUrls = (Array.isArray(requestedUrls) && requestedUrls.length ? requestedUrls : issueUrls)
    .filter((u) => !isArchiveUrl(u));

  if (targetUrls.length === 0) {
    return wpAuto ? { suggestions: [], usage: null } : { manualOutputs: [], usage: null };
  }

  const pageResults = audit?.pageResults || [];
  const pages = targetUrls.map((url) => {
    const pr = pageResults.find((p) => p.url === url);
    return { url, currentTitle: pr?.title || '', currentDescription: pr?.metaDescription || '' };
  });

  const reasonLang = localeName(locale);
  const pagesContext = pages.map((p, i) =>
    `${i + 1}. URL: ${p.url}\n   Title: "${p.currentTitle}"\n   Current Meta Description: "${p.currentDescription}"`).join('\n');

  const prompt = `You are an SEO expert. Rewrite the meta descriptions below for the website "${site.name || site.url}".

Requirements:
- Each description 120-160 characters (ideal range for search engines).
- Include relevant keywords naturally.
- Summarize the page content compellingly to drive click-through.
- Use action-oriented language when appropriate.
- Match each page's existing language (Hebrew → Hebrew, English → English, etc.).
- Write the "reason" field in ${reasonLang}.
- Every page in the input MUST appear in the output, in the same order.

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

  const manualOutputs = suggestions.map((s) => valueOutput({
    title: `New meta description for ${shortPath(s.url)}`,
    why: s.reason,
    instructions: `Set this as the **meta description** for [${shortPath(s.url)}](${s.url}). In WordPress this is the "Meta description" field in Yoast / Rank Math. In Shopify/Wix/Webflow look in *SEO settings*. In raw HTML it's \`<meta name="description" content="...">\` inside \`<head>\`.`,
    value: s.newDescription,
    field: 'Meta description',
    charLimit: 160,
  }));

  return { manualOutputs, usage };
}

export async function apply({ site, payload = {}, audit }) {
  const fixes = Array.isArray(payload.fixes) ? payload.fixes : [];
  if (fixes.length === 0) return { results: [], auditUpdated: false };

  const results = [];
  for (const { url, newDescription } of fixes) {
    if (!url || !newDescription) {
      results.push({ url, newDescription, pushed: false, pushError: 'missing url or newDescription' });
      continue;
    }
    if (isArchiveUrl(url)) {
      results.push({ url, newDescription, pushed: false, pushError: 'archive/taxonomy pages cannot be updated', skipped: true });
      continue;
    }
    try {
      const postId = await resolvePostIdFromUrl(site, url);
      if (!postId) throw new Error(`WordPress post ID not found for ${url}`);
      await updateSeoData(site, postId, { description: newDescription });
      results.push({ url, newDescription, pushed: true });
    } catch (e) {
      results.push({ url, newDescription, pushed: false, pushError: e.message });
    }
  }

  const successful = results.filter((r) => r.pushed);
  const auditUpdated = (audit?.id && successful.length > 0)
    ? await applyDescAuditUpdate(audit.id, successful, site.id)
    : false;

  return { results, auditUpdated };
}

async function applyDescAuditUpdate(auditId, successful, siteId) {
  const fixMap = new Map(successful.map((f) => [f.url, f.newDescription]));
  return updateAuditWithRetry(auditId, (audit) => {
    const updatedIssues = (audit.issues || []).map((issue) => {
      if (!DESC_ISSUE_KEYS.has(issue.message) || !issue.url || !fixMap.has(issue.url)) return issue;
      const newDesc = fixMap.get(issue.url);
      const len = newDesc.length;
      if (len >= 120 && len <= 160) {
        return { ...issue, severity: 'passed', message: 'audit.issues.metaDescriptionGood',
                 suggestion: null, details: `${len} chars (AI fixed)` };
      }
      if (len > 160) {
        return { ...issue, severity: 'warning', message: 'audit.issues.metaDescriptionLong',
                 suggestion: 'audit.suggestions.metaDescriptionLength',
                 details: `${len} chars (AI fixed)` };
      }
      return { ...issue, severity: 'warning', details: `${len} chars (AI fixed)` };
    });
    const updatedPageResults = (audit.pageResults || []).map((pr) =>
      fixMap.has(pr.url) ? { ...pr, metaDescription: fixMap.get(pr.url) } : pr
    );
    return { issues: updatedIssues, pageResults: updatedPageResults };
  }, { invalidateSiteId: siteId });
}
