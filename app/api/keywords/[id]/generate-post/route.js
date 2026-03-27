/**
 * Generate AI Post from Keyword API
 * 
 * Generates a complete blog post using AI based on a keyword
 * Uses Gemini 2.0 Flash for text generation
 * Uses Nano Banana 2 (Gemini native) for AI image generation (with Picsum fallback)
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { generateTextResponse, generateStructuredResponse, generateImage, MODELS } from '@/lib/ai/gemini';
import { gatherImageContext, buildImagePrompt } from '@/lib/ai/image-context';
import { z } from 'zod';
import { uploadBase64ToCloudinary } from '@/lib/cloudinary-upload';

const SESSION_COOKIE = 'user_session';

// Fallback placeholder image URL
const PICSUM_URL = 'https://picsum.photos';

/**
 * Generate a single AI image using Nano Banana 2, with Picsum fallback
 * Images are uploaded to Cloudinary to avoid embedding large base64 data in HTML
 * @param {string} prompt - Image description
 * @param {string} aspectRatio - Aspect ratio (e.g. '16:9', '3:2')
 * @param {string} fallbackSeed - Seed for Picsum fallback
 * @param {{ width: number, height: number }} fallbackSize - Picsum dimensions
 * @returns {Promise<{ url: string, alt: string, isAI: boolean }>}
 */
async function generateSingleImage(prompt, aspectRatio, fallbackSeed, fallbackSize = { width: 800, height: 450 }) {
  try {
    console.log(`[generate-post] Generating image with ${MODELS.IMAGE}, prompt length: ${prompt.length}`);
    const images = await generateImage({
      prompt,
      aspectRatio,
      n: 1,
      operation: 'GENERATE_POST_IMAGE',
      metadata: { prompt: prompt.slice(0, 200) },
    });

    if (images && images.length > 0 && images[0].base64) {
      console.log(`[generate-post] Image generated successfully (${Math.round(images[0].base64.length / 1024)}KB)`);
      
      // Upload to Cloudinary instead of embedding base64 in HTML
      const slug = fallbackSeed.replace(/\s+/g, '-').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60);
      const publicId = `${slug}-${Date.now()}`;
      try {
        const cdnUrl = await uploadBase64ToCloudinary(images[0].base64, 'ghostpost/posts', publicId);
        console.log(`[generate-post] Image uploaded to Cloudinary: ${cdnUrl.substring(0, 80)}`);
        return { url: cdnUrl, alt: prompt, isAI: true };
      } catch (uploadErr) {
        console.warn('[generate-post] Cloudinary upload failed, using base64 fallback:', uploadErr.message);
        const mimeType = images[0].mimeType || 'image/png';
        return { url: `data:${mimeType};base64,${images[0].base64}`, alt: prompt, isAI: true };
      }
    }
    throw new Error('No image data returned from Imagen');
  } catch (error) {
    console.error('[generate-post] Imagen generation failed:', error.message);
    if (error.statusCode) console.error('[generate-post] Status:', error.statusCode);
    if (error.responseBody) console.error('[generate-post] Response:', typeof error.responseBody === 'string' ? error.responseBody.slice(0, 300) : JSON.stringify(error.responseBody).slice(0, 300));
    console.warn('[generate-post] Falling back to Picsum placeholder');
    const seed = encodeURIComponent(fallbackSeed.replace(/\s+/g, '-').toLowerCase());
    return {
      url: `${PICSUM_URL}/seed/${seed}/${fallbackSize.width}/${fallbackSize.height}`,
      alt: prompt,
      isAI: false,
    };
  }
}

// Article generation output schema
const ArticleSchema = z.object({
  title: z.string().describe('The article title'),
  html: z.string().describe('The full article content in HTML format'),
  metaTitle: z.string().max(60).describe('SEO meta title, max 60 characters'),
  metaDescription: z.string().max(155).describe('SEO meta description, max 155 characters'),
  excerpt: z.string().describe('A 1-2 sentence summary of the article'),
  slug: z.string().describe('URL-friendly slug for the article'),
  featuredImageAlt: z.string().optional().describe('Detailed, specific alt text for featured image'),
  contentImageDescriptions: z.array(z.string()).optional().describe('Detailed 15-30 word descriptions for each content image, describing specific visual scenes relevant to the article and business'),
});

// Article type configurations
const ARTICLE_TYPE_CONFIG = {
  SEO: { minWords: 1500, maxWords: 3000, label: 'SEO Article' },
  BLOG_POST: { minWords: 800, maxWords: 2000, label: 'Blog Post' },
  GUIDE: { minWords: 2000, maxWords: 5000, label: 'Comprehensive Guide' },
  HOW_TO: { minWords: 1000, maxWords: 2500, label: 'How-to Article' },
  LISTICLE: { minWords: 800, maxWords: 2000, label: 'Listicle' },
  COMPARISON: { minWords: 1200, maxWords: 3000, label: 'Comparison Article' },
  REVIEW: { minWords: 1000, maxWords: 2500, label: 'Review' },
  NEWS: { minWords: 400, maxWords: 1000, label: 'News Article' },
  TUTORIAL: { minWords: 1500, maxWords: 4000, label: 'Tutorial' },
  CASE_STUDY: { minWords: 1200, maxWords: 3000, label: 'Case Study' },
  PAGE: { minWords: 300, maxWords: 1000, label: 'Web Page' },
  PRODUCT: { minWords: 500, maxWords: 1500, label: 'Product Page' },
  LANDING_PAGE: { minWords: 500, maxWords: 1500, label: 'Landing Page' },
};

// Writing style descriptions
const WRITING_STYLE_DESCRIPTIONS = {
  professional: 'Professional, business-focused tone with industry expertise',
  casual: 'Casual, friendly, and approachable tone',
  technical: 'Technical and detailed, suitable for expert audiences',
  conversational: 'Conversational, like talking to a friend',
  formal: 'Formal and respectful academic style',
  friendly: 'Warm and friendly, building rapport with readers',
  authoritative: 'Authoritative and confident, establishing expertise',
  educational: 'Educational, clear explanations for learning',
};

// Intent descriptions for context
const INTENT_CONTEXT = {
  INFORMATIONAL: 'The user wants to learn and understand. Focus on education, explanation, and comprehensive information.',
  NAVIGATIONAL: 'The user wants to find a specific destination. Focus on clear directions and useful resources.',
  TRANSACTIONAL: 'The user wants to take action (buy, sign up, download). Focus on benefits, CTAs, and persuasion.',
  COMMERCIAL: 'The user is researching before making a decision. Focus on comparisons, pros/cons, and recommendations.',
};

// Get authenticated user
async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) return null;

    return await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        isSuperAdmin: true,
        accountMemberships: { select: { accountId: true } },
      },
    });
  } catch {
    return null;
  }
}

export async function POST(request, { params }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: keywordId } = await params;
    const body = await request.json();
    const {
      siteId,
      writingStyle,
      publishMode,
      scheduleDate,
      scheduleTime,
      wordCount,
      featuredImage,
      contentImages,
      contentImagesCount,
      intent,
      articleType,
      contentPrompt,
      featuredImagePrompt,
      contentImagesPrompt,
      regenerate,
      regenerateField,
      regeneratePrompt,
      existingPost,
    } = body;

    // Fetch keyword
    const keyword = await prisma.keyword.findUnique({
      where: { id: keywordId },
      include: { site: true },
    });

    if (!keyword) {
      return NextResponse.json({ error: 'Keyword not found' }, { status: 404 });
    }

    // Verify site access
    const accountIds = user.accountMemberships.map(m => m.accountId);
    if (!user.isSuperAdmin && !accountIds.includes(keyword.site.accountId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // If regenerating a specific field, handle that
    if (regenerateField && existingPost) {
      // Gather image context for regeneration too
      const imageContext = (featuredImage || contentImages) 
        ? await gatherImageContext(keyword.site)
        : null;

      const regeneratedPost = await regeneratePostField(
        existingPost,
        regenerateField,
        keyword,
        { writingStyle, wordCount, intent, articleType, contentPrompt, featuredImagePrompt, contentImagesPrompt, imageContext, regeneratePrompt }
      );
      return NextResponse.json({ post: regeneratedPost });
    }

    // Generate the full article
    const typeConfig = ARTICLE_TYPE_CONFIG[articleType] || ARTICLE_TYPE_CONFIG.BLOG_POST;
    const styleDesc = WRITING_STYLE_DESCRIPTIONS[writingStyle] || '';
    const intentContext = INTENT_CONTEXT[intent] || '';

    // Build business context from site's interview/crawl data for the system prompt
    const crawled = keyword.site.crawledData || {};
    const businessContext = {
      category: keyword.site.businessCategory || crawled.category || null,
      about: keyword.site.businessAbout || crawled.description || null,
      servicesOrProducts: (crawled.servicesOrProducts || []).slice(0, 8).join(', ') || null,
      targetAudience: crawled.targetAudience || null,
    };
    // Only pass if we have meaningful data
    const hasBusinessContext = Object.values(businessContext).some(v => v);

    const systemPrompt = buildSystemPrompt({
      keyword: keyword.keyword,
      articleType,
      typeConfig,
      wordCount,
      writingStyle,
      styleDesc,
      intent,
      intentContext,
      featuredImage,
      contentImages,
      contentImagesCount,
      contentPrompt,
      siteName: keyword.site.businessName || keyword.site.name,
      siteLanguage: keyword.site.contentLanguage || 'en',
      businessContext: hasBusinessContext ? businessContext : null,
    });

    const userPrompt = `Write a ${typeConfig.label} about "${keyword.keyword}".`;

    // Calculate maxTokens based on word count and language
    // Hebrew/RTL languages need ~3-4 tokens per word, English ~1.5
    const isRtlLanguage = ['he', 'ar'].includes(keyword.site.contentLanguage);
    const tokensPerWord = isRtlLanguage ? 4 : 1.5;
    const contentTokens = Math.ceil(wordCount * tokensPerWord);
    // Add buffer for JSON structure, metadata fields, and safety margin
    const estimatedMaxTokens = Math.ceil(contentTokens * 1.3) + 1000;
    // Ensure minimum of 8192 for any generation
    const maxTokens = Math.max(8192, estimatedMaxTokens);

    // Generate article using AI
    let article;
    try {
      article = await generateStructuredResponse({
        system: systemPrompt,
        prompt: userPrompt,
        schema: ArticleSchema,
        temperature: 0.7,
        maxTokens,
        operation: 'GENERATE_POST',
        metadata: {
          keywordId,
          articleType,
          wordCount,
        },
      });
    } catch (structuredError) {
      // Fallback to text generation if structured fails
      console.warn('[generate-post] Structured generation failed, using text fallback:', structuredError.message);
      
      const raw = await generateTextResponse({
        system: systemPrompt + '\n\nReply ONLY with a JSON object containing: title, html, metaTitle, metaDescription, excerpt, slug, featuredImageAlt',
        prompt: userPrompt,
        maxTokens: 8192,
        temperature: 0.7,
        operation: 'GENERATE_POST',
        metadata: { keywordId, articleType, wordCount },
      });

      // Parse JSON from response
      const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      try {
        article = JSON.parse(cleaned);
      } catch {
        // Create minimal article from raw text
        article = {
          title: `${keyword.keyword} - ${typeConfig.label}`,
          html: cleaned,
          metaTitle: keyword.keyword,
          metaDescription: '',
          excerpt: '',
          slug: keyword.keyword.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        };
      }
    }

    // Calculate word count
    const textOnly = (article.html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const actualWordCount = textOnly.split(' ').filter(Boolean).length;

    // Gather website image context (color palette, existing image style, business identity)
    let imageContext = null;
    if (featuredImage || (contentImages && contentImagesCount > 0)) {
      try {
        imageContext = await gatherImageContext(keyword.site);
      } catch (err) {
        console.warn('[generate-post] Image context gathering failed:', err.message);
        imageContext = {};
      }
    }

    // Generate featured image using Nano Banana 2 (with fallback)
    let featuredImageUrl = null;
    let featuredImageIsAI = false;
    if (featuredImage) {
      const featuredPrompt = buildImagePrompt({
        imageContext: imageContext || {},
        keyword: keyword.keyword,
        postTitle: article.title || keyword.keyword,
        postExcerpt: article.excerpt || '',
        userPrompt: featuredImagePrompt,
        imageType: 'featured',
      });

      console.log('[generate-post] Featured image prompt:', featuredPrompt.slice(0, 200));
      
      const result = await generateSingleImage(
        featuredPrompt,
        '16:9',
        keyword.keyword,
        { width: 1200, height: 630 }
      );
      featuredImageUrl = result.url;
      featuredImageIsAI = result.isAI;
    }

    // Process content images - replace placeholders with actual images
    let processedHtml = article.html || '';
    const contentImagesUrls = [];
    
    if (contentImages && contentImagesCount > 0) {
      const imageDescriptions = article.contentImageDescriptions || [];
      
      // Generate content images using Nano Banana 2 (with fallback)
      // First, find where each image will be inserted to get nearby content for context
      const ctxParagraphs = [...processedHtml.matchAll(/<\/p>/gi)];
      const ctxH2s = [...processedHtml.matchAll(/<h2[^>]*>/gi)];

      const contentImagePromises = [];
      for (let i = 0; i < contentImagesCount; i++) {
        const description = imageDescriptions[i] || `${keyword.keyword} illustration ${i + 1}`;
        
        // Get nearby content for this image's position (larger context window)
        let nearbyContent = '';
        if (i === 0 && ctxParagraphs.length > 0) {
          // First image: after intro - extract first paragraph + start of next section
          const end = Math.min(ctxParagraphs[0].index + ctxParagraphs[0][0].length + 300, processedHtml.length);
          nearbyContent = processedHtml.slice(0, end);
        } else if (ctxH2s.length > 0) {
          // Near an h2 - extract h2, its paragraphs, and some surrounding context
          const h2Idx = Math.min(i, ctxH2s.length - 1);
          const h2Start = ctxH2s[h2Idx].index;
          // Find the next h2 boundary or end of content
          const nextH2Start = h2Idx + 1 < ctxH2s.length ? ctxH2s[h2Idx + 1].index : processedHtml.length;
          nearbyContent = processedHtml.slice(h2Start, Math.min(h2Start + 800, nextH2Start));
        }

        const imagePrompt = buildImagePrompt({
          imageContext: imageContext || {},
          keyword: keyword.keyword,
          postTitle: article.title || keyword.keyword,
          postExcerpt: article.excerpt || '',
          userPrompt: contentImagesPrompt,
          imageType: 'content',
          imageDescription: description,
          nearbyContent,
        });

        console.log(`[generate-post] Content image ${i + 1} prompt:`, imagePrompt.slice(0, 200));
        
        // Store the AI-provided description (in content language) for alt/caption
        contentImagePromises.push(
          generateSingleImage(imagePrompt, '16:9', `${keyword.keyword}-${i}`, { width: 800, height: 450 })
            .then(result => ({ ...result, alt: description }))
        );
      }

      const contentImageResults = await Promise.all(contentImagePromises);
      for (const result of contentImageResults) {
        contentImagesUrls.push({
          url: result.url,
          alt: result.alt,
          isAI: result.isAI,
        });
      }
      
      // Remove any image placeholders from the HTML 
      processedHtml = processedHtml.replace(/<!-- IMAGE: .+? -->/g, '');
      
      // Insert images based on count following specific rules:
      // 1 image: after הקדמה (first paragraph)
      // 2 images: after הקדמה + after first regular paragraph
      // 3 images: after הקדמה + after first paragraph + before last h2
      // 4+ images: after הקדמה + before each h2 (skip first h2 and its paragraph)
      
      const createImageHtml = (img) => 
        `<figure class="content-image"><img src="${img.url}" alt="${img.alt}" loading="lazy" /><figcaption>${img.alt}</figcaption></figure>`;
      
      const imageCount = contentImagesUrls.length;
      
      // Find all paragraph end positions and h2 start positions
      const paragraphMatches = [...processedHtml.matchAll(/<\/p>/gi)];
      const h2Matches = [...processedHtml.matchAll(/<h2[^>]*>/gi)];
      
      // === Section-aware positioning helpers ===
      const firstH2Pos = h2Matches.length > 0 ? h2Matches[0].index : null;
      
      // Intro paragraphs = all </p> tags that appear BEFORE the first <h2>
      const introParas = firstH2Pos !== null
        ? paragraphMatches.filter(m => m.index < firstH2Pos)
        : paragraphMatches.slice(0, 1);
      
      // "After intro" = after the LAST paragraph before the first h2
      const afterIntroPos = introParas.length > 0
        ? introParas[introParas.length - 1].index + introParas[introParas.length - 1][0].length
        : (paragraphMatches.length > 0 ? paragraphMatches[0].index + paragraphMatches[0][0].length : null);
      
      // "First section paragraph" = first </p> AFTER the first <h2> (not just second paragraph overall)
      const firstSectionPara = firstH2Pos !== null
        ? paragraphMatches.find(m => m.index > firstH2Pos)
        : null;
      const afterFirstSectionParaPos = firstSectionPara
        ? firstSectionPara.index + firstSectionPara[0].length
        : (paragraphMatches.length > 1 ? paragraphMatches[1].index + paragraphMatches[1][0].length : null);
      
      // Build insertion points array with position and image index
      const insertions = [];
      
      if (imageCount === 1) {
        // Single image: after intro (last paragraph before first h2)
        if (afterIntroPos) {
          insertions.push({ position: afterIntroPos, imgIndex: 0 });
        }
      } else if (imageCount === 2) {
        // First after intro, second after first paragraph of first section
        if (afterIntroPos) {
          insertions.push({ position: afterIntroPos, imgIndex: 0 });
        }
        if (afterFirstSectionParaPos) {
          insertions.push({ position: afterFirstSectionParaPos, imgIndex: 1 });
        }
      } else if (imageCount === 3) {
        // First after intro, second after first section paragraph, third before last h2
        if (afterIntroPos) {
          insertions.push({ position: afterIntroPos, imgIndex: 0 });
        }
        if (afterFirstSectionParaPos) {
          insertions.push({ position: afterFirstSectionParaPos, imgIndex: 1 });
        }
        if (h2Matches.length > 0) {
          const lastH2 = h2Matches[h2Matches.length - 1];
          insertions.push({ position: lastH2.index, imgIndex: 2 });
        }
      } else if (imageCount >= 4) {
        // First after intro
        if (afterIntroPos) {
          insertions.push({ position: afterIntroPos, imgIndex: 0 });
        }
        // Rest distributed before each h2 (skip first h2)
        let imgIdx = 1;
        for (let i = 1; i < h2Matches.length && imgIdx < imageCount; i++) {
          insertions.push({ position: h2Matches[i].index, imgIndex: imgIdx });
          imgIdx++;
        }
      }
      
      // Sort insertions by position descending to insert from end to start (preserve positions)
      insertions.sort((a, b) => b.position - a.position);
      
      // Apply insertions
      for (const { position, imgIndex } of insertions) {
        const imgHtml = createImageHtml(contentImagesUrls[imgIndex]);
        processedHtml = processedHtml.slice(0, position) + '\n' + imgHtml + processedHtml.slice(position);
      }
      
      // Post-processing: Ensure images are ONLY between block-level elements
      // Move any <figure> that appears inside a <p> or before a <p> (without a prior </p> or <h*>) to the correct position
      // Rule: <figure> must appear ONLY after </p>, </ul>, </ol>, </figure>, </h*> or at the very start
      processedHtml = processedHtml.replace(
        /(<p[^>]*>)([\s\S]*?)(<figure[\s\S]*?<\/figure>)/gi,
        (match, openP, before, figure) => {
          // Figure was inside a paragraph - move it after the paragraph close
          return `${openP}${before}</p>\n${figure}\n<p>`;
        }
      );
      // Clean up any empty <p></p> left over
      processedHtml = processedHtml.replace(/<p>\s*<\/p>/gi, '');
    }

    const post = {
      title: article.title || keyword.keyword,
      html: processedHtml,
      metaTitle: article.metaTitle || article.title || keyword.keyword,
      metaDescription: article.metaDescription || '',
      excerpt: article.excerpt || '',
      slug: article.slug || keyword.keyword.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      featuredImageAlt: article.featuredImageAlt || keyword.keyword,
      featuredImage: featuredImageUrl,
      featuredImageIsAI,
      contentImages: contentImagesUrls,
      wordCount: actualWordCount,
      type: articleType,
      keywordId,
    };

    return NextResponse.json({ post });
  } catch (error) {
    console.error('[generate-post] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate post' },
      { status: 500 }
    );
  }
}

// Build the system prompt for article generation
function buildSystemPrompt({
  keyword,
  articleType,
  typeConfig,
  wordCount,
  writingStyle,
  styleDesc,
  intent,
  intentContext,
  featuredImage,
  contentImages,
  contentImagesCount,
  contentPrompt,
  siteName,
  siteLanguage,
  businessContext,
}) {
  let prompt = `You are an expert SEO content writer creating a publish-ready ${typeConfig.label}.

TARGET KEYWORD: "${keyword}"
WORD COUNT: STRICTLY ${wordCount} words. This is a hard requirement - the article MUST contain at least ${Math.floor(wordCount * 0.9)} words and ideally reach ${wordCount} words. Write comprehensive, detailed content to fill the full word count. Do NOT write a shorter article.
CONTENT LANGUAGE: ${siteLanguage === 'he' ? 'Hebrew' : 'English'}`;

  // Inject rich business context so AI understands what kind of website this is
  if (businessContext) {
    prompt += `\n\nWEBSITE & BUSINESS CONTEXT:`;
    if (siteName) prompt += `\nBusiness name: ${siteName}`;
    if (businessContext.category) prompt += `\nIndustry/Category: ${businessContext.category}`;
    if (businessContext.about) prompt += `\nAbout: ${businessContext.about}`;
    if (businessContext.servicesOrProducts) prompt += `\nServices/Products: ${businessContext.servicesOrProducts}`;
    if (businessContext.targetAudience) prompt += `\nTarget audience: ${businessContext.targetAudience}`;
    prompt += `\n\nAll content and image descriptions MUST be relevant to this specific business and its industry. Avoid generic content that could apply to any website.`;
  } else if (siteName) {
    prompt += `\n\nWRITING FOR: ${siteName}`;
  }

  prompt += `\n\nWRITING REQUIREMENTS:
1. ${styleDesc ? `Writing style: ${styleDesc}` : 'Write in a clear, engaging style'}
2. ${intentContext ? `User intent: ${intentContext}` : ''}
3. Format the content as clean HTML using <h2>, <h3>, <p>, <ul>/<ol> with <li> items, <strong>, <em>. ALWAYS use proper <ul><li> or <ol><li> tags for lists - NEVER use heading tags for list items
4. Do NOT include <html>, <head>, <body>, or <h1> tags
5. Start with the first paragraph or <h2> heading
6. Work the target keyword naturally into the first paragraph and headings
7. Create an engaging, click-worthy title that includes the keyword
8. Write a compelling meta title (max 60 chars) and meta description (max 155 chars)
9. Create a short excerpt (1-2 sentences) summarizing the article
10. Generate a URL-friendly slug (lowercase, hyphens, no special chars)`;

  if (featuredImage) {
    prompt += `\n11. Provide descriptive alt text for the featured image in "featuredImageAlt". Describe a SPECIFIC, visually concrete scene relevant to both this article topic AND the business (not a generic stock photo description). The alt text MUST be in the same language as the content (${siteLanguage === 'he' ? 'Hebrew' : siteLanguage}).`;
  }

  if (contentImages && contentImagesCount > 0) {
    prompt += `\n12. Include ${contentImagesCount} image placeholders in the HTML using: <!-- IMAGE: detailed description of what the image should show -->`;
    prompt += `\n13. Also provide an array "contentImageDescriptions" with ${contentImagesCount} DETAILED image descriptions (15-30 words each). Each description must:`;
    prompt += `\n    - Describe a SPECIFIC visual scene (not abstract concepts)`;
    prompt += `\n    - Be directly relevant to the paragraph it accompanies AND the business`;
    prompt += `\n    - Include concrete visual elements (objects, settings, actions, people if relevant)`;
    prompt += `\n    - Be in the same language as the content (${siteLanguage === 'he' ? 'Hebrew' : siteLanguage}) as these will be used as image captions`;
    prompt += `\n    BAD example: "technology and innovation" (too generic)`;
    prompt += `\n    GOOD example: "A web developer reviewing analytics dashboard showing SEO performance metrics on a modern monitor"`;
  }

  if (contentPrompt) {
    prompt += `\n\nADDITIONAL INSTRUCTIONS FROM USER:\n${contentPrompt}`;
  }

  return prompt;
}

// Regenerate a specific field of the post
async function regeneratePostField(existingPost, field, keyword, options) {
  const { writingStyle, wordCount, intent, articleType, contentPrompt, featuredImagePrompt, contentImagesPrompt, imageContext, regeneratePrompt } = options;
  const typeConfig = ARTICLE_TYPE_CONFIG[articleType] || ARTICLE_TYPE_CONFIG.BLOG_POST;
  
  // Build a user instruction suffix from the custom prompt
  const userInstruction = regeneratePrompt 
    ? `\n\nUser instruction for this change: ${regeneratePrompt}` 
    : '\n\nGenerate a completely different variation.';
  
  let prompt;
  let schema;

  switch (field) {
    case 'title':
      prompt = `Generate a new engaging title for an article about "${keyword.keyword}". 
Current title: "${existingPost.title}"
Article type: ${typeConfig.label}
Writing style: ${writingStyle || 'professional'}
${contentPrompt ? `Additional context: ${contentPrompt}` : ''}${userInstruction}`;
      schema = z.object({ title: z.string() });
      break;

    case 'metaTitle':
      prompt = `Generate a new SEO meta title (max 60 characters) for an article titled "${existingPost.title}" about "${keyword.keyword}".
Current meta title: "${existingPost.metaTitle}"${userInstruction}`;
      schema = z.object({ metaTitle: z.string().max(60) });
      break;

    case 'metaDescription':
      prompt = `Generate a new SEO meta description (max 155 characters) for an article titled "${existingPost.title}" about "${keyword.keyword}".
Current meta description: "${existingPost.metaDescription}"${userInstruction}`;
      schema = z.object({ metaDescription: z.string().max(155) });
      break;

    case 'excerpt':
      prompt = `Generate a new excerpt (1-2 sentences) for an article titled "${existingPost.title}" about "${keyword.keyword}".
Current excerpt: "${existingPost.excerpt}"${userInstruction}`;
      schema = z.object({ excerpt: z.string() });
      break;

    case 'html':
      prompt = `Rewrite the following article about "${keyword.keyword}" with the same structure but fresh content.
Article type: ${typeConfig.label}
Target word count: ${wordCount}
Writing style: ${writingStyle || 'professional'}
${contentPrompt ? `Additional instructions: ${contentPrompt}` : ''}

Current content:
${existingPost.html}${userInstruction}`;
      schema = z.object({ html: z.string() });
      break;

    case 'featuredImage': {
      // Regenerate featured image using Nano Banana 2 with full context
      const imgPrompt = buildImagePrompt({
        imageContext: imageContext || {},
        keyword: keyword.keyword,
        postTitle: existingPost.title || keyword.keyword,
        postExcerpt: existingPost.excerpt || '',
        userPrompt: regeneratePrompt || featuredImagePrompt,
        imageType: 'featured',
      });
      const imgResult = await generateSingleImage(
        imgPrompt,
        '16:9',
        `${keyword.keyword}-${Date.now()}`,
        { width: 1200, height: 630 }
      );
      return { ...existingPost, featuredImage: imgResult.url, featuredImageIsAI: imgResult.isAI };
    }

    default:
      return existingPost;
  }

  try {
    const result = await generateStructuredResponse({
      system: 'You are an expert SEO content writer. Generate the requested content.',
      prompt,
      schema,
      temperature: 0.8,
      operation: 'REGENERATE_FIELD',
      metadata: { field, keywordId: keyword.id },
    });

    // Calculate new word count if html was regenerated
    if (field === 'html' && result.html) {
      const textOnly = result.html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      result.wordCount = textOnly.split(' ').filter(Boolean).length;
    }

    return { ...existingPost, ...result };
  } catch (error) {
    console.error(`[regenerate-field] Error regenerating ${field}:`, error);
    return existingPost;
  }
}
