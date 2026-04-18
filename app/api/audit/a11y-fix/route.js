import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { deductAiCredits } from '@/lib/account-utils';
import { enforceCredits } from '@/lib/account-limits';
import { generateText } from 'ai';
import { google } from '@/lib/ai/vertex-provider.js';
import { makePluginRequest } from '@/lib/wp-api-client';

const SESSION_COOKIE = 'user_session';
const FIX_CREDIT_COST = 2;

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
        accountMemberships: {
          select: { accountId: true },
        },
      },
    });
  } catch {
    return null;
  }
}

/**
 * POST: AI accessibility fix - generate alt text from element screenshot
 *
 * Body: { auditId, siteId, pageUrl, selector, elementScreenshot (base64), imageSrc }
 *
 * Cost: 2 AI Credits
 * Uses Gemini Vision to analyze the element screenshot and produce a descriptive alt text.
 */
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { auditId, siteId, pageUrl, selector, elementScreenshot, imageSrc } = body;

    if (!auditId || !siteId || !pageUrl) {
      return NextResponse.json(
        { error: 'Missing required fields: auditId, siteId, pageUrl' },
        { status: 400 }
      );
    }

    // Verify site ownership
    const accountIds = user.accountMemberships.map(m => m.accountId);
    const site = await prisma.site.findFirst({
      where: user.isSuperAdmin ? { id: siteId } : { id: siteId, accountId: { in: accountIds } },
      select: { id: true, url: true, name: true, accountId: true, connectionStatus: true },
    });
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Check credits
    const creditCheck = await enforceCredits(site.accountId, FIX_CREDIT_COST);
    if (!creditCheck.allowed) {
      return NextResponse.json(
        { error: creditCheck.error || 'Insufficient AI credits', code: 'INSUFFICIENT_CREDITS', resourceKey: 'aiCredits' },
        { status: 402 }
      );
    }

    // Build the prompt for Gemini Vision
    const messages = [];

    if (elementScreenshot) {
      // Use Gemini Vision to analyze the image
      messages.push({
        role: 'user',
        content: [
          {
            type: 'image',
            image: Buffer.from(elementScreenshot, 'base64'),
            mimeType: 'image/jpeg',
          },
          {
            type: 'text',
            text: `You are an accessibility expert. Analyze this image and generate a concise, descriptive alt text for it. The image is from the page "${pageUrl}" on the site "${site.name}".

Requirements:
- The alt text should describe the content and function of the image
- Keep it under 125 characters
- Be specific and descriptive, not generic
- If it's a decorative image with no content, respond with: decorative
- Do not start with "Image of" or "Picture of"

${imageSrc ? `Image file name: ${imageSrc.split('/').pop()?.split('?')[0]}` : ''}

Respond with ONLY the alt text, nothing else.`,
          },
        ],
      });
    } else {
      // Fallback: generate alt text based on context only
      messages.push({
        role: 'user',
        content: `You are an accessibility expert. Generate a descriptive alt text for an image on "${pageUrl}" (site: "${site.name}").
${imageSrc ? `Image URL: ${imageSrc}` : ''}
${selector ? `CSS selector: ${selector}` : ''}

Requirements:
- Under 125 characters
- Be specific and descriptive
- If you can infer content from the URL/filename, use that
- If not enough info, respond with: decorative

Respond with ONLY the alt text, nothing else.`,
      });
    }

    const result = await generateText({
      model: google('gemini-2.5-pro'),
      messages,
      temperature: 0.3,
      maxTokens: 200,
    });

    const altText = (result.text || '').trim();

    // Deduct credits after successful AI call (with token metadata for dashboard)
    const usage = result.usage || {};
    const deduction = await deductAiCredits(site.accountId, FIX_CREDIT_COST, {
      userId: user.id,
      siteId,
      source: 'a11y_alt_fix',
      description: `AI Alt Text: ${imageSrc || selector || pageUrl}`,
      metadata: {
        inputTokens: usage.inputTokens || 0,
        outputTokens: usage.outputTokens || 0,
        totalTokens: usage.totalTokens || 0,
        model: 'gemini-2.5-pro',
      },
    });

    if (!deduction.success) {
      console.error('[A11yFix] Credit deduction failed after AI:', deduction.error);
    }

    // Try to push the fix via WordPress plugin if connected
    let pushed = false;
    let pushError = null;

    if (site.connectionStatus === 'connected' && imageSrc) {
      try {
        const pathName = new URL(pageUrl).pathname.replace(/^\/|\/$/g, '');
        await makePluginRequest(site, '/seo-fix', 'POST', {
          slug: pathName || 'homepage',
          url: pageUrl,
          seoData: {},
          altTexts: [{ imageUrl: imageSrc, altText }],
        });
        pushed = true;
      } catch (err) {
        pushError = err.message;
        console.warn('[A11yFix] Plugin push failed:', err.message);
      }
    }

    return NextResponse.json({
      success: true,
      altText,
      pushed,
      pushError,
      creditsUsed: FIX_CREDIT_COST,
      creditsUpdated: deduction.success ? { used: deduction.usedTotal } : undefined,
    });
  } catch (error) {
    console.error('[API/audit/a11y-fix] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
