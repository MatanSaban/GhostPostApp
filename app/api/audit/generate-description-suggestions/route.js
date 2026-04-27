import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { generateObject } from 'ai';
import { googleGlobal } from '@/lib/ai/vertex-provider.js';
import { GEMINI_MODEL } from '@/lib/ai/models.js';
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
      oldDescription: z.string().describe('The current meta description (empty string if missing)'),
      newDescription: z.string().min(120).max(170).describe('Suggested SEO-optimized meta description (120-160 chars ideal)'),
      reason: z.string().describe('Brief explanation of why this description is better'),
    })
  ).describe('Meta description suggestions for each affected page'),
});

/**
 * POST: Generate AI meta description suggestions for pages with missing/short descriptions
 *
 * Body: { auditId, siteId, locale? }
 *
 * Cost: FREE (preview only - credits charged on apply)
 * Returns: { suggestions: [{ url, oldDescription, newDescription, reason }] }
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

    // Find pages with noMetaDescription or metaDescriptionShort
    const descIssues = (audit.issues || []).filter(
      (i) =>
        i.message === 'audit.issues.noMetaDescription' ||
        i.message === 'audit.issues.metaDescriptionShort'
    );
    const affectedUrls = [...new Set(descIssues.map((i) => i.url).filter(Boolean))];

    // Archive/taxonomy pages can't be updated via the plugin
    const archivePatterns = [/\/category\//, /\/tag\//, /\/author\//, /\/page\/\d/];
    const fixableUrls = affectedUrls.filter(url => !archivePatterns.some(p => p.test(url)));

    if (fixableUrls.length === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    // Build page context from pageResults
    const pageResults = audit.pageResults || [];
    const pagesData = fixableUrls.map((url) => {
      const pr = pageResults.find((p) => p.url === url);
      return {
        url,
        currentTitle: pr?.title || '',
        currentDescription: pr?.metaDescription || '',
      };
    });

    const pagesContext = pagesData
      .map(
        (p, i) =>
          `${i + 1}. URL: ${p.url}\n   Title: "${p.currentTitle}"\n   Current Meta Description: "${p.currentDescription}"`
      )
      .join('\n');

    const prompt = `You are an SEO expert. The following pages from the website "${site.name || site.url}" have meta descriptions that are either missing or too short (under 120 characters). Generate better SEO-optimized meta descriptions for each page.

Requirements:
- Each description should be 120-160 characters (ideal range for search engines)
- Include relevant keywords naturally
- Summarize the page content compellingly to increase click-through rates
- Use action-oriented language when appropriate
- Maintain the original language - if the page title is in Hebrew, write the description in Hebrew too; if in English, write in English, etc.
- Write the "reason" field in ${reasonLang}.

Pages to fix:
${pagesContext}

Generate a new meta description for each page.`;

    const result = await generateObject({
      model: googleGlobal(GEMINI_MODEL),
      schema: suggestionsSchema,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
    });

    const usage = result.usage || {};
    const deduction = await deductAiCredits(site.accountId, 1, {
      userId: user.id,
      siteId,
      source: 'ai_description_suggestions',
      description: `AI Description Suggestions: ${fixableUrls.length} page(s)`,
      metadata: {
        model: GEMINI_MODEL,
        inputTokens: usage.inputTokens || 0,
        outputTokens: usage.outputTokens || 0,
        totalTokens: usage.totalTokens || 0,
      },
    });
    if (!deduction.success) {
      const isInsufficient = deduction.error?.includes('Insufficient');
      return NextResponse.json(
        { error: deduction.error || 'Ai-GCoin deduction failed', code: isInsufficient ? 'INSUFFICIENT_CREDITS' : 'CREDIT_ERROR', resourceKey: isInsufficient ? 'aiCredits' : undefined },
        { status: 402 }
      );
    }

    return NextResponse.json({
      suggestions: result.object.suggestions,
      totalPages: fixableUrls.length,
      creditCostPerPage: 1,
      hasEntities,
    });
  } catch (error) {
    console.error('[API/audit/generate-description-suggestions] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
