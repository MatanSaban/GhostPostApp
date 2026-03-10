/**
 * Image Context Gatherer
 * 
 * Collects contextual data about a website to build rich, relevant
 * image generation prompts for Nano Banana 2 (Gemini native image generation). Gathers:
 * 
 * 1. Website metadata (category, language, business info)
 * 2. Color palette (extracted from homepage CSS via HTTP fetch + cheerio)
 * 3. Existing image style (analyzes sample featured images via Gemini Vision)
 * 4. Post content context (for relevance)
 */

import * as cheerio from 'cheerio';
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { logAIUsage } from './credits.js';
import prisma from '@/lib/prisma';

const VISION_MODEL = 'gemini-2.0-flash';

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
        'User-Agent': 'Mozilla/5.0 (compatible; GhostPostBot/1.0)',
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
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GhostPostBot/1.0)' },
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
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GhostPostBot/1.0)' },
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
      inputTokens: usage.promptTokens || 0,
      outputTokens: usage.completionTokens || 0,
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

  // Use cache if less than 24 hours old AND has the latest prompt version (v3)
  if (!forceRefresh && cached && cacheAge < 24 && cached.promptVersion >= 3) {
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
    promptVersion: 3,
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
 * Build a rich, contextual prompt for Nano Banana 2 image generation.
 * Creates highly specific prompts that avoid generic stock-photo results
 * by incorporating business identity, article content, and visual style.
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
 * @returns {string} Optimized prompt for Nano Banana 2
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

  // 1. SUBJECT MATTER - The most important part. Be specific about WHAT is in the image.
  if (imageType === 'featured') {
    // For featured images, derive the visual subject from the topic + business
    if (imageContext.businessCategory) {
      parts.push(`A visually compelling image for a ${imageContext.businessCategory} website article titled "${postTitle}".`);
    } else {
      parts.push(`A visually compelling image for an article titled "${postTitle}".`);
    }
    
    // Add excerpt for subject matter guidance
    if (postExcerpt) {
      parts.push(`The article is about: ${postExcerpt}`);
    }
  } else {
    // For content images, the imageDescription IS the subject
    if (imageDescription) {
      parts.push(`${imageDescription}.`);
    } else {
      parts.push(`An illustration related to "${keyword}".`);
    }
    
    // Add nearby paragraph context for more specificity
    if (nearbyContent) {
      const snippet = nearbyContent.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 300);
      if (snippet.length > 30) {
        parts.push(`This image illustrates the following content: "${snippet}".`);
      }
    }
  }

  // 2. BUSINESS IDENTITY - Connect the image to the specific business
  const identityParts = [];
  if (imageContext.businessName) {
    identityParts.push(`for "${imageContext.businessName}"`);
  }
  if (imageContext.servicesOrProducts) {
    identityParts.push(`(a business offering: ${imageContext.servicesOrProducts})`);
  }
  if (imageContext.targetAudience) {
    identityParts.push(`targeting ${imageContext.targetAudience}`);
  }
  if (identityParts.length > 0) {
    parts.push(`This is ${identityParts.join(' ')}.`);
  }

  // 3. VISUAL STYLE - Match existing website aesthetics
  if (imageContext.imageStyleDescription) {
    parts.push(`Visual style to match: ${imageContext.imageStyleDescription}`);
  }

  // 4. COLOR PALETTE - Website's brand colors MUST be dominant in the image
  if (imageContext.colorPalette && imageContext.colorPalette.length > 0) {
    const topColors = imageContext.colorPalette.slice(0, 6).join(', ');
    parts.push(`IMPORTANT COLOR REQUIREMENT: The image MUST prominently feature these website brand colors as the dominant color palette: ${topColors}. Use these exact colors for backgrounds, key objects, lighting, and overall color grading. The image should look like it belongs on a website that uses these colors.`);
  }

  // 5. LANGUAGE CONTEXT - Text in images is optional but must match website language if present
  const langName = imageContext.language === 'he' ? 'Hebrew'
    : imageContext.language === 'ar' ? 'Arabic'
    : imageContext.language === 'en' ? 'English'
    : imageContext.language || 'English';
  parts.push(`The image does not need to contain any text or writing. However, if any text, words, letters, signs, labels, or writing do appear in the image, they MUST be in ${langName} only. No other languages.`);

  // 6. USER OVERRIDE - Highest priority additive direction
  if (userPrompt) {
    parts.push(`Creative direction from user: ${userPrompt}`);
  }

  // 7. QUALITY CONSTRAINTS
  const hasWatermarkOverride = userPrompt && /watermark/i.test(userPrompt);
  parts.push(`Photorealistic, high resolution, clean composition, sharp focus,${hasWatermarkOverride ? '' : ' no watermarks,'} no borders, no stock photo feel.`);

  return parts.join(' ');
}
