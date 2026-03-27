/**
 * Suggest Article Type API
 * 
 * Analyzes a keyword + intent using AI to recommend the best article type.
 * Returns a structured suggestion with reasoning, so the UI can auto-select
 * the most appropriate article type instead of relying only on intent mapping.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { generateStructuredResponse } from '@/lib/ai/gemini';
import { z } from 'zod';

const SESSION_COOKIE = 'user_session';

// Valid article type IDs (must match ARTICLE_TYPES in wizardConfig.js)
const VALID_TYPES = [
  'SEO', 'BLOG_POST', 'GUIDE', 'HOW_TO', 'LISTICLE',
  'COMPARISON', 'REVIEW', 'NEWS', 'TUTORIAL', 'CASE_STUDY',
];

const SuggestionSchema = z.object({
  articleType: z.enum(VALID_TYPES).describe('The most fitting article type ID for this keyword'),
  reasoning: z.string().describe('1-2 sentence explanation of why this type fits the keyword. MUST be written in the language specified in the prompt.'),
  briefPlan: z.string().describe('3-4 bullet points (one per line, starting with -) outlining the post structure. MUST be written in the language specified in the prompt.'),
});

async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) return null;
    return await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, accountMemberships: { select: { accountId: true } } },
    });
  } catch {
    return null;
  }
}

export async function POST(request, { params }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: keywordId } = await params;
    const body = await request.json();
    const { intent, locale, force } = body;

    // Map locale to language name for the AI prompt
    const LOCALE_LANGUAGES = { he: 'Hebrew', en: 'English', ar: 'Arabic', es: 'Spanish', fr: 'French', de: 'German' };
    const userLanguage = LOCALE_LANGUAGES[locale] || 'the same language as the keyword';

    const keyword = await prisma.keyword.findUnique({
      where: { id: keywordId },
      select: { keyword: true, intents: true, tags: true, aiSuggestion: true, site: { select: { id: true, name: true } } },
    });

    if (!keyword) {
      return NextResponse.json({ error: 'Keyword not found' }, { status: 404 });
    }

    const primaryIntent = intent || keyword.intents?.[0] || 'INFORMATIONAL';

    // Return cached suggestion if available (same locale) and not forced
    const cached = keyword.aiSuggestion;
    if (!force && cached && cached.locale === locale) {
      return NextResponse.json({
        suggestion: { articleType: cached.articleType, reasoning: cached.reasoning, briefPlan: cached.briefPlan },
        keyword: keyword.keyword,
        intent: primaryIntent,
        cached: true,
      });
    }

    const result = await generateStructuredResponse({
      system: `You are an expert content strategist. Given a keyword and its search intent, recommend the single best article type. Consider the keyword's language, topic, and what kind of content readers searching for this keyword would actually expect.

Article types:
- SEO: Classic SEO-optimized article targeting search rankings (e.g. "best X in 2025")
- BLOG_POST: Engaging, informative blog post (e.g. "why X matters")
- GUIDE: Comprehensive, in-depth guide (e.g. "the complete guide to X")
- HOW_TO: Step-by-step how-to article (e.g. "how to achieve X")
- LISTICLE: List-based article (e.g. "10 tips for X")
- COMPARISON: Comparing products/options (e.g. "X vs Y: which is better?")
- REVIEW: Detailed product/service review (e.g. "X review: pros and cons")
- NEWS: News update or breaking coverage (e.g. "new technology X announced", trending topics, industry updates)
- TUTORIAL: Technical tutorial with examples (e.g. "X tutorial for beginners")
- CASE_STUDY: Real-world case with results (e.g. "how company X achieved Y")

Important guidelines:
- Keywords about new things, trends, updates, or emerging topics → usually NEWS
- Keywords about overviews or general topics without a clear how-to angle → usually REVIEW or BLOG_POST
- Keywords asking "how to" or implying a process → HOW_TO or TUTORIAL
- Broad informational keywords don't always mean GUIDE - choose the type that best matches what readers expect

CRITICAL LANGUAGE REQUIREMENT: ALL text output (reasoning AND briefPlan) MUST be written entirely in ${userLanguage}. Do NOT mix languages. Do NOT write reasoning in English if the required language is Hebrew.`,
      prompt: `Keyword: "${keyword.keyword}"
Search intent: ${primaryIntent}
Required output language: ${userLanguage}
${keyword.tags?.length > 0 ? `Tags: ${keyword.tags.join(', ')}` : ''}

What is the best article type for this keyword? Write your reasoning and content plan in ${userLanguage}.`,
      schema: SuggestionSchema,
      temperature: 0.3,
      operation: 'SUGGEST_ARTICLE_TYPE',
      metadata: { keyword: keyword.keyword, intent: primaryIntent },
    });

    // Cache the suggestion on the keyword
    await prisma.keyword.update({
      where: { id: keywordId },
      data: {
        aiSuggestion: {
          articleType: result.articleType,
          reasoning: result.reasoning,
          briefPlan: result.briefPlan,
          locale,
          analyzedAt: new Date().toISOString(),
        },
      },
    });

    return NextResponse.json({
      suggestion: result,
      keyword: keyword.keyword,
      intent: primaryIntent,
      cached: false,
    });
  } catch (error) {
    console.error('[suggest-article-type] Error:', error);
    return NextResponse.json(
      { error: 'Failed to suggest article type' },
      { status: 500 }
    );
  }
}
