import { NextResponse } from 'next/server';
import { generateStructuredResponse } from '@/lib/ai/gemini';
import { z } from 'zod';
import prisma from '@/lib/prisma';

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
    const body = await req.json();
    const { imageUrl, currentFilename, pageContext, language = 'en' } = body;

    if (!imageUrl) {
      return NextResponse.json(
        { error: 'Image URL is required' },
        { status: 400 }
      );
    }

    // Get site info for additional context
    const site = await prisma.site.findUnique({
      where: { id },
      select: { name: true, url: true },
    });

    if (!site) {
      return NextResponse.json(
        { error: 'Site not found' },
        { status: 404 }
      );
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

    return NextResponse.json({
      success: true,
      ...result,
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
 * POST /api/sites/[id]/tools/ai-image-optimize/batch
 * 
 * Batch analyze multiple images
 */
export async function PUT(req, { params }) {
  try {
    const { id } = await params;
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

    // Get site info
    const site = await prisma.site.findUnique({
      where: { id },
      select: { name: true, url: true },
    });

    if (!site) {
      return NextResponse.json(
        { error: 'Site not found' },
        { status: 404 }
      );
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

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Batch AI image optimization error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to analyze images' },
      { status: 500 }
    );
  }
}
