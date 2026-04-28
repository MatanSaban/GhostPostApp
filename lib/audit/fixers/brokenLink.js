/**
 * Broken Internal Link Fix Handler
 *
 * Issue handled: brokenInternalLink (404s in internal nav)
 *
 * Preview: AI matches each broken URL to the most semantically relevant
 *          active page (from siteEntity table). If no good match, suggests
 *          the homepage.
 *
 * WP-auto apply: creates 301 redirects via the WP plugin's redirect API.
 *
 * Manual: returns one `redirect` ManualOutput per broken URL - the user
 *         creates the redirect in their CMS / hosting / .htaccess.
 */

import { z } from 'zod';
import { generateObject } from 'ai';
import { googleGlobal } from '@/lib/ai/vertex-provider.js';
import { GEMINI_MODEL } from '@/lib/ai/models.js';
import { createRedirect } from '@/lib/wp-api-client';
import { redirect as redirectOutput, instructions as instructionsOutput } from '@/lib/audit/fix-manual-output';
import prisma from '@/lib/prisma';
import { updateAuditWithRetry, localeName } from './_shared';

const suggestionsSchema = z.object({
  suggestions: z.array(z.object({
    brokenUrl: z.string(),
    suggestedUrl: z.string(),
    suggestedTitle: z.string(),
    confidence: z.enum(['high', 'medium', 'low']),
    reason: z.string(),
  })),
});

function parseBrokenLinkIssue(issue) {
  let parsed = {};
  try { parsed = JSON.parse(issue.details || '{}'); } catch { /* ignore */ }
  return {
    brokenUrl: parsed.brokenHref || issue.url,
    anchorText: parsed.anchorText || '',
    statusCode: parsed.statusCode || 404,
    sourceUrl: issue.url,
  };
}

export async function preview({ site, payload = {}, wpAuto }) {
  const { auditId, locale } = payload;
  const audit = auditId ? await prisma.siteAudit.findUnique({
    where: { id: auditId },
    select: { issues: true },
  }) : null;

  const brokenLinks = (audit?.issues || []).filter(
    (i) => i.message === 'audit.issues.brokenInternalLink' && i.severity !== 'passed'
  );
  if (brokenLinks.length === 0) {
    return wpAuto ? { suggestions: [], usage: null } : { manualOutputs: [], usage: null };
  }

  const entities = await prisma.siteEntity.findMany({
    where: { siteId: site.id, status: 'PUBLISHED', entityType: { isEnabled: true } },
    select: { title: true, slug: true, url: true },
    take: 500,
  });

  if (entities.length === 0) {
    // No content to redirect to - surface as instructions only.
    return wpAuto
      ? { suggestions: [], usage: null }
      : {
          manualOutputs: [instructionsOutput({
            title: 'Sync your site content first',
            instructions: 'We need to know which active pages exist on your site before suggesting redirects. Go to **Entities** in the dashboard, sync your site, then try again.',
          })],
          usage: null,
        };
  }

  const entityList = entities.map((e, i) => `${i + 1}. "${e.title}" – ${e.url || e.slug}`).join('\n');
  const brokenData = brokenLinks.map(parseBrokenLinkIssue);
  const brokenContext = brokenData.map((b, i) =>
    `${i + 1}. Broken URL: ${b.brokenUrl}\n   Link text: "${b.anchorText}"\n   Found on: ${b.sourceUrl}\n   Status: ${b.statusCode}`).join('\n');

  const reasonLang = localeName(locale);
  const prompt = `You are an SEO expert. The website "${site.name || site.url}" has broken internal links (404s). For each broken link, find the most semantically relevant active page to redirect to.

Active pages on the site:
${entityList}

Broken internal links:
${brokenContext}

For each broken link:
1. Analyze the broken URL path and the anchor text to understand the original intent.
2. Find the best matching active page from the list above.
3. If no good match exists, suggest the homepage: ${site.url}.
4. Write the "reason" field in ${reasonLang}.
5. Use the FULL URL for suggestedUrl (including the domain).`;

  const result = await generateObject({
    model: googleGlobal(GEMINI_MODEL),
    schema: suggestionsSchema,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
  });

  const suggestions = result.object?.suggestions || [];
  const usage = result.usage || null;

  if (wpAuto) return { suggestions, usage };

  const manualOutputs = suggestions.map((s) => {
    let fromPath = s.brokenUrl;
    let toPath = s.suggestedUrl;
    try { fromPath = new URL(s.brokenUrl, site.url).pathname; } catch { /* keep as-is */ }
    try { toPath = new URL(s.suggestedUrl, site.url).pathname; } catch { /* keep as-is */ }

    return redirectOutput({
      title: `301 redirect: ${fromPath} → ${toPath}`,
      why: s.reason,
      instructions: `Create a **301 redirect** from \`${fromPath}\` to \`${toPath}\`.\n\nWhere to set this:\n- **WordPress** (no plugin): use Yoast SEO Premium, Rank Math, or the *Redirection* plugin.\n- **Apache**: add a \`Redirect 301 ${fromPath} ${toPath}\` line to \`.htaccess\`.\n- **Nginx**: add \`return 301 ${toPath};\` inside a \`location ${fromPath} { ... }\` block.\n- **Cloudflare/Vercel/Netlify**: use their redirect rules in the dashboard or \`_redirects\` file.`,
      from: fromPath,
      to: toPath,
      statusCode: 301,
    });
  });

  return { manualOutputs, usage };
}

export async function apply({ site, payload = {}, audit }) {
  const fixes = Array.isArray(payload.fixes) ? payload.fixes : [];
  if (fixes.length === 0) return { results: [], auditUpdated: false };

  const results = [];
  for (const { brokenUrl, targetUrl } of fixes) {
    if (!brokenUrl || !targetUrl) {
      results.push({ brokenUrl, targetUrl, pushed: false, pushError: 'missing brokenUrl or targetUrl' });
      continue;
    }
    try {
      const fromPath = new URL(brokenUrl, site.url).pathname;
      const toPath = new URL(targetUrl, site.url).pathname;
      await createRedirect(site, { from: fromPath, to: toPath, type: 301 });
      results.push({ brokenUrl, targetUrl, pushed: true });
    } catch (e) {
      results.push({ brokenUrl, targetUrl, pushed: false, pushError: e.message });
    }
  }

  const successful = results.filter((r) => r.pushed);
  const auditUpdated = (audit?.id && successful.length > 0)
    ? await updateAuditWithRetry(audit.id, (a) => {
        const fixedUrls = new Set(successful.map((f) => f.brokenUrl));
        const updatedIssues = (a.issues || []).map((issue) => {
          if (issue.message !== 'audit.issues.brokenInternalLink') return issue;
          const { brokenUrl } = parseBrokenLinkIssue(issue);
          if (!fixedUrls.has(brokenUrl)) return issue;
          return { ...issue, severity: 'passed', suggestion: null,
                   details: `${issue.details || ''} (301 redirect created)` };
        });
        return { issues: updatedIssues };
      }, { invalidateSiteId: site.id, fields: ['issues'] })
    : false;

  return { results, auditUpdated };
}
