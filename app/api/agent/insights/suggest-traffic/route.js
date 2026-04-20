import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { generateStructuredResponse } from '@/lib/ai/gemini.js';
import { z } from 'zod';

export const maxDuration = 300;

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
        lastSelectedAccountId: true,
        accountMemberships: { select: { accountId: true } },
      },
    });
  } catch {
    return null;
  }
}

const SuggestionSchema = z.object({
  suggestions: z.array(z.object({
    category: z.enum(['seo_meta', 'content', 'internal_linking', 'technical', 'keyword']),
    title: z.string().describe('Short actionable title for the suggestion'),
    description: z.string().describe('Detailed explanation of what to change and why'),
    impact: z.enum(['high', 'medium', 'low']).describe('Expected impact on organic visibility'),
  })).min(1).max(8).describe('List of actionable suggestions to improve organic visibility'),
  summary: z.string().describe('Brief overall assessment of why this page has no organic traffic'),
});

/**
 * POST /api/agent/insights/suggest-traffic
 * 
 * Analyzes a page that has zero organic traffic and generates
 * AI suggestions to improve organic visibility.
 * 
 * Body: { siteId, url, title, slug }
 */
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { siteId, url, title, slug } = body;

    if (!siteId || !url) {
      return NextResponse.json({ error: 'siteId and url are required' }, { status: 400 });
    }

    // Verify site access
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, accountId: true, name: true, url: true },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const hasAccess = user.isSuperAdmin || user.accountMemberships.some(m => m.accountId === site.accountId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get entity data if available (content, SEO data, etc.) — enabled types only
    const entity = await prisma.siteEntity.findFirst({
      where: { siteId, url: { in: getUrlVariants(url) }, entityType: { isEnabled: true } },
      select: {
        title: true,
        slug: true,
        url: true,
        excerpt: true,
        content: true,
        seoData: true,
        publishedAt: true,
        entityType: { select: { slug: true, name: true } },
      },
    });

    // Build context for AI analysis
    const pageTitle = entity?.title || title || '';
    const pageSlug = entity?.slug || slug || '';
    const pageContent = entity?.content || '';
    const seoData = entity?.seoData || {};
    const excerpt = entity?.excerpt || '';
    const postType = entity?.entityType?.slug || 'page';
    const publishedAt = entity?.publishedAt;

    // Truncate content for prompt (keep first ~3000 chars for analysis)
    const contentPreview = stripHtml(pageContent).slice(0, 3000);

    const seoTitle = seoData.title || seoData.seo_title || '';
    const seoDescription = seoData.description || seoData.meta_desc || seoData.seo_description || '';
    const focusKeyword = seoData.focuskw || seoData.focus_keyword || '';

    const prompt = `You are an expert SEO consultant. Analyze the following published web page that has received ZERO organic impressions in Google Search Console over the last 30 days. Provide actionable suggestions to improve its organic visibility.

Site: ${site.name} (${site.url})
Page URL: ${url}
Page Title: ${pageTitle}
Page Slug: ${pageSlug}
Post Type: ${postType}
Published: ${publishedAt ? new Date(publishedAt).toISOString().split('T')[0] : 'Unknown'}

SEO Title: ${seoTitle || '(not set)'}
SEO Description: ${seoDescription || '(not set)'}
Focus Keyword: ${focusKeyword || '(not set)'}
Excerpt: ${excerpt || '(none)'}

Content Preview:
${contentPreview || '(no content available)'}

Analyze this page and provide specific, actionable suggestions to help it gain organic search visibility. Consider:
1. SEO meta data quality (title, description, focus keyword)
2. Content quality, length, and keyword optimization
3. Internal linking opportunities
4. Technical SEO issues (URL structure, heading hierarchy)
5. Search intent alignment

Focus on the most impactful changes first. Be specific - mention exact improvements rather than generic advice.
Respond in the same language as the page content (if Hebrew content, respond in Hebrew; if English, respond in English).`;

    const result = await generateStructuredResponse({
      system: 'You are an expert SEO consultant specializing in organic search optimization. Provide practical, specific suggestions.',
      prompt,
      schema: SuggestionSchema,
      temperature: 0.4,
      operation: 'AGENT_SUGGEST_TRAFFIC',
      metadata: { siteId, url },
      accountId: site.accountId,
      userId: user.id,
      siteId,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('[suggest-traffic] error:', err);
    return NextResponse.json({ error: 'Failed to generate suggestions' }, { status: 500 });
  }
}

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getUrlVariants(url) {
  const variants = new Set([url]);
  try {
    const parsed = new URL(url);
    const withSlash = parsed.href.endsWith('/') ? parsed.href : parsed.href + '/';
    const withoutSlash = parsed.href.endsWith('/') ? parsed.href.slice(0, -1) : parsed.href;
    variants.add(withSlash);
    variants.add(withoutSlash);
  } catch { /* use original */ }
  return [...variants];
}
