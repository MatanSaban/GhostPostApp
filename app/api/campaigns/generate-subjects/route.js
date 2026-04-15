import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { MODELS } from '@/lib/ai/gemini';
import { logAIUsage } from '@/lib/ai/credits.js';
import { google } from '@/lib/ai/vertex-provider.js';
import { streamText, Output, jsonSchema } from 'ai';
import { z } from 'zod';
import { toJSONSchema } from 'zod/v4';

const SESSION_COOKIE = 'user_session';

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!userId) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, isSuperAdmin: true },
  });
}

async function verifySiteAccess(siteId, user) {
  const where = user.isSuperAdmin
    ? { id: siteId }
    : { id: siteId, account: { members: { some: { userId: user.id } } } };
  return prisma.site.findFirst({ where,
    select: { id: true } });
}

/**
 * POST - Generate AI-powered subject/title suggestions for a Topic Cluster
 *
 * Input: { siteId, mainKeyword, pillarPageUrl, articleTypes, postsCount, locale }
 * Output: { suggestions: [{ title, explanation, articleType, intent }] }
 *
 * Anti-Cannibalization: 3 layers
 *  1. Data Fetching  - existing published content + planned content from other campaigns
 *  2. Prompt Engineering - strict rules injected into AI system prompt
 *  3. Output Format  - each suggestion includes an `intent` field for separation verification
 */
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { siteId, mainKeyword, pillarPageUrl, articleTypes, postsCount, locale } = await request.json();

    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
    }

    if (!mainKeyword?.trim()) {
      return NextResponse.json({ error: 'mainKeyword is required' }, { status: 400 });
    }

    const site = await verifySiteAccess(siteId, user);
    if (!site) {
      return NextResponse.json({ error: 'Site not found or access denied' }, { status: 403 });
    }

    // ── LAYER 1: Data Fetching (Anti-Cannibalization Context) ────────────

    // 1a. Existing published content titles + slugs
    const existingEntities = await prisma.siteEntity.findMany({
      where: { siteId, status: 'PUBLISHED' },
      select: { title: true, slug: true },
    });

    const existingTitles = existingEntities
      .map(e => `- ${e.title} (/${e.slug})`)
      .join('\n');

    // 1b. Planned content from other ACTIVE campaigns
    const activeCampaigns = await prisma.campaign.findMany({
      where: {
        siteId,
        status: { in: ['ACTIVE', 'DRAFT'] },
      },
      select: {
        id: true,
        subjects: true,
        generatedPlan: true,
      },
    });

    const plannedTitles = [];
    for (const campaign of activeCampaigns) {
      // From subjects (stored as JSON strings)
      if (campaign.subjects?.length) {
        for (const s of campaign.subjects) {
          try {
            const parsed = typeof s === 'string' ? JSON.parse(s) : s;
            if (parsed?.title) plannedTitles.push(parsed.title);
          } catch { /* skip */ }
        }
      }
      // From generated plan
      if (Array.isArray(campaign.generatedPlan)) {
        for (const p of campaign.generatedPlan) {
          if (p?.title) plannedTitles.push(p.title);
        }
      }
    }

    const plannedContent = plannedTitles.length > 0
      ? plannedTitles.map(t => `- ${t}`).join('\n')
      : '';

    // ── LAYER 2: Prompt Engineering ──────────────────────────────────────

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
    const totalSuggestions = postsCount * 3;

    const isHebrew = locale === 'he';
    const currentYear = new Date().getFullYear();

    const system = `You are an SEO Content Strategist specializing in Topic Cluster architecture. The current year is ${currentYear}.

Your task: Generate ${totalSuggestions} cluster article subject ideas that support the main keyword "${mainKeyword}"${pillarPageUrl ? ` and its pillar page at ${pillarPageUrl}` : ''}.

=== ANTI-CANNIBALIZATION RULES (STRICT) ===

Rule 1 - No Cannibalization: Review the provided "Existing Content" and "Planned Content" lists below. DO NOT suggest any title that overlaps in Search Intent with these existing or planned articles. Each new suggestion must target a UNIQUE search query that is not already covered.

Rule 2 - Intra-Cluster Separation: You are generating ${totalSuggestions} subject ideas. Each idea MUST answer a distinctly different question or serve a completely different user intent related to "${mainKeyword}" (e.g., Pricing, How-to, Mistakes to avoid, Comparison, Case Study, Beginner guide, Advanced techniques, Tools/Resources, Statistics, Trends, Checklist). Do NOT provide variations of the exact same topic.

Rule 3 - Relevance to Pillar Page: All subjects must logically act as supporting cluster articles for the main keyword "${mainKeyword}". They should be narrow enough to be specific and target a long-tail variation, but broad enough to write a full article about.

=== TITLE RULES ===

1. Titles must be catchy, compelling, and SEO-optimized. The main keyword "${mainKeyword}" (or a close semantic variation) should appear in every title.
2. If the article type is "Listicle", start the title with a number (e.g., "7 Ways to...", "10 Best...").
3. If the article type is "Guide" or "How-to Article", use phrases like "How to...", "The Ultimate Guide to...", "Step-by-Step:...".
4. If the article type is "Comparison", use "vs", "Compared", or "Which is Better".
5. If the article type is "Review", include "Review" or "Honest Review" in the title.
6. Each suggestion should use a varied title structure/angle to maximize topic coverage.
7. When mentioning years, use ${currentYear} or later. NEVER reference past years.
8. The articleType field must be one of these IDs: ${selectedTypeIds.join(', ')}.
9. Distribute article types roughly proportionally based on the user's allocation: ${articleTypes.map(at => `${at.id}(${at.count})`).join(', ')}.

=== OUTPUT FORMAT ===

For each suggestion, include:
- title: SEO-optimized article title
- explanation: 1-2 sentence description of what the article covers and its unique angle
- articleType: One of the allowed type IDs
- intent: A short search intent classification (e.g., "Informational - How-to", "Informational - Pricing", "Transactional - Comparison", "Navigational - Tools", "Commercial - Review")

${isHebrew ? 'ALL titles and explanations MUST be written in Hebrew. The intent field should be in English.' : 'ALL titles and explanations MUST be written in English. The intent field should be in English.'}`;

    const existingSection = existingTitles
      ? `\nExisting Content on the site (AVOID semantic duplicates):\n${existingTitles}`
      : '\nNo existing content on the site yet.';

    const plannedSection = plannedContent
      ? `\nPlanned Content from other campaigns (AVOID overlap):\n${plannedContent}`
      : '\nNo planned content from other campaigns.';

    const prompt = `Generate exactly ${totalSuggestions} unique cluster article subject ideas for the main keyword: "${mainKeyword}"

Available Article Types: ${selectedTypeLabels}

The user plans to write ${postsCount} posts total, so provide ${totalSuggestions} options (3x) they can choose from. Ensure maximum topic diversity.
${existingSection}
${plannedSection}

Return exactly ${totalSuggestions} suggestions as a flat array.`;

    // ── LAYER 3: Output Format with Intent Field ─────────────────────────

    const schema = z.object({
      suggestions: z.array(
        z.object({
          title: z.string().describe('SEO-optimized article title'),
          explanation: z.string().describe('1-2 sentence description of what the article will cover'),
          articleType: z.string().describe('The article type ID (e.g., BLOG_POST, GUIDE, LISTICLE)'),
          intent: z.string().describe('Search intent classification (e.g., "Informational - How-to", "Transactional - Comparison")'),
        })
      ).length(totalSuggestions),
    });

    // Convert Zod v4 schema to JSON Schema for AI SDK compatibility
    const jsonSchemaObj = toJSONSchema(schema, { target: 'draft-7', io: 'input', reused: 'inline' });

    const model = google(MODELS.TEXT);
    const result = streamText({
      model,
      system,
      prompt,
      output: Output.object({
        schema: jsonSchema(jsonSchemaObj, {
          validate: async (value) => {
            const parsed = await schema.safeParseAsync(value);
            return parsed.success
              ? { success: true, value: parsed.data }
              : { success: false, error: parsed.error };
          },
        }),
      }),
      temperature: 0.8,
    });

    // Stream individual suggestions as SSE events
    const encoder = new TextEncoder();
    let sentCount = 0;

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const partialOutput of result.experimental_partialOutputStream) {
            const suggestions = partialOutput?.suggestions;
            if (!Array.isArray(suggestions)) continue;

            // Send newly complete items (all 4 fields present)
            for (let i = sentCount; i < suggestions.length; i++) {
              const s = suggestions[i];
              if (s?.title && s?.explanation && s?.articleType && s?.intent) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(s)}\n\n`));
                sentCount = i + 1;
              } else {
                break; // Stop at first incomplete item
              }
            }
          }

          // Log AI usage
          const usage = await result.usage;
          logAIUsage({
            operation: 'GENERATE_SUBJECTS',
            inputTokens: usage?.promptTokens || 0,
            outputTokens: usage?.completionTokens || 0,
            totalTokens: usage?.totalTokens || 0,
            model: MODELS.TEXT,
            metadata: { siteId, postsCount, mainKeyword },
          });

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (err) {
          console.error('Stream error:', err);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err) {
    console.error('Failed to generate subjects:', err);
    return NextResponse.json(
      { error: 'Failed to generate subjects' },
      { status: 500 }
    );
  }
}
