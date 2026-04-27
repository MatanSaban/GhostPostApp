/**
 * Image Context Gatherer
 * 
 * Collects contextual data about a website to build rich, relevant
 * image generation prompts for Nano Banana Pro (gemini-3-pro-image-preview). Gathers:
 * 
 * 1. Website metadata (category, language, business info)
 * 2. Color palette (extracted from homepage CSS via HTTP fetch + cheerio)
 * 3. Existing image style (analyzes sample featured images via Gemini Vision)
 * 4. Post content context (for relevance)
 */

import * as cheerio from 'cheerio';
import { google } from './vertex-provider.js';
import { generateText } from 'ai';
import { logAIUsage } from './credits.js';
import prisma from '@/lib/prisma';

const VISION_MODEL = 'gemini-2.5-pro';

/**
 * Extract color palette from website homepage via HTTP fetch + CSS parsing.
 * Much cheaper than Playwright - no browser needed.
 * 
 * @param {string} url - Website URL
 * @returns {Promise<string[]>} Array of hex color strings
 */
async function extractColorPalette(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GhostSEOBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return [];

    const html = await response.text();
    const $ = cheerio.load(html);

    const colors = new Set();

    // Extract colors from inline styles and style tags
    const colorRegex = /#([0-9a-fA-F]{3,8})\b/g;
    const rgbRegex = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/g;

    // Parse all <style> tags
    $('style').each((_, el) => {
      const css = $(el).text();
      extractColorsFromCSS(css, colors, colorRegex, rgbRegex);
    });

    // Parse inline styles on key elements (body, header, nav, main, footer, buttons)
    $('[style]').each((_, el) => {
      const style = $(el).attr('style') || '';
      extractColorsFromCSS(style, colors, colorRegex, rgbRegex);
    });

    // Parse CSS custom properties from :root
    const rootStyles = $('style').text();
    const cssVarRegex = /--[^:]+:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))/g;
    let varMatch;
    while ((varMatch = cssVarRegex.exec(rootStyles)) !== null) {
      const val = varMatch[1];
      if (val.startsWith('#')) {
        colors.add(val.toLowerCase());
      } else {
        const hex = rgbToHex(val);
        if (hex) colors.add(hex);
      }
    }

    // Also check linked stylesheets (first 2 only for performance)
    const stylesheetLinks = [];
    $('link[rel="stylesheet"]').each((_, el) => {
      const href = $(el).attr('href');
      if (href) stylesheetLinks.push(href);
    });

    for (const href of stylesheetLinks.slice(0, 2)) {
      try {
        const cssUrl = href.startsWith('http') ? href : new URL(href, url).toString();
        const cssResponse = await fetch(cssUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GhostSEOBot/1.0)' },
          signal: AbortSignal.timeout(8000),
        });
        if (cssResponse.ok) {
          const css = await cssResponse.text();
          extractColorsFromCSS(css, colors, colorRegex, rgbRegex);
        }
      } catch { /* skip failed stylesheets */ }
    }

    // Filter out common generic colors (pure black, white, transparent)
    const filtered = [...colors].filter(c => 
      c !== '#000' && c !== '#000000' && c !== '#fff' && c !== '#ffffff' &&
      c !== '#333' && c !== '#333333' && c !== '#666' && c !== '#666666' &&
      c !== '#999' && c !== '#999999' && c !== '#ccc' && c !== '#cccccc' &&
      c !== '#eee' && c !== '#eeeeee' && c !== '#f5f5f5' && c !== '#fafafa'
    );

    // Return top N unique brand-like colors
    return filtered.slice(0, 10);
  } catch (error) {
    console.warn('[image-context] Color extraction failed:', error.message);
    return [];
  }
}

function extractColorsFromCSS(css, colorSet, hexRegex, rgbRegex) {
  // Reset regex state
  hexRegex.lastIndex = 0;
  rgbRegex.lastIndex = 0;

  let match;
  while ((match = hexRegex.exec(css)) !== null) {
    colorSet.add(match[0].toLowerCase());
  }
  while ((match = rgbRegex.exec(css)) !== null) {
    const hex = `#${parseInt(match[1]).toString(16).padStart(2, '0')}${parseInt(match[2]).toString(16).padStart(2, '0')}${parseInt(match[3]).toString(16).padStart(2, '0')}`;
    colorSet.add(hex.toLowerCase());
  }
}

function rgbToHex(rgbStr) {
  const match = rgbStr.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!match) return null;
  return `#${parseInt(match[1]).toString(16).padStart(2, '0')}${parseInt(match[2]).toString(16).padStart(2, '0')}${parseInt(match[3]).toString(16).padStart(2, '0')}`;
}

/**
 * Analyze existing images from the site to understand the visual style.
 * Uses Gemini Vision to describe the image style from sample URLs.
 * 
 * @param {string} siteId - Site ID
 * @returns {Promise<string|null>} Description of the site's image style
 */
async function analyzeExistingImageStyle(siteId) {
  try {
    // Get up to 3 posts/pages that have featured images
    const entitiesWithImages = await prisma.siteEntity.findMany({
      where: {
        siteId,
        featuredImage: { not: null },
        status: 'PUBLISHED',
        entityType: { isEnabled: true },
      },
      select: {
        featuredImage: true,
        title: true,
        content: true,
      },
      take: 3,
      orderBy: { publishedAt: 'desc' },
    });

    if (entitiesWithImages.length === 0) return null;

    // Also extract any inline images from content HTML
    const imageUrls = [];
    for (const entity of entitiesWithImages) {
      if (entity.featuredImage) {
        imageUrls.push(entity.featuredImage);
      }
      // Extract first <img> from content if exists
      if (entity.content) {
        const imgMatch = entity.content.match(/<img[^>]+src="([^"]+)"/);
        if (imgMatch && imgMatch[1] && !imgMatch[1].startsWith('data:')) {
          imageUrls.push(imgMatch[1]);
        }
      }
    }

    // Limit to 5 images max
    const sampleUrls = [...new Set(imageUrls)].slice(0, 5);
    if (sampleUrls.length === 0) return null;

    // Build multimodal prompt to analyze existing images
    const content = [
      {
        type: 'text',
        text: `Analyze these ${sampleUrls.length} images from a website and describe the VISUAL STYLE in a concise paragraph. Focus on:
- Photography style (studio, lifestyle, stock, illustration, etc.)
- Color tones (warm, cool, vivid, muted, etc.)
- Subject matter patterns (people, objects, abstract, nature, etc.)
- Overall mood/feel (professional, playful, minimalist, corporate, etc.)
- Any consistent visual brand elements

Reply with ONLY a single paragraph describing the style. Keep it under 100 words.`,
      },
    ];

    // Add image URLs
    for (const imageUrl of sampleUrls) {
      try {
        // Fetch image as buffer for Gemini Vision
        const imgResponse = await fetch(imageUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GhostSEOBot/1.0)' },
          signal: AbortSignal.timeout(10000),
        });

        if (imgResponse.ok) {
          const buffer = Buffer.from(await imgResponse.arrayBuffer());
          const contentType = imgResponse.headers.get('content-type') || 'image/jpeg';
          content.push({ type: 'image', image: buffer, mimeType: contentType });
        }
      } catch {
        // Skip failed image fetches
      }
    }

    // Need at least 1 image loaded
    if (content.filter(c => c.type === 'image').length === 0) return null;

    const result = await generateText({
      model: google(VISION_MODEL),
      messages: [{ role: 'user', content }],
      temperature: 0.3,
      maxTokens: 200,
    });

    // Log AI usage
    const usage = result.usage || {};
    logAIUsage({
      operation: 'ANALYZE_IMAGE_STYLE',
      inputTokens: usage.inputTokens || 0,
      outputTokens: usage.outputTokens || 0,
      totalTokens: usage.totalTokens || 0,
      model: VISION_MODEL,
      metadata: {
        siteId,
        imageCount: content.filter(c => c.type === 'image').length,
      },
    });

    return result.text?.trim() || null;
  } catch (error) {
    console.warn('[image-context] Image style analysis failed:', error.message);
    return null;
  }
}

/**
 * Gather all image generation context for a site.
 * Caches the result on the site's crawledData to avoid repeated analysis.
 * 
 * @param {Object} site - Site object from Prisma (with crawledData)
 * @param {Object} options - Options
 * @param {boolean} options.forceRefresh - Force re-analysis even if cached
 * @returns {Promise<Object>} Image context object
 */
export async function gatherImageContext(site, { forceRefresh = false } = {}) {
  // Check cache first (stored in crawledData.imageContext)
  const cached = site.crawledData?.imageContext;
  const cacheAge = cached?.analyzedAt
    ? (Date.now() - new Date(cached.analyzedAt).getTime()) / (1000 * 60 * 60)
    : Infinity;

  // Use cache if less than 24 hours old AND has the latest prompt version (v5)
  if (!forceRefresh && cached && cacheAge < 24 && cached.promptVersion >= 5) {
    console.log('[image-context] Using cached image context (age:', Math.round(cacheAge), 'hours)');
    return cached;
  }

  console.log('[image-context] Gathering fresh image context for site:', site.id);

  // Run color extraction and image style analysis in parallel
  const [colorPalette, imageStyleDescription] = await Promise.all([
    site.url ? extractColorPalette(site.url) : [],
    analyzeExistingImageStyle(site.id),
  ]);

  // Extract rich data from crawledData (populated during site interview/crawl)
  const crawled = site.crawledData || {};
  const seoStrategy = site.seoStrategy || {};

  // Build services/products summary
  const servicesOrProducts = crawled.servicesOrProducts || [];
  const servicesText = servicesOrProducts.length > 0
    ? servicesOrProducts.slice(0, 8).join(', ')
    : null;

  // Content pillars from SEO strategy
  const contentPillars = seoStrategy.contentPillars || [];
  const pillarsText = contentPillars.length > 0
    ? contentPillars.slice(0, 4).map(p => p.topic).join(', ')
    : null;

  const imageContext = {
    // Website metadata
    businessName: site.businessName || site.name || crawled.businessName,
    businessCategory: site.businessCategory || crawled.category || null,
    businessAbout: site.businessAbout || crawled.description || null,
    language: site.contentLanguage || crawled.language || 'en',
    
    // Rich business context from interview/crawl
    servicesOrProducts: servicesText,
    targetAudience: crawled.targetAudience || null,
    contentPillars: pillarsText,
    
    // Visual identity
    colorPalette,
    imageStyleDescription,
    
    // Cache metadata
    promptVersion: 5,
    analyzedAt: new Date().toISOString(),
  };

  // Cache the result on the site
  try {
    await prisma.site.update({
      where: { id: site.id },
      data: {
        crawledData: {
          ...(site.crawledData || {}),
          imageContext,
        },
      },
    });
    console.log('[image-context] Cached image context to site');
  } catch (error) {
    console.warn('[image-context] Failed to cache image context:', error.message);
  }

  return imageContext;
}

/**
 * Build a rich, contextual prompt for Nano Banana Pro image generation.
 * Creates role-aware prompts: featured images are bold hero/banner images,
 * content images are specific illustrations tied to their surrounding paragraph.
 * 
 * @param {Object} params
 * @param {Object} params.imageContext - From gatherImageContext()
 * @param {string} params.keyword - The target keyword
 * @param {string} params.postTitle - The generated post title
 * @param {string} params.postExcerpt - Short summary of the post
 * @param {string} params.userPrompt - Optional user-provided image prompt
 * @param {string} params.imageType - 'featured' or 'content'
 * @param {string} params.imageDescription - AI-provided description (for content images)
 * @param {string} params.nearbyContent - Content around where the image will be inserted
 * @returns {string} Optimized prompt for Nano Banana Pro
 */
export function buildImagePrompt({
  imageContext,
  keyword,
  postTitle,
  postExcerpt,
  userPrompt,
  imageType = 'featured',
  imageDescription,
  nearbyContent,
}) {
  const parts = [];

  if (imageType === 'featured') {
    // ── FEATURED IMAGE ──────────────────────────────────────────────
    // Hero/banner image: bold, wide, captures the article's overall theme.
    // Must feel like a magazine cover or blog hero - visually striking, 
    // single clear focal point, room for text overlay if needed.

    parts.push('Create a wide, cinematic hero image suitable as a blog featured image.');
    parts.push('The image should have a single clear focal point, bold composition, and feel like a professional magazine cover or editorial header.');

    // Subject from the article topic
    if (postTitle) {
      parts.push(`The article is titled "${postTitle}".`);
    }
    if (keyword) {
      parts.push(`The main topic is "${keyword}".`);
    }
    if (postExcerpt) {
      parts.push(`Article summary: ${postExcerpt}`);
    }

    parts.push('Show a striking visual scene, object, or concept that immediately communicates this topic to a reader scrolling through a blog. The image must be self-explanatory - a viewer should understand the article\'s subject just by looking at the image.');
  } else {
    // ── CONTENT IMAGE ───────────────────────────────────────────────
    // In-article illustration: specific to the paragraph/section it sits next to.
    // Must illustrate the exact concept discussed in the surrounding text.

    parts.push('Create an in-article illustration image that visually explains a specific concept discussed in the text below.');

    // The AI-provided description of what the image should show is the #1 priority
    if (imageDescription) {
      parts.push(`The image must depict: ${imageDescription}`);
    }

    // Nearby content is critical - this is what makes the image relevant to its section
    if (nearbyContent) {
      const snippet = nearbyContent.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 600);
      if (snippet.length > 30) {
        parts.push(`This image sits next to this text: "${snippet}"`);
        parts.push('The image MUST directly illustrate what this paragraph is explaining. Show the specific thing being discussed - not a generic representation of the broader topic.');
      }
    }

    if (!imageDescription && keyword) {
      parts.push(`The broader article topic is "${keyword}", but focus on what the surrounding text discusses, not the general topic.`);
    }
  }

  // BUSINESS CONTEXT - light domain hint
  if (imageContext.businessCategory) {
    parts.push(`Industry context: ${imageContext.businessCategory}.`);
  }

  // USER OVERRIDE - highest priority additive direction
  if (userPrompt) {
    parts.push(`Additional creative direction: ${userPrompt}`);
  }

  // VISUAL STYLE - match existing website aesthetics (brief)
  if (imageContext.imageStyleDescription) {
    const styleSnippet = imageContext.imageStyleDescription.slice(0, 150);
    parts.push(`Visual style reference: ${styleSnippet}`);
  }

  // COLOR PALETTE - subtle brand hints
  if (imageContext.colorPalette && imageContext.colorPalette.length > 0) {
    const topColors = imageContext.colorPalette.slice(0, 4).join(', ');
    parts.push(`If it fits naturally, lean toward these brand colors: ${topColors}.`);
  }

  // LANGUAGE - any text in the image must match the website language
  const langName = imageContext.language === 'he' ? 'Hebrew'
    : imageContext.language === 'ar' ? 'Arabic'
    : imageContext.language === 'en' ? 'English'
    : imageContext.language || 'English';
  parts.push(`IMPORTANT: If the image contains any visible text - on signs, labels, screens, buttons, headings, banners, or any other surface - it MUST be written in ${langName}.`);
  if (imageContext.language === 'he' || imageContext.language === 'ar') {
    parts.push(`Remember: ${langName} is a right-to-left language. Ensure all text reads correctly from right to left.`);
  }

  // QUALITY
  parts.push('Photorealistic, high resolution, sharp focus, professional photography quality. No watermarks, no borders, no text overlays unless specifically requested.');

  return parts.join('\n');
}
