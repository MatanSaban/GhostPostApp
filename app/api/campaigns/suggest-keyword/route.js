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

/**
 * POST - AI suggests the main keyword for a pillar page
 * Input: { siteId, pillarEntityId?, pillarPageUrl, locale }
 * Output: { suggestions: [{ keyword, explanation }] }
 */
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { siteId, pillarEntityId, pillarPageUrl, locale } = await request.json();

    if (!siteId || !pillarPageUrl) {
      return NextResponse.json({ error: 'siteId and pillarPageUrl are required' }, { status: 400 });
    }

    // Fetch site accountId for credit tracking
    const site = await prisma.site.findUnique({ where: { id: siteId }, select: { accountId: true } });

    // Fetch entity data if we have an entity ID (for title, content, etc.)
    let entityContext = '';
    if (pillarEntityId) {
      const entity = await prisma.siteEntity.findUnique({
        where: { id: pillarEntityId },
        select: { title: true, slug: true, excerpt: true, seoData: true },
      });
      if (entity) {
        const seo = entity.seoData || {};
        entityContext = `
Page title: ${entity.title}
URL slug: ${entity.slug}
${entity.excerpt ? `Excerpt: ${entity.excerpt.slice(0, 500)}` : ''}
${seo.focusKeyword ? `Current SEO focus keyword: ${seo.focusKeyword}` : ''}
${seo.metaTitle ? `Meta title: ${seo.metaTitle}` : ''}
${seo.metaDescription ? `Meta description: ${seo.metaDescription}` : ''}`;
      }
    }

    const isHebrew = locale === 'he';

    const system = `You are an SEO expert. Analyze the provided pillar page and suggest the best main keyword (seed keyword) for building a topic cluster around it.

The main keyword should be:
- A broad, high-volume keyword that represents the core topic of the page
- Suitable as the anchor for a topic cluster (supporting articles will target long-tail variations)
- 1-4 words long (ideally 2-3 words)
- Natural and commonly searched

Provide 3 suggestions ranked from best to least, with a brief explanation of why each is a good choice.
${isHebrew ? 'All keywords and explanations must be in Hebrew.' : ''}`;

    const prompt = `Suggest the main keyword for this pillar page:
URL: ${pillarPageUrl}
${entityContext}

Return 3 keyword suggestions.`;

    const schema = z.object({
      suggestions: z.array(
        z.object({
          keyword: z.string().describe('The suggested main keyword'),
          explanation: z.string().describe('Brief explanation of why this keyword is good'),
        })
      ).length(3),
    });

    const result = await generateStructuredResponse({
      system,
      prompt,
      schema,
      temperature: 0.5,
      operation: 'SUGGEST_KEYWORD',
      metadata: { siteId, pillarPageUrl },
      accountId: site?.accountId,
      userId: user.id,
      siteId,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('Failed to suggest keyword:', err);
    return NextResponse.json(
      { error: 'Failed to suggest keyword' },
      { status: 500 }
    );
  }
}
