/**
 * Empty Content Fix Handler
 *
 * Issue handled: emptyContent (a page or post that scanned with little or
 * no body text - typically a placeholder page that nobody filled in).
 *
 * WP-auto: AI drafts an HTML body using the page title, meta description,
 *          slug, and site context, then pushes it via /posts/{id} or
 *          /pages/{id} { content: <html> }. The site's existing SEO meta is
 *          left untouched.
 *
 * Manual:  Returns a `snippet` ManualOutput with the same HTML so the user
 *          can paste it into whatever CMS they're on.
 *
 * Cost:    8 credits (full body generation is the most expensive fixer -
 *          comparable to favicon Imagen).
 */

import { z } from 'zod';
import { generateObject } from 'ai';
import { googleGlobal } from '@/lib/ai/vertex-provider.js';
import { GEMINI_MODEL } from '@/lib/ai/models.js';
import { updatePost } from '@/lib/wp-api-client';
import { snippet as snippetOutput } from '@/lib/audit/fix-manual-output';
import prisma from '@/lib/prisma';
import {
  isArchiveUrl, shortPath, updateAuditWithRetry, localeName, brandName,
} from './_shared';

const ISSUE_KEY = 'audit.issues.emptyContent';

const suggestionsSchema = z.object({
  suggestions: z.array(z.object({
    url: z.string(),
    newContentHtml: z.string().min(400)
      .describe('Full HTML body. Use <p>, <h2>, <h3>, <ul>, <ol>, <strong>, <em>, <a>. Do NOT include an <h1> (the post title is the H1).'),
    wordCount: z.number().int(),
    reason: z.string(),
  })),
});

/**
 * Look up the SiteEntity for a URL and return both externalId (WP post ID)
 * and the entityType slug ("posts" / "pages" / custom). Falls back to
 * "posts" when the entity isn't tracked - updatePost still routes correctly
 * via /posts/{id} for the common case.
 */
async function resolveEntityFromUrl(site, url) {
  let parsedUrl;
  try { parsedUrl = new URL(url); } catch { return null; }

  const urlWithSlash = url.endsWith('/') ? url : url + '/';
  const urlWithoutSlash = url.endsWith('/') ? url.slice(0, -1) : url;
  const slug = decodeURIComponent(parsedUrl.pathname.replace(/^\/|\/$/g, '').split('/').pop() || '');
  const isHomepage = parsedUrl.pathname === '/' || parsedUrl.pathname === '';

  let entity = await prisma.siteEntity.findFirst({
    where: { siteId: site.id, url: { in: [url, urlWithSlash, urlWithoutSlash] } },
    select: { externalId: true, entityType: { select: { slug: true, apiEndpoint: true } } },
  });

  if (!entity && slug) {
    entity = await prisma.siteEntity.findFirst({
      where: { siteId: site.id, slug },
      select: { externalId: true, entityType: { select: { slug: true, apiEndpoint: true } } },
    });
  }

  if (!entity && isHomepage) {
    entity = await prisma.siteEntity.findFirst({
      where: {
        siteId: site.id,
        url: { in: [
          parsedUrl.origin + '/',
          parsedUrl.origin,
          site.url,
          site.url.endsWith('/') ? site.url.slice(0, -1) : site.url + '/',
        ] },
      },
      select: { externalId: true, entityType: { select: { slug: true, apiEndpoint: true } } },
    });
  }

  if (!entity?.externalId) return null;

  // Prefer apiEndpoint (the literal REST base, e.g. "pages") - falls back to
  // the slug. Default "posts" if both are missing.
  const postType = entity.entityType?.apiEndpoint || entity.entityType?.slug || 'posts';
  return { postId: entity.externalId, postType };
}

export async function preview({ site, payload = {}, wpAuto }) {
  const { auditId, urls: requestedUrls, locale } = payload;
  const audit = auditId ? await prisma.siteAudit.findUnique({
    where: { id: auditId },
    select: { issues: true, pageResults: true },
  }) : null;

  const issueUrls = [...new Set(
    (audit?.issues || [])
      .filter((i) => i.message === ISSUE_KEY)
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
    return {
      url,
      currentTitle: pr?.title || '',
      currentDescription: pr?.metaDescription || '',
    };
  });

  const reasonLang = localeName(locale);
  const pagesContext = pages.map((p, i) =>
    `${i + 1}. URL: ${p.url}\n   Title: "${p.currentTitle}"\n   Meta description: "${p.currentDescription}"`
  ).join('\n');

  const prompt = `You are an SEO content writer. The pages below on "${brandName(site)}" (${site.url}) have NO body content - they need a complete first draft generated from scratch using the page's title and meta description as the topical signal.

Requirements per page:
- Output a complete HTML body, 350-700 words.
- Allowed tags: <p>, <h2>, <h3>, <ul>, <ol>, <li>, <strong>, <em>, <a>. NO <h1> (the post title is already the H1). NO inline styles, classes, or scripts.
- Structure: short opening paragraph, 2-4 H2 sections, optional bullet list, closing paragraph with a soft call-to-action when appropriate.
- Match each page's existing language inferred from the title/meta (Hebrew → write Hebrew, English → write English, etc.).
- Be concrete - reference what the page promises in its title. Don't write generic filler. If the title is ambiguous, write a useful overview rather than inventing facts.
- The "reason" field MUST be in ${reasonLang}.
- Every page in the input MUST appear in the output, in the same order.

Pages:
${pagesContext}`;

  const result = await generateObject({
    model: googleGlobal(GEMINI_MODEL),
    schema: suggestionsSchema,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.55,
  });

  const suggestions = result.object?.suggestions || [];
  const usage = result.usage || null;

  if (wpAuto) return { suggestions, usage };

  const manualOutputs = suggestions.map((s) => snippetOutput({
    title: `New body content for ${shortPath(s.url)}`,
    why: s.reason,
    instructions: `Open [${shortPath(s.url)}](${s.url}) in your CMS editor and replace the (empty) body with the HTML below. ~${s.wordCount} words.`,
    language: 'html',
    code: s.newContentHtml,
    where: 'Page/post body',
  }));

  return { manualOutputs, usage };
}

export async function apply({ site, payload = {}, audit }) {
  const fixes = Array.isArray(payload.fixes) ? payload.fixes : [];
  if (fixes.length === 0) return { results: [], auditUpdated: false };

  const results = [];
  for (const { url, newContentHtml } of fixes) {
    if (!url || !newContentHtml) {
      results.push({ url, pushed: false, pushError: 'missing url or newContentHtml' });
      continue;
    }
    if (isArchiveUrl(url)) {
      results.push({ url, pushed: false, pushError: 'archive/taxonomy pages cannot be updated', skipped: true });
      continue;
    }
    try {
      const resolved = await resolveEntityFromUrl(site, url);
      if (!resolved) throw new Error(`WordPress post for ${url} not found in synced entities`);
      await updatePost(site, resolved.postType, resolved.postId, { content: newContentHtml });
      results.push({ url, pushed: true });
    } catch (e) {
      results.push({ url, pushed: false, pushError: e.message });
    }
  }

  const successful = results.filter((r) => r.pushed);
  const auditUpdated = (audit?.id && successful.length > 0)
    ? await applyEmptyContentAuditUpdate(audit.id, successful, site.id, fixes)
    : false;

  return { results, auditUpdated };
}

async function applyEmptyContentAuditUpdate(auditId, successful, siteId, fixes) {
  const fixedUrls = new Set(successful.map((s) => s.url));
  // Word counts come from the freshly generated content - approximate by
  // counting whitespace-separated tokens after stripping tags.
  const wordCountForUrl = new Map(
    fixes
      .filter((f) => fixedUrls.has(f.url) && typeof f.newContentHtml === 'string')
      .map((f) => {
        const text = f.newContentHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        return [f.url, text ? text.split(' ').filter(Boolean).length : 0];
      })
  );

  return updateAuditWithRetry(auditId, (audit) => {
    const updatedIssues = (audit.issues || []).map((issue) => {
      if (issue.message !== ISSUE_KEY || !issue.url || !fixedUrls.has(issue.url)) return issue;
      const wc = wordCountForUrl.get(issue.url) ?? 0;
      return {
        ...issue,
        severity: 'passed',
        message: 'audit.issues.contentGood',
        suggestion: null,
        details: `${wc} words (AI fixed)`,
      };
    });
    return { issues: updatedIssues };
  }, { invalidateSiteId: siteId, fields: ['issues'] });
}
