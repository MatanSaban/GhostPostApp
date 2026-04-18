import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { makePluginRequest } from '@/lib/wp-api-client';
import { generateStructuredResponse } from '@/lib/ai/gemini';
import { trackAIUsage } from '@/lib/ai/credits-service';
import { enforceCredits } from '@/lib/account-limits';
import { z } from 'zod';

/**
 * POST /api/sites/[id]/tools/ai-optimize-image
 * 
 * AI optimize a single image:
 * 1. Platform calls Gemini to analyze image and generate suggestions
 * 2. Platform sends suggestions to WP plugin to apply (rename + alt text)
 * 
 * Body: { imageId, imageUrl, currentFilename, applyFilename, applyAltText, language }
 */
export async function POST(req, { params }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const { 
      imageId, 
      imageUrl,
      currentFilename,
      applyFilename = false, 
      applyAltText = false,
      pageContext = '',
      language = 'en',
    } = body;

    if (!imageId) {
      return NextResponse.json({ error: 'Image ID is required' }, { status: 400 });
    }

    const site = await prisma.site.findUnique({
      where: { id },
      select: {
        id: true,
        url: true,
        name: true,
        siteKey: true,
        siteSecret: true,
        accountId: true,
      },
    });

    if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    if (!site.siteKey || !site.siteSecret) {
      return NextResponse.json({ error: 'Site is not connected' }, { status: 400 });
    }

    // If imageUrl is not provided, get it from WP
    let imgUrl = imageUrl;
    let imgFilename = currentFilename;
    if (!imgUrl) {
      const mediaItem = await makePluginRequest(site, `/media/${imageId}`, 'GET');
      imgUrl = mediaItem.url;
      imgFilename = imgFilename || mediaItem.title || `image-${imageId}`;
    }

    if (!imgUrl) {
      return NextResponse.json({ error: 'Could not determine image URL' }, { status: 400 });
    }

    // ── Enforce AI credit limit ──────────────────────────────
    const creditCheck = await enforceCredits(site.accountId, 1);
    if (!creditCheck.allowed) {
      return NextResponse.json(creditCheck, { status: 402 });
    }

    // ── Call Gemini AI ───────────────────────────────────────
    const imageOptimizationSchema = z.object({
      suggestedFilename: z.string().describe('SEO-friendly filename without extension'),
      altText: z.string().describe('Descriptive alt text (50-125 characters)'),
      confidence: z.number().min(0).max(1).describe('Confidence level (0-1)'),
      reasoning: z.string().describe('Brief explanation'),
    });

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

Image URL: ${imgUrl}
Current filename: ${imgFilename || 'unknown'}
${pageContext ? `Page context/keywords: ${pageContext}` : ''}
Target language: ${language}

Based on the image content, generate:
1. A descriptive, SEO-friendly filename
2. Helpful alt text for accessibility and SEO`;

    const aiResult = await generateStructuredResponse({
      system: systemPrompt,
      prompt: userPrompt,
      schema: imageOptimizationSchema,
      temperature: 0.3,
      operation: 'IMAGE_ALT_OPTIMIZATION',
      accountId: site.accountId,
      siteId: site.id,
      metadata: {
        websiteUrl: site.url,
        imageUrl: imgUrl,
        suggestedFilename: aiResult?.suggestedFilename,
        descriptionKey: 'optimizedImageAlt',
      },
    });

    // ── Apply suggestions via WP plugin ──────────────────────
    const applyResult = await makePluginRequest(site, '/media/apply-ai-optimization', 'POST', {
      image_id: imageId,
      suggested_filename: aiResult.suggestedFilename,
      alt_text: aiResult.altText,
      apply_filename: applyFilename,
      apply_alt_text: applyAltText,
    });

    return NextResponse.json({
      success: true,
      image_id: imageId,
      suggested_filename: aiResult.suggestedFilename,
      suggested_alt_text: aiResult.altText,
      confidence: aiResult.confidence,
      reasoning: aiResult.reasoning,
      applied: applyResult.applied || {},
      new_url: applyResult.new_url,
      redirect_created: applyResult.redirect_created,
    });
  } catch (error) {
    console.error('AI optimize image error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to optimize image' },
      { status: 500 }
    );
  }
}
