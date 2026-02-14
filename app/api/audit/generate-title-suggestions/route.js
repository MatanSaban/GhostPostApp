import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';

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
      oldTitle: z.string().describe('The current page title'),
      newTitle: z.string().min(30).max(70).describe('Suggested SEO-optimized title (50-60 chars ideal, 30-70 allowed)'),
      reason: z.string().describe('Brief explanation of why this title is better'),
    })
  ).describe('Title suggestions for each affected page'),
});

/**
 * POST: Generate AI title suggestions for pages with short titles
 *
 * Body: { auditId, siteId }
 *
 * Cost: FREE (preview only — credits charged on apply)
 * Returns: { suggestions: [{ url, oldTitle, newTitle, reason }] }
 */
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { auditId, siteId } = await request.json();

    if (!auditId || !siteId) {
      return NextResponse.json(
        { error: 'auditId and siteId are required' },
        { status: 400 }
      );
    }

    // Verify site access
    const accountIds = user.accountMemberships.map(m => m.accountId);
    const site = await prisma.site.findFirst({
      where: { id: siteId, accountId: { in: accountIds } },
      select: { id: true, url: true, name: true, accountId: true },
    });
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Check if site has synced entities (needed for pushing fixes)
    const entityCount = await prisma.siteEntity.count({ where: { siteId } });
    const hasEntities = entityCount > 0;

    // Get the audit
    const audit = await prisma.siteAudit.findFirst({
      where: { id: auditId, siteId },
    });
    if (!audit) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    }

    // Find pages with titleTooShort issue
    const titleIssues = (audit.issues || []).filter(
      (i) => i.message === 'audit.issues.titleTooShort'
    );
    const affectedUrls = [...new Set(titleIssues.map((i) => i.url).filter(Boolean))];

    if (affectedUrls.length === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    // Build page context from pageResults
    const pageResults = audit.pageResults || [];
    const pagesData = affectedUrls.map((url) => {
      const pr = pageResults.find((p) => p.url === url);
      return {
        url,
        currentTitle: pr?.title || '',
        metaDescription: pr?.metaDescription || '',
      };
    });

    // Generate suggestions using Gemini
    const pagesContext = pagesData
      .map(
        (p, i) =>
          `${i + 1}. URL: ${p.url}\n   Current Title: "${p.currentTitle}"\n   Meta Description: "${p.metaDescription}"`
      )
      .join('\n');

    const prompt = `You are an SEO expert. The following pages from the website "${site.name || site.url}" have titles that are too short (under 30 characters). Generate better SEO-optimized titles for each page.

Requirements:
- Each title should be 50-60 characters (ideal range for search engines)
- Include relevant keywords naturally
- Include the brand name "${site.name || new URL(site.url).hostname}" when appropriate
- Make titles compelling and descriptive
- Maintain the original language of each title — if the current title is in Hebrew, write the new title in Hebrew too; if in English, write in English, etc.

Pages to fix:
${pagesContext}

Generate a new title for each page.`;

    const result = await generateObject({
      model: google('gemini-2.0-flash'),
      schema: suggestionsSchema,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
    });

    return NextResponse.json({
      suggestions: result.object.suggestions,
      totalPages: affectedUrls.length,
      creditCostPerPage: 1,
      hasEntities,
    });
  } catch (error) {
    console.error('[API/audit/generate-title-suggestions] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
