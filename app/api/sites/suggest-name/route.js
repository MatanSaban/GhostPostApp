import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { generateTextResponse } from '@/lib/ai/gemini';
import { trackAIUsage } from '@/lib/ai/credits-service';
import { enforceCredits } from '@/lib/account-limits';

const SESSION_COOKIE = 'user_session';

// Verify user is authenticated and get account info
async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { 
        id: true,
        lastSelectedAccountId: true,
        accountMemberships: {
          select: { accountId: true },
          take: 1,
        },
      },
    });

    return user;
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

// POST - Suggest a name for a website using AI
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { url, pageTitle } = body;

    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    // ── Enforce AI credit limit ──────────────────────────────
    const accountId = user.lastSelectedAccountId || user.accountMemberships?.[0]?.accountId;
    if (accountId) {
      const creditCheck = await enforceCredits(accountId, 1); // GENERIC = 1 credit
      if (!creditCheck.allowed) {
        return NextResponse.json(creditCheck, { status: 402 });
      }
    }

    // Extract domain from URL
    let domain = '';
    try {
      const urlObj = new URL(url);
      domain = urlObj.hostname.replace(/^www\./, '');
    } catch {
      domain = url;
    }

    const prompt = `You are helping a user name their website in a CMS dashboard.

Website URL: ${url}
Domain: ${domain}
${pageTitle ? `Page Title: ${pageTitle}` : ''}

Based on this information, suggest a SHORT and INFORMATIVE name for this website that would be convenient for the user to identify it in a dashboard.

Rules:
- Maximum 2-3 words
- Should be memorable and recognizable
- If it's a business, use the business name
- If it's a personal site, use a descriptive short name
- Avoid generic terms like "Website" or "Site"
- Do NOT include "www" or domain extensions (.com, .co.il, etc.)

Respond with ONLY the suggested name, nothing else.`;

    const suggestedName = await generateTextResponse({
      system: 'You are a helpful assistant that suggests short, memorable names for websites.',
      prompt,
      maxTokens: 50,
      temperature: 0.3,
    });

    // Clean up the response
    const cleanName = suggestedName.trim().replace(/^["']|["']$/g, '');

    // Track AI credits usage
    if (accountId) {
      await trackAIUsage({
        accountId,
        userId: user.id,
        operation: 'GENERIC',
        description: `Suggested site name for ${url}`,
        metadata: {
          websiteUrl: url,
          suggestedName: cleanName,
          descriptionKey: 'suggestedSiteName',
          descriptionParams: { url },
        },
      });
    }

    return NextResponse.json({ suggestedName: cleanName });
  } catch (error) {
    console.error('Failed to suggest site name:', error);
    return NextResponse.json(
      { error: 'Failed to suggest name' },
      { status: 500 }
    );
  }
}
