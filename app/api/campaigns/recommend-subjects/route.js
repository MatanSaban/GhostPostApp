import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { generateStructuredResponse } from '@/lib/ai/gemini';
import { z } from 'zod';
import { createHash } from 'crypto';

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

function buildCacheKey(mainKeyword, subjectTitles, postsCount) {
  const raw = `recommend:${mainKeyword}:${postsCount}:${subjectTitles.sort().join('|')}`;
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * POST - AI recommends the best subjects and explains why
 * Input: { mainKeyword, subjects: [{ title, explanation, articleType, intent }], postsCount, locale }
 * Output: { recommendedIndices: number[], explanation: string }
 *
 * Caches the recommendation per locale in the AiCache table.
 */
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { mainKeyword, subjects, postsCount, locale } = await request.json();

    if (!mainKeyword || !subjects?.length || !postsCount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const subjectTitles = subjects.map(s => s.title);
    const cacheKey = buildCacheKey(mainKeyword, subjectTitles, postsCount);

    // Check cache first
    const cached = await prisma.aiCache.findUnique({
      where: { key_locale: { key: cacheKey, locale } },
    });

    if (cached) {
      return NextResponse.json(cached.content);
    }

    // Generate AI recommendation
    const isHebrew = locale === 'he';

    const subjectList = subjects
      .map((s, i) => `[${i}] "${s.title}" — ${s.articleType} — ${s.intent}\n    ${s.explanation}`)
      .join('\n');

    const system = `You are an expert SEO Content Strategist. You are helping a user build a topic cluster around the main keyword "${mainKeyword}".

The user generated ${subjects.length} subject ideas and needs to select exactly ${postsCount} of them for their content plan.

Your job:
1. Pick the ${postsCount} best subjects that together create the strongest, most comprehensive topic cluster.
2. Prioritize diversity of search intents and article types.
3. Prefer subjects that cover high-value angles (how-to, comparison, mistakes, tools, etc.) and together maximize topical authority.
4. Write a short, friendly explanation (2-3 sentences) about WHY this combination is strong.

${isHebrew ? 'Write the explanation in Hebrew.' : 'Write the explanation in English.'}`;

    const prompt = `Here are all ${subjects.length} available subjects:\n\n${subjectList}\n\nSelect the best ${postsCount} subjects by their index numbers and explain your recommendation.`;

    const schema = z.object({
      recommendedIndices: z.array(z.number()).length(postsCount)
        .describe('Array of subject indices (0-based) for the recommended subjects'),
      explanation: z.string()
        .describe('Short friendly explanation of why this combination was chosen'),
    });

    const result = await generateStructuredResponse({
      system,
      prompt,
      schema,
      temperature: 0.3,
      operation: 'RECOMMEND_SUBJECTS',
      metadata: { mainKeyword, postsCount, totalSubjects: subjects.length },
    });

    // Validate indices are within bounds
    const validIndices = result.recommendedIndices.filter(i => i >= 0 && i < subjects.length);
    const output = {
      recommendedIndices: validIndices,
      explanation: result.explanation,
    };

    // Cache the result
    await prisma.aiCache.create({
      data: {
        key: cacheKey,
        locale,
        content: output,
      },
    });

    return NextResponse.json(output);
  } catch (err) {
    console.error('Failed to recommend subjects:', err);
    return NextResponse.json(
      { error: 'Failed to generate recommendation' },
      { status: 500 }
    );
  }
}
