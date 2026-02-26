import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { generateStructuredResponse } from '@/lib/ai/gemini';
import { z } from 'zod';

const SESSION_COOKIE = 'user_session';

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!userId) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });
}

async function verifySiteAccess(siteId, userId) {
  return prisma.site.findFirst({
    where: {
      id: siteId,
      account: { members: { some: { userId } } },
    },
    select: { id: true },
  });
}

/**
 * POST - Generate AI-powered subject/title suggestions
 * 
 * Input: { siteId, selectedKeywordIds, manualKeywords, articleTypes, postsCount, locale }
 * Output: { suggestions: [{ keyword, subjects: [{ title, explanation, articleType }] }] }
 */
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { siteId, selectedKeywordIds, manualKeywords, articleTypes, postsCount, locale } = await request.json();

    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
    }

    const site = await verifySiteAccess(siteId, user.id);
    if (!site) {
      return NextResponse.json({ error: 'Site not found or access denied' }, { status: 403 });
    }

    // 1. Resolve selected keyword IDs to text
    let resolvedKeywords = [];
    if (selectedKeywordIds?.length > 0) {
      const dbKeywords = await prisma.keyword.findMany({
        where: { id: { in: selectedKeywordIds }, siteId },
        select: { id: true, keyword: true },
      });
      resolvedKeywords = dbKeywords.map(k => k.keyword);
    }

    // 2. Combine with manual keywords (deduplicate)
    const allKeywords = [...new Set([...resolvedKeywords, ...(manualKeywords || [])])];

    if (allKeywords.length === 0) {
      return NextResponse.json({ error: 'No keywords provided' }, { status: 400 });
    }

    // 3. Collect article type labels for the prompt
    const articleTypeLabels = {
      SEO: 'SEO Article',
      BLOG_POST: 'Blog Post',
      GUIDE: 'Comprehensive Guide',
      HOW_TO: 'How-to Article',
      LISTICLE: 'Listicle',
      COMPARISON: 'Comparison Article',
      REVIEW: 'Review Article',
      NEWS: 'News Article',
      TUTORIAL: 'Tutorial',
      CASE_STUDY: 'Case Study',
    };

    const selectedTypeIds = articleTypes.map(at => at.id);
    const selectedTypeLabels = selectedTypeIds.map(id => articleTypeLabels[id] || id).join(', ');

    // 4. Fetch existing content titles + slugs for anti-cannibalization (TITLES ONLY — no body)
    const existingEntities = await prisma.siteEntity.findMany({
      where: { siteId, status: 'PUBLISHED' },
      select: { title: true, slug: true },
    });

    const existingTitles = existingEntities.map(e => `- ${e.title} (/${e.slug})`).join('\n');

    // 5. Build the AI prompt
    const isHebrew = locale === 'he';
    const currentYear = new Date().getFullYear();

    const system = `You are an SEO Content Strategist. The current year is ${currentYear}. Your goal is to generate blog post titles that target specific keywords while avoiding topics that already exist on the site.

For each keyword provided, generate exactly 3 distinct subject suggestions. Each suggestion must include:
- A catchy, SEO-optimized title
- A short explanation (1-2 sentences) describing what the article will cover and its unique angle
- The most fitting article type from the available types

Rules:
1. Titles must be catchy, compelling, and SEO-optimized for the target keyword.
2. The target keyword (or a close variation) MUST appear in every title.
3. Do NOT suggest titles that are semantically identical or very similar to any title in the "Existing Content" list.
4. If the chosen article type is "Listicle", start the title with a number (e.g., "7 Ways to...", "10 Best...").
5. If the chosen article type is "Guide" or "How-to Article", use phrases like "How to...", "The Ultimate Guide to...", "A Complete Guide to...", "Step-by-Step:...".
6. If the chosen article type is "Comparison", use "vs", "Compared", or "Which is Better".
7. If the chosen article type is "Review", include "Review" or "Honest Review" in the title.
8. Each of the 3 suggestions should use a DIFFERENT article type when possible, and a different title structure/angle.
9. When mentioning years, use ${currentYear} or later. NEVER reference past years (${currentYear - 1} or earlier) unless historically relevant.
10. The articleType field must be one of these IDs: ${selectedTypeIds.join(', ')}.
${isHebrew ? `11. ALL titles and explanations MUST be written in Hebrew.` : `11. ALL titles and explanations MUST be written in English.`}`;

    const keywordsText = allKeywords.map((kw, i) => `${i + 1}. "${kw}"`).join('\n');

    const prompt = `Generate 3 subject suggestions for each of the following ${allKeywords.length} keywords:

${keywordsText}

Available Article Types: ${selectedTypeLabels}

The user plans to write ${postsCount} posts total, so provide varied and high-quality options they can choose from.

${existingTitles ? `Existing Content on the site (avoid semantic duplicates):\n${existingTitles}` : 'No existing content on the site yet.'}

Return exactly ${allKeywords.length} items, one per keyword, each with exactly 3 subject suggestions.`;

    // 6. Define the Zod schema for structured output
    const schema = z.object({
      suggestions: z.array(
        z.object({
          keyword: z.string().describe('The target keyword'),
          subjects: z.array(
            z.object({
              title: z.string().describe('SEO-optimized article title'),
              explanation: z.string().describe('1-2 sentence description of what the article will cover'),
              articleType: z.string().describe('The article type ID (e.g., BLOG_POST, GUIDE, LISTICLE)'),
            })
          ).length(3).describe('Exactly 3 subject suggestions'),
        })
      ).length(allKeywords.length),
    });

    // 7. Call Gemini
    const result = await generateStructuredResponse({
      system,
      prompt,
      schema,
      temperature: 0.8,
      operation: 'GENERATE_SUBJECTS',
      metadata: { siteId, postsCount, keywordsCount: allKeywords.length },
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('Failed to generate subjects:', err);
    return NextResponse.json(
      { error: 'Failed to generate subjects' },
      { status: 500 }
    );
  }
}
