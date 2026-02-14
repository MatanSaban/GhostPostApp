import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { generateStructuredResponse } from '@/lib/ai/gemini';
import { trackAIUsage } from '@/lib/ai/credits-service';
import { enforceCredits } from '@/lib/account-limits';
import { z } from 'zod';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

// Verify user has access to the site
async function verifyUserSiteAccess(siteId) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return { authorized: false, error: 'Unauthorized' };
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        accountMemberships: {
          select: { accountId: true },
        },
      },
    });

    if (!user) {
      return { authorized: false, error: 'User not found' };
    }

    const accountIds = user.accountMemberships.map(m => m.accountId);

    const site = await prisma.site.findFirst({
      where: {
        id: siteId,
        accountId: { in: accountIds },
      },
      select: { id: true, name: true, url: true, accountId: true },
    });

    if (!site) {
      return { authorized: false, error: 'Site not found or access denied' };
    }

    return { authorized: true, userId: user.id, site };
  } catch (error) {
    console.error('Auth error:', error);
    return { authorized: false, error: 'Authentication error' };
  }
}

/**
 * POST /api/sites/[id]/tools/ai-image-optimize
 * 
 * Uses AI to analyze an image and generate:
 * - SEO-friendly filename
 * - Descriptive alt text
 * 
 * Body: {
 *   imageUrl: string,       // URL of the image to analyze
 *   currentFilename: string, // Current filename (for context)
 *   pageContext?: string,    // Optional: page content/keywords for context
 *   language?: string,       // Language for alt text (default: 'en')
 * }
 */
export async function POST(req, { params }) {
  try {
    const { id } = await params;
    
    // Verify user has access to this site
    const authResult = await verifyUserSiteAccess(id);
    if (!authResult.authorized) {
      return NextResponse.json(
        { error: authResult.error },
        { status: 401 }
      );
    }
    
    const { userId, site } = authResult;
    const body = await req.json();
    const { imageUrl, currentFilename, pageContext, language = 'en' } = body;

    if (!imageUrl) {
      return NextResponse.json(
        { error: 'Image URL is required' },
        { status: 400 }
      );
    }

    // ── Enforce AI credit limit ──────────────────────────────
    const creditCheck = await enforceCredits(site.accountId, 1); // IMAGE_ALT_OPTIMIZATION = 1 credit
    if (!creditCheck.allowed) {
      return NextResponse.json(creditCheck, { status: 402 });
    }

    // Define the output schema
    const imageOptimizationSchema = z.object({
      suggestedFilename: z.string().describe('SEO-friendly filename without extension, using lowercase letters, numbers, and hyphens only. Should describe the image content.'),
      altText: z.string().describe('Descriptive alt text for accessibility and SEO. Should be concise but descriptive (50-125 characters).'),
      confidence: z.number().min(0).max(1).describe('Confidence level of the analysis (0-1)'),
      reasoning: z.string().describe('Brief explanation of why this filename and alt text were chosen'),
    });

    // Build the prompt
    const systemPrompt = `You are an expert SEO specialist and accessibility expert. Your task is to analyze images and generate:
1. SEO-friendly filenames that describe the image content
2. Descriptive alt text that helps visually impaired users and improves SEO

FILENAME RULES:
- Use lowercase only
- Use hyphens to separate words (no underscores or spaces)
- Keep it concise but descriptive (3-6 words typically)
- Include relevant keywords
- No special characters except hyphens
- Do not include file extension

ALT TEXT RULES:
- Be descriptive but concise (50-125 characters)
- Describe what's actually in the image
- Include relevant keywords naturally
- Don't start with "Image of" or "Picture of"
- Consider the page context if provided
- Write in the specified language

Website: ${site.name} (${site.url})`;

    const userPrompt = `Analyze this image and generate an SEO-optimized filename and alt text.

Image URL: ${imageUrl}
Current filename: ${currentFilename}
${pageContext ? `Page context/keywords: ${pageContext}` : ''}
Target language: ${language}

Based on the image content, generate:
1. A descriptive, SEO-friendly filename
2. Helpful alt text for accessibility and SEO`;

    // Call the AI
    const result = await generateStructuredResponse({
      system: systemPrompt,
      prompt: userPrompt,
      schema: imageOptimizationSchema,
      temperature: 0.3, // Lower temperature for more consistent results
    });

    // Track AI credits usage
    let creditsUsed = 0;
    if (site.accountId) {
      const trackResult = await trackAIUsage({
        accountId: site.accountId,
        userId,
        siteId: site.id,
        operation: 'IMAGE_ALT_OPTIMIZATION',
        description: `Optimized image alt text`,
        metadata: {
          websiteUrl: site.url,
          imageUrl,
          suggestedFilename: result.suggestedFilename,
          descriptionKey: 'optimizedImageAlt',
          descriptionParams: { filename: result.suggestedFilename },
        },
      });
      
      if (trackResult.success) {
        creditsUsed = trackResult.totalUsed;
      }
    }

    return NextResponse.json({
      success: true,
      ...result,
      // Include updated credits for frontend to update UI
      creditsUpdated: creditsUsed > 0 ? { used: creditsUsed } : null,
    });
  } catch (error) {
    console.error('AI image optimization error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to analyze image' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/sites/[id]/tools/ai-image-optimize
 * 
 * Batch analyze multiple images
 */
export async function PUT(req, { params }) {
  try {
    const { id } = await params;

    // Verify user has access to this site
    const authResult = await verifyUserSiteAccess(id);
    if (!authResult.authorized) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { site, user } = authResult;

    const body = await req.json();
    const { images, language = 'en' } = body;

    if (!images || !Array.isArray(images) || images.length === 0) {
      return NextResponse.json(
        { error: 'Images array is required' },
        { status: 400 }
      );
    }

    // Limit batch size
    if (images.length > 10) {
      return NextResponse.json(
        { error: 'Maximum 10 images per batch' },
        { status: 400 }
      );
    }

    // ── Enforce AI credit limit (1 credit per image) ─────────
    const creditCheck = await enforceCredits(site.accountId, images.length); // 1 credit × N images
    if (!creditCheck.allowed) {
      return NextResponse.json(creditCheck, { status: 402 });
    }

    // Define the batch output schema
    const batchSchema = z.object({
      results: z.array(z.object({
        imageUrl: z.string(),
        suggestedFilename: z.string(),
        altText: z.string(),
        confidence: z.number().min(0).max(1),
      })),
    });

    const systemPrompt = `You are an expert SEO specialist. Analyze multiple images and generate SEO-friendly filenames and alt text for each.

FILENAME RULES:
- Lowercase only, hyphens between words
- Concise but descriptive (3-6 words)
- No extension, no special characters

ALT TEXT RULES:
- 50-125 characters
- Descriptive and accessible
- Don't start with "Image of"
- Language: ${language}

Website: ${site.name} (${site.url})`;

    const imageList = images.map((img, i) => `${i + 1}. URL: ${img.url}\n   Current: ${img.currentFilename || 'unknown'}`).join('\n');

    const userPrompt = `Analyze these images and generate optimized filenames and alt text for each:

${imageList}

Return results for all images.`;

    const result = await generateStructuredResponse({
      system: systemPrompt,
      prompt: userPrompt,
      schema: batchSchema,
      temperature: 0.3,
    });

    // Track AI usage for each image in batch
    let creditsUsed = 0;
    for (let i = 0; i < images.length; i++) {
      const trackResult = await trackAIUsage({
        accountId: site.accountId,
        userId: user.id,
        siteId: site.id,
        operation: 'IMAGE_ALT_OPTIMIZATION',
        description: `Batch optimized image alt text (${i + 1}/${images.length})`,
      });
      
      if (trackResult.success) {
        creditsUsed = trackResult.totalUsed;
      }
    }

    return NextResponse.json({
      success: true,
      ...result,
      // Include updated credits for frontend to update UI
      creditsUpdated: creditsUsed > 0 ? { used: creditsUsed } : null,
    });
  } catch (error) {
    console.error('Batch AI image optimization error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to analyze images' },
      { status: 500 }
    );
  }
}
