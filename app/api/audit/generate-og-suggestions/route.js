import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { generateObject } from 'ai';
import { google } from '@/lib/ai/vertex-provider.js';
import { z } from 'zod';
import { deductAiCredits } from '@/lib/account-utils';

const SESSION_COOKIE = 'user_session';

async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) return null;
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        isSuperAdmin: true,
        accountMemberships: {
          select: { accountId: true },
        },
      },
    });
  } catch {
    return null;
  }
}

const suggestionsSchema = z.object({
  suggestions: z.array(
    z.object({
      url: z.string().describe('The page URL'),
      ogTitle: z.string().min(15).max(70).describe('Suggested og:title (15-60 chars ideal)'),
      ogDescription: z.string().min(50).max(200).describe('Suggested og:description (50-160 chars ideal)'),
      reason: z.string().describe('Brief explanation of why these OG tags are better'),
    })
  ).describe('Open Graph tag suggestions for each affected page'),
});

/**
 * POST: Generate AI Open Graph tag suggestions for pages with missing OG tags
 *
 * Body: { auditId, siteId, locale? }
 *
 * Cost: FREE (preview only - credits charged on apply)
 * Returns: { suggestions: [{ url, ogTitle, ogDescription, currentOgTitle, currentOgDesc, currentOgImage, reason }] }
 */
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { auditId, siteId, locale } = await request.json();
    const reasonLang = locale === 'he' ? 'Hebrew' : 'English';

    if (!auditId || !siteId) {
      return NextResponse.json(
        { error: 'auditId and siteId are required' },
        { status: 400 }
      );
    }

    // Verify site access
    const accountIds = user.accountMemberships.map(m => m.accountId);
    const site = await prisma.site.findFirst({
      where: user.isSuperAdmin ? { id: siteId } : { id: siteId, accountId: { in: accountIds } },
      select: { id: true, url: true, name: true, accountId: true },
    });
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Check if site has synced entities
    const entityCount = await prisma.siteEntity.count({ where: { siteId } });
    const hasEntities = entityCount > 0;

    // Get the audit
    const audit = await prisma.siteAudit.findFirst({
      where: { id: auditId, siteId },
    });
    if (!audit) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    }

    // Find pages with missingOG issues
    const ogIssues = (audit.issues || []).filter(
      (i) => i.message === 'audit.issues.missingOG'
    );
    const affectedUrls = [...new Set(ogIssues.map((i) => i.url).filter(Boolean))];

    // Archive/taxonomy pages can't be updated via the plugin
    const archivePatterns = [/\/category\//, /\/tag\//, /\/author\//, /\/page\/\d/];
    const fixableUrls = affectedUrls.filter(url => !archivePatterns.some(p => p.test(url)));

    if (fixableUrls.length === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    // Build page context from pageResults + issue details
    const pageResults = audit.pageResults || [];
    const issuesByUrl = {};
    ogIssues.forEach(i => { if (i.url) issuesByUrl[i.url] = i; });

    const pagesData = fixableUrls.map((url) => {
      const pr = pageResults.find((p) => p.url === url);
      const issue = issuesByUrl[url];
      return {
        url,
        currentTitle: pr?.title || '',
        currentDescription: pr?.metaDescription || '',
        missingDetails: issue?.details || 'Missing: og:title, og:description, og:image',
      };
    });

    const pagesContext = pagesData
      .map(
        (p, i) =>
          `${i + 1}. URL: ${p.url}\n   Page Title: "${p.currentTitle}"\n   Meta Description: "${p.currentDescription}"\n   ${p.missingDetails}`
      )
      .join('\n');

    const prompt = `You are an SEO and social media expert. The following pages from the website "${site.name || site.url}" are missing Open Graph meta tags needed for proper social media sharing (Facebook, LinkedIn, Twitter, etc.).

Requirements:
- Generate an og:title for each page (15-60 characters, compelling for social sharing)
- Generate an og:description for each page (50-160 characters, engaging preview text)
- The og:title should be catchy and relevant - it can differ from the page title
- The og:description should be a compelling summary that encourages clicks when shared on social media
- Maintain the original language - if the page title is in Hebrew, write in Hebrew; if in English, write in English, etc.
- Write the "reason" field in ${reasonLang}.
- Note: og:image will be handled separately (using the page's featured image), so you only need to generate og:title and og:description.

Pages to fix:
${pagesContext}

Generate og:title and og:description for each page.`;

    const MODEL = 'gemini-2.5-pro';
    const result = await generateObject({
      model: google(MODEL),
      schema: suggestionsSchema,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
    });

    const usage = result.usage || {};
    const deduction = await deductAiCredits(site.accountId, 1, {
      userId: user.id,
      siteId,
      source: 'ai_og_suggestions',
      description: `AI OG Suggestions: ${fixableUrls.length} page(s)`,
      metadata: {
        model: MODEL,
        inputTokens: usage.inputTokens || 0,
        outputTokens: usage.outputTokens || 0,
        totalTokens: usage.totalTokens || 0,
      },
    });
    if (!deduction.success) {
      const isInsufficient = deduction.error?.includes('Insufficient');
      return NextResponse.json(
        { error: deduction.error || 'Credit deduction failed', code: isInsufficient ? 'INSUFFICIENT_CREDITS' : 'CREDIT_ERROR', resourceKey: isInsufficient ? 'aiCredits' : undefined },
        { status: 402 }
      );
    }

    // Enrich suggestions with current OG values from issue details
    const enriched = result.object.suggestions.map(s => {
      const issue = issuesByUrl[s.url];
      const details = issue?.details || '';
      return {
        ...s,
        missingTags: details,
      };
    });

    return NextResponse.json({
      suggestions: enriched,
      totalPages: fixableUrls.length,
      creditCostPerPage: 1,
      hasEntities,
    });
  } catch (error) {
    console.error('[API/audit/generate-og-suggestions] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
