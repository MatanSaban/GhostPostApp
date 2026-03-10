/**
 * Suggest Related Keywords API
 * 
 * Analyzes a list of candidate keywords against a main keyword using AI
 * to determine which ones should be grouped into the same article to avoid
 * keyword cannibalization.
 * 
 * The client performs pre-filtering (word matching + intent matching) and
 * sends only the candidates here for final AI determination.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { generateStructuredResponse } from '@/lib/ai/gemini';
import { z } from 'zod';

const SESSION_COOKIE = 'user_session';

const RelatedKeywordsSchema = z.object({
  relatedKeywordIds: z.array(z.string()).describe(
    'Array of keyword IDs from the candidates list that should be grouped with the main keyword article. Only include keywords that would create cannibalization if published as separate articles — i.e. they target essentially the same search intent and topic.'
  ),
});

async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) return null;
    return await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
  } catch {
    return null;
  }
}

export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { mainKeyword, mainIntent, candidates, locale } = body;

    if (!mainKeyword || !candidates || !Array.isArray(candidates)) {
      return NextResponse.json(
        { error: 'mainKeyword and candidates array are required' },
        { status: 400 }
      );
    }

    // If no candidates, return empty
    if (candidates.length === 0) {
      return NextResponse.json({ relatedKeywordIds: [] });
    }

    // Map locale to language name for the AI prompt
    const LOCALE_LANGUAGES = { he: 'Hebrew', en: 'English', ar: 'Arabic', es: 'Spanish', fr: 'French', de: 'German' };
    const userLanguage = LOCALE_LANGUAGES[locale] || 'the language of the keywords';

    // Build candidates text for the prompt
    const candidatesText = candidates
      .map(c => `- ID: "${c.id}" | Keyword: "${c.keyword}" | Intent: ${c.intent || 'unknown'}`)
      .join('\n');

    const result = await generateStructuredResponse({
      system: `You are an expert SEO strategist specializing in keyword cannibalization prevention.

Your task: Given a MAIN keyword and a list of CANDIDATE keywords, determine which candidates should be targeted in the SAME article as the main keyword to avoid cannibalization.

Two keywords should be grouped together when:
1. They target essentially the same topic/search intent (e.g., "גני ילדים בחיפה" and "גן ילדים בחיפה" — plural vs singular)
2. A user searching either keyword would expect the same type of content
3. Publishing separate articles for them would cause Google to split rankings between the two pages
4. They are variations (singular/plural, word order changes, with/without prepositions, synonyms for the same concept)

Two keywords should NOT be grouped when:
1. They target different subtopics, even if they share some words
2. They have fundamentally different search intents
3. They deserve their own dedicated articles

Be conservative — only group keywords that would clearly cannibalize each other. The keywords are in ${userLanguage}.`,
      prompt: `Main keyword: "${mainKeyword}"
Main intent: ${mainIntent || 'unknown'}

Candidate keywords to evaluate:
${candidatesText}

Which of these candidates should be grouped into the same article as "${mainKeyword}"? Return only their IDs.`,
      schema: RelatedKeywordsSchema,
      temperature: 0.2,
      operation: 'SUGGEST_RELATED_KEYWORDS',
      metadata: { mainKeyword, candidateCount: candidates.length },
    });

    return NextResponse.json({
      relatedKeywordIds: result.relatedKeywordIds || [],
    });
  } catch (error) {
    console.error('[suggest-related] Error:', error);
    return NextResponse.json(
      { error: 'Failed to suggest related keywords' },
      { status: 500 }
    );
  }
}
