import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { generateTextResponse } from '@/lib/ai/gemini';

const SESSION_COOKIE = 'user_session';

/**
 * POST /api/backlinks/generate-listing
 * Uses AI to generate a title and description for a backlink listing.
 * Body: { domain, businessName, businessAbout, businessCategory, language }
 */
export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, accountMemberships: { select: { accountId: true }, take: 1 } },
    });
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { domain, businessName, businessAbout, businessCategory, language } = body;

    if (!domain) {
      return NextResponse.json({ error: 'domain is required' }, { status: 400 });
    }

    const isHebrew = language === 'he';
    const langInstruction = isHebrew
      ? 'Write entirely in Hebrew.'
      : 'Write entirely in English.';

    const siteInfo = [
      `Domain: ${domain}`,
      businessName ? `Business name: ${businessName}` : null,
      businessAbout ? `About: ${businessAbout}` : null,
      businessCategory ? `Category: ${businessCategory}` : null,
    ].filter(Boolean).join('\n');

    const system = `You are an expert SEO copywriter specializing in backlink marketplaces. Your job is to write compelling listing titles and descriptions that attract backlink buyers. ${langInstruction}`;

    const prompt = `Generate a title and description for a backlink listing on a marketplace.

Website info:
${siteInfo}

Requirements:
- Title: A short, compelling title (max 80 chars) that sells the opportunity to get a backlink from this website. Focus on the website's niche, authority and value.
- Description: 2-3 sentences (max 300 chars) explaining what the website is about, its audience, and why a backlink from it is valuable for SEO.
- Be professional and factual. Do not exaggerate.
- ${langInstruction}

Respond in exactly this format (no markdown, no extra text):
TITLE: <the title>
DESCRIPTION: <the description>`;

    const result = await generateTextResponse({
      system,
      prompt,
      temperature: 0.7,
      maxTokens: 512,
      operation: 'BACKLINK_LISTING',
      metadata: { domain, language },
      accountId: user.accountMemberships?.[0]?.accountId,
      userId: user.id,
    });

    // Parse the response
    const titleMatch = result.match(/TITLE:\s*(.+)/i);
    const descMatch = result.match(/DESCRIPTION:\s*(.+)/is);

    const title = titleMatch?.[1]?.trim() || '';
    const description = descMatch?.[1]?.trim() || '';

    return NextResponse.json({ title, description });
  } catch (error) {
    console.error('Error generating backlink listing:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
