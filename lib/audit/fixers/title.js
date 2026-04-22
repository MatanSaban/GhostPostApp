/**
 * Title Fix Handler
 *
 * Reference handler — covers BOTH dispatcher paths:
 *
 *   preview({ site, payload, wpAuto })
 *     wpAuto=true  → { suggestions: [{ url, oldTitle, newTitle, reason }], usage }
 *     wpAuto=false → { manualOutputs: [<value-kind ManualOutput>...], usage }
 *
 *   apply({ site, payload, audit, wpAuto })
 *     WP-only — pushes new titles via /seo/{id} and updates the audit doc.
 *
 * Issues handled (per fix-registry):
 *   audit.issues.noTitle | titleTooShort | titleTooLong | duplicateTitle
 *
 * Payload contract:
 *   payload.auditId  string   — needed in preview for page context
 *   payload.urls     string[] — preview phase: which URLs to generate for
 *   payload.fixes    [{url, newTitle}] — apply phase: final values
 *   payload.locale   'en'|'he'|... — for the reason-text language
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
  updateAuditWithRetry, localeName, brandName,
} from './_shared';

const TITLE_ISSUE_KEYS = new Set([
  'audit.issues.noTitle',
  'audit.issues.titleTooShort',
  'audit.issues.titleTooLong',
  'audit.issues.duplicateTitle',
]);

const suggestionsSchema = z.object({
  suggestions: z.array(z.object({
    url: z.string(),
    oldTitle: z.string(),
    newTitle: z.string().min(20).max(70),
    reason: z.string(),
  })),
});

// ─── Preview ─────────────────────────────────────────────────────────

export async function preview({ site, payload = {}, wpAuto }) {
  const { auditId, urls: requestedUrls, locale } = payload;

  const audit = auditId ? await prisma.siteAudit.findUnique({
    where: { id: auditId },
    select: { issues: true, pageResults: true },
  }) : null;

  const issueUrls = [...new Set(
    (audit?.issues || [])
      .filter((i) => TITLE_ISSUE_KEYS.has(i.message))
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
    return { url, currentTitle: pr?.title || '', metaDescription: pr?.metaDescription || '' };
  });

  const reasonLang = localeName(locale);
  const brand = brandName(site);

  const pagesContext = pages.map((p, i) =>
    `${i + 1}. URL: ${p.url}\n   Current Title: "${p.currentTitle}"\n   Meta Description: "${p.metaDescription}"`).join('\n');

  const prompt = `You are an SEO expert. Rewrite the page titles below for the website "${site.name || site.url}".

Requirements:
- Each title 50-60 characters (ideal range for search engines).
- Include relevant keywords naturally.
- Include the brand "${brand}" when it fits without feeling stuffed.
- Make titles specific and compelling, not generic.
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
    title: `New title for ${shortPath(s.url)}`,
    why: s.reason,
    instructions: `Set this as the **page title** (the \`<title>\` tag) for [${shortPath(s.url)}](${s.url}). In WordPress this is usually the "SEO title" field in Yoast / Rank Math. In Shopify/Wix/Webflow look for the page's *SEO settings* panel.`,
    value: s.newTitle,
    field: 'Page title (<title> tag)',
    charLimit: 60,
  }));

  return { manualOutputs, usage };
}

// ─── Apply (WP-auto only) ────────────────────────────────────────────

export async function apply({ site, payload = {}, audit }) {
  const fixes = Array.isArray(payload.fixes) ? payload.fixes : [];
  if (fixes.length === 0) return { results: [], auditUpdated: false };

  const results = [];
  for (const { url, newTitle } of fixes) {
    if (!url || !newTitle) {
      results.push({ url, newTitle, pushed: false, pushError: 'missing url or newTitle' });
      continue;
    }
    if (isArchiveUrl(url)) {
      results.push({ url, newTitle, pushed: false, pushError: 'archive/taxonomy pages cannot be updated', skipped: true });
      continue;
    }
    try {
      const postId = await resolvePostIdFromUrl(site, url);
      if (!postId) throw new Error(`WordPress post ID not found for ${url}`);
      await updateSeoData(site, postId, { title: newTitle });
      results.push({ url, newTitle, pushed: true });
    } catch (e) {
      results.push({ url, newTitle, pushed: false, pushError: e.message });
    }
  }

  const successful = results.filter((r) => r.pushed);
  const auditUpdated = (audit?.id && successful.length > 0)
    ? await applyTitleAuditUpdate(audit.id, successful, site.id)
    : false;

  return { results, auditUpdated };
}

async function applyTitleAuditUpdate(auditId, successful, siteId) {
  const fixMap = new Map(successful.map((f) => [f.url, f.newTitle]));
  return updateAuditWithRetry(auditId, (audit) => {
    const updatedIssues = (audit.issues || []).map((issue) => {
      if (!TITLE_ISSUE_KEYS.has(issue.message) || !issue.url || !fixMap.has(issue.url)) return issue;
      const newTitle = fixMap.get(issue.url);
      const len = newTitle.length;
      if (len >= 30 && len <= 60) {
        return { ...issue, severity: 'passed', message: 'audit.issues.titleGood', suggestion: null,
                 details: `${len} chars (AI fixed)` };
      }
      if (len > 60) {
        return { ...issue, severity: 'warning', message: 'audit.issues.titleTooLong',
                 suggestion: 'audit.suggestions.titleLength',
                 details: `${len} chars - "${newTitle.slice(0, 50)}..." (AI fixed)` };
      }
      return { ...issue, severity: 'warning', message: 'audit.issues.titleTooShort',
               details: `${len} chars - "${newTitle}" (AI fixed)` };
    });
    const updatedPageResults = (audit.pageResults || []).map((pr) =>
      fixMap.has(pr.url) ? { ...pr, title: fixMap.get(pr.url) } : pr
    );
    return { issues: updatedIssues, pageResults: updatedPageResults };
  }, { invalidateSiteId: siteId });
}
