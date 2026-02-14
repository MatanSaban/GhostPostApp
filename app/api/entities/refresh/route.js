import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { generateTextResponse } from '@/lib/ai/gemini';
import { trackAIUsage } from '@/lib/ai/credits-service';
import { enforceCredits } from '@/lib/account-limits';

// Force dynamic - never cache
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SESSION_COOKIE = 'user_session';

/**
 * Decode HTML entities like &#x27; to actual characters
 */
function decodeHtmlEntities(text) {
  if (!text) return text;
  
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'",
    '&#39;': "'",
    '&#x27;': "'",
    '&nbsp;': ' ',
    '&ndash;': '\u2013',
    '&mdash;': '\u2014',
    '&lsquo;': '\u2018',
    '&rsquo;': '\u2019',
    '&ldquo;': '\u201C',
    '&rdquo;': '\u201D',
    '&hellip;': '\u2026',
  };
  
  let decoded = text;
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.split(entity).join(char);
  }
  
  // Replace numeric entities
  decoded = decoded.replace(/&#(\d+);/g, (match, code) => String.fromCharCode(parseInt(code, 10)));
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (match, code) => String.fromCharCode(parseInt(code, 16)));
  
  return decoded;
}

/**
 * Clean page title by removing site name suffix
 */
function cleanPageTitle(title) {
  if (!title) return null;
  
  // Common separators used between page title and site name
  const separators = [' | ', ' - ', ' – ', ' — ', ' :: ', ' » ', ' // ', ' · '];
  
  for (const sep of separators) {
    if (title.includes(sep)) {
      // Take the first part (usually the actual page title)
      const parts = title.split(sep);
      if (parts[0].trim().length > 2) {
        return parts[0].trim();
      }
    }
  }
  
  return title;
}

/**
 * Convert slug to readable title
 */
function slugToTitle(slug) {
  if (!slug) return '';
  return decodeURIComponent(slug)
    .replace(/-/g, ' ')
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Extract metadata from HTML page
 */
async function extractPageMetadata(url) {
  try {
    const response = await fetch(url, {
      headers: { 
        'User-Agent': 'GhostPost-Platform/1.0',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    });

    if (!response.ok) return null;

    const html = await response.text();
    const metadata = {
      title: null,
      h1: null,
      description: null,
      canonicalUrl: null,
      focusKeyword: null,
      keywords: null,
      ogTitle: null,
      ogDescription: null,
      ogImage: null,
      ogUrl: null,
      ogType: null,
      ogSiteName: null,
      ogLocale: null,
      twitterCard: null,
      twitterTitle: null,
      twitterDescription: null,
      twitterImage: null,
      author: null,
      publishDate: null,
      modifiedDate: null,
      wordCount: 0,
    };

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) metadata.title = decodeHtmlEntities(titleMatch[1].trim());

    // Common generic H1s that might be in navigation/hidden elements
    const genericH1s = ['עמוד הבית', 'homepage', 'home', 'דף הבית', 'ראשי', 'menu', 'navigation', 'תפריט'];
    
    const isGenericH1 = (text) => {
      if (!text) return true;
      const lowerText = text.toLowerCase().trim();
      return genericH1s.some(generic => lowerText === generic.toLowerCase());
    };

    // H1 tag extraction - find the BEST H1, being smart about listing pages
    // Strategy: 
    // 1. First, check if this is a listing/archive page (multiple H1s = likely listing)
    // 2. For listing pages, prefer OG title over H1 (H1s are often post titles)
    // 3. Look for page-level H1 in header/title sections first
    // 4. If only one H1 and it's not generic, use it
    
    let bestH1 = null;
    
    // First, count all H1s to detect listing pages
    const h1Regex = /<h1[^>]*>([\s\S]*?)<\/h1>/gi;
    const allH1s = [];
    let h1Match;
    
    while ((h1Match = h1Regex.exec(html)) !== null) {
      const h1Content = h1Match[1].replace(/<[^>]+>/g, '').trim();
      if (h1Content) {
        allH1s.push(decodeHtmlEntities(h1Content));
      }
    }
    
    console.log(`[Refresh] Found ${allH1s.length} H1s: ${allH1s.slice(0, 5).join(', ')}${allH1s.length > 5 ? '...' : ''}`);
    
    // If multiple H1s, this is likely a listing page (blog archive, category, etc.)
    // In this case, DON'T use H1 - let OG title take precedence
    if (allH1s.length > 1) {
      console.log(`[Refresh] Multiple H1s detected (${allH1s.length}) - likely a listing page, skipping H1 for title`);
      bestH1 = null;
    } else if (allH1s.length === 1) {
      // Single H1 - use it if not generic
      if (!isGenericH1(allH1s[0])) {
        bestH1 = allH1s[0];
        console.log(`[Refresh] Single H1 found: "${bestH1}"`);
      } else {
        console.log(`[Refresh] Single H1 is generic ("${allH1s[0]}"), skipping`);
      }
    }
    
    metadata.h1 = bestH1;
    if (bestH1) {
      console.log(`[Refresh] Selected H1: "${bestH1}"`);
    }

    // Extract meta tags
    const metaRegex = /<meta[^>]+>/gi;
    let match;
    while ((match = metaRegex.exec(html)) !== null) {
      const tag = match[0];
      
      // Description
      if (tag.includes('name="description"') || tag.includes('name=\'description\'')) {
        const contentMatch = tag.match(/content=["']([^"']+)["']/i);
        if (contentMatch) metadata.description = contentMatch[1];
      }
      
      // Keywords
      if (tag.includes('name="keywords"') || tag.includes('name=\'keywords\'')) {
        const contentMatch = tag.match(/content=["']([^"']+)["']/i);
        if (contentMatch) metadata.keywords = contentMatch[1];
      }
      
      // Open Graph
      if (tag.includes('property="og:title"')) {
        const contentMatch = tag.match(/content=["']([^"']+)["']/i);
        if (contentMatch) metadata.ogTitle = contentMatch[1];
      }
      if (tag.includes('property="og:description"')) {
        const contentMatch = tag.match(/content=["']([^"']+)["']/i);
        if (contentMatch) metadata.ogDescription = contentMatch[1];
      }
      if (tag.includes('property="og:image"')) {
        const contentMatch = tag.match(/content=["']([^"']+)["']/i);
        if (contentMatch) metadata.ogImage = contentMatch[1];
      }
      if (tag.includes('property="og:url"')) {
        const contentMatch = tag.match(/content=["']([^"']+)["']/i);
        if (contentMatch) metadata.ogUrl = contentMatch[1];
      }
      if (tag.includes('property="og:type"')) {
        const contentMatch = tag.match(/content=["']([^"']+)["']/i);
        if (contentMatch) metadata.ogType = contentMatch[1];
      }
      if (tag.includes('property="og:site_name"')) {
        const contentMatch = tag.match(/content=["']([^"']+)["']/i);
        if (contentMatch) metadata.ogSiteName = contentMatch[1];
      }
      if (tag.includes('property="og:locale"')) {
        const contentMatch = tag.match(/content=["']([^"']+)["']/i);
        if (contentMatch) metadata.ogLocale = contentMatch[1];
      }
      
      // Twitter
      if (tag.includes('name="twitter:card"')) {
        const contentMatch = tag.match(/content=["']([^"']+)["']/i);
        if (contentMatch) metadata.twitterCard = contentMatch[1];
      }
      if (tag.includes('name="twitter:title"')) {
        const contentMatch = tag.match(/content=["']([^"']+)["']/i);
        if (contentMatch) metadata.twitterTitle = contentMatch[1];
      }
      if (tag.includes('name="twitter:description"')) {
        const contentMatch = tag.match(/content=["']([^"']+)["']/i);
        if (contentMatch) metadata.twitterDescription = contentMatch[1];
      }
      if (tag.includes('name="twitter:image"')) {
        const contentMatch = tag.match(/content=["']([^"']+)["']/i);
        if (contentMatch) metadata.twitterImage = contentMatch[1];
      }
      
      // Author
      if (tag.includes('name="author"')) {
        const contentMatch = tag.match(/content=["']([^"']+)["']/i);
        if (contentMatch) metadata.author = contentMatch[1];
      }
      
      // Publish date
      if (tag.includes('property="article:published_time"')) {
        const contentMatch = tag.match(/content=["']([^"']+)["']/i);
        if (contentMatch) metadata.publishDate = contentMatch[1];
      }
      
      // Modified date
      if (tag.includes('property="article:modified_time"')) {
        const contentMatch = tag.match(/content=["']([^"']+)["']/i);
        if (contentMatch) metadata.modifiedDate = contentMatch[1];
      }
    }

    // Extract canonical
    const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
    if (canonicalMatch) metadata.canonicalUrl = canonicalMatch[1];

    // Estimate word count from body content
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      const textContent = bodyMatch[1]
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      metadata.wordCount = textContent.split(/\s+/).filter(w => w.length > 0).length;
    }

    return metadata;
  } catch (error) {
    console.error('[Refresh] Error extracting metadata:', error.message);
    return null;
  }
}

/**
 * Extract focus keyword from page content using AI
 */
async function extractFocusKeyword(metadata) {
  try {
    // Build context from available metadata
    const title = metadata.h1 || metadata.ogTitle || metadata.title || '';
    const description = metadata.ogDescription || metadata.description || '';
    
    if (!title && !description) {
      return null;
    }

    const prompt = `Analyze this webpage and determine the main focus keyword (מילת מפתח ראשית).
The focus keyword should be 1-3 words that best describe what this page is about for SEO purposes.

Page Title: ${title}
Meta Description: ${description}

Return ONLY the focus keyword in the original language of the content (usually Hebrew if the content is in Hebrew).
Do not include any explanation or additional text.`;

    const focusKeyword = await generateTextResponse({
      system: 'You are an SEO expert. Extract the main focus keyword from the given page metadata. Return only the keyword, nothing else.',
      prompt,
      maxTokens: 50,
      temperature: 0.3,
    });

    return focusKeyword?.trim() || null;
  } catch (error) {
    console.error('[Refresh] Error extracting focus keyword with AI:', error.message);
    return null;
  }
}

/**
 * POST /api/entities/refresh
 * Deep crawl a single entity to refresh its data
 */
export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { siteId, entityId } = body;

    if (!siteId || !entityId) {
      return NextResponse.json({ error: 'Site ID and Entity ID are required' }, { status: 400 });
    }

    // Verify user has access to this site
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        accountMemberships: {
          select: { accountId: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const accountIds = user.accountMemberships.map(m => m.accountId);

    const site = await prisma.site.findFirst({
      where: {
        id: siteId,
        accountId: { in: accountIds },
      },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // ── Enforce AI credit limit ──────────────────────────────
    const creditCheck = await enforceCredits(site.accountId, 1); // ENTITY_REFRESH = 1 credit
    if (!creditCheck.allowed) {
      return NextResponse.json(creditCheck, { status: 402 });
    }

    // Get the entity
    const entity = await prisma.siteEntity.findFirst({
      where: {
        id: entityId,
        siteId: siteId,
      },
    });

    if (!entity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
    }

    if (!entity.url) {
      return NextResponse.json({ error: 'Entity has no URL to crawl' }, { status: 400 });
    }

    console.log(`[Refresh] Crawling entity: ${entity.url}`);

    // Crawl the page
    const metadata = await extractPageMetadata(entity.url);

    if (!metadata) {
      return NextResponse.json({ error: 'Failed to crawl entity URL' }, { status: 500 });
    }

    // Debug: log title extraction results
    console.log(`[Refresh] Title extraction for ${entity.url}:`, {
      h1: metadata.h1,
      ogTitle: metadata.ogTitle,
      title: metadata.title,
      currentTitle: entity.title,
      slug: entity.slug
    });

    // Extract focus keyword using AI if not already present
    let focusKeyword = metadata.focusKeyword;
    let creditsUsed = 0;
    if (!focusKeyword) {
      console.log(`[Refresh] Extracting focus keyword with AI for: ${entity.url}`);
      focusKeyword = await extractFocusKeyword(metadata);
      console.log(`[Refresh] AI extracted focus keyword: ${focusKeyword}`);
      
      // Track AI credits usage for focus keyword extraction
      if (site.accountId && focusKeyword) {
        const trackResult = await trackAIUsage({
          accountId: site.accountId,
          userId,
          siteId: site.id,
          operation: 'ENTITY_REFRESH',
          description: `Extracted focus keyword for ${entity.url}`,
          metadata: {
            websiteUrl: entity.url,
            focusKeyword,
            entityId: entity.id,
            descriptionKey: 'extractedFocusKeyword',
            descriptionParams: { url: entity.url },
          },
        });
        
        if (trackResult.success) {
          creditsUsed = trackResult.totalUsed;
        }
      }
    }

    // Build SEO data
    const seoData = {
      title: metadata.ogTitle || metadata.title,
      description: metadata.ogDescription || metadata.description,
      canonicalUrl: metadata.canonicalUrl,
      focusKeyword: focusKeyword,
      keywords: metadata.keywords,
      ogTitle: metadata.ogTitle,
      ogDescription: metadata.ogDescription,
      ogImage: metadata.ogImage,
      ogUrl: metadata.ogUrl,
      ogType: metadata.ogType,
      ogSiteName: metadata.ogSiteName,
      ogLocale: metadata.ogLocale,
      twitterCard: metadata.twitterCard,
      twitterTitle: metadata.twitterTitle,
      twitterDescription: metadata.twitterDescription,
      twitterImage: metadata.twitterImage,
      crawledAt: new Date().toISOString(),
    };

    // Common generic titles to avoid
    const genericTitles = [
      'עמוד הבית', 'homepage', 'home', 'דף הבית', 'ראשי',
      'welcome', 'main', 'index', 'home page', 'menu', 'navigation'
    ];
    
    const isGenericTitle = (title) => {
      if (!title) return true;
      const lowerTitle = title.toLowerCase().trim();
      return genericTitles.some(generic => lowerTitle === generic.toLowerCase());
    };

    // Get best title - prefer H1 if not generic > OG title > cleaned page title
    const cleanedTitle = cleanPageTitle(metadata.title);
    let title;
    
    if (metadata.h1 && !isGenericTitle(metadata.h1)) {
      title = metadata.h1;
    } else if (metadata.ogTitle && !isGenericTitle(metadata.ogTitle)) {
      title = metadata.ogTitle;
    } else if (cleanedTitle && !isGenericTitle(cleanedTitle)) {
      title = cleanedTitle;
    } else {
      // For homepage, use proper title; otherwise fall back to entity's current title
      if (entity.slug === '' || entity.url?.endsWith('/')) {
        title = 'עמוד הבית';
      } else {
        title = entity.title || slugToTitle(entity.slug);
      }
    }
    
    console.log(`[Refresh] Title decision for ${entity.url}:`, {
      h1: metadata.h1,
      isH1Generic: isGenericTitle(metadata.h1),
      ogTitle: metadata.ogTitle,
      cleanedTitle,
      finalTitle: title
    });

    // Get featured image
    const featuredImage = metadata.ogImage || metadata.twitterImage || entity.featuredImage;

    // Detect H1 issues (missing or only generic H1s)
    const hasH1Issue = !metadata.h1;

    // Update existing metadata
    const existingMetadata = entity.metadata || {};
    const updatedMetadata = {
      ...existingMetadata,
      needsDeepCrawl: false,
      lastCrawledAt: new Date().toISOString(),
      author: metadata.author || existingMetadata.author,
      publishDate: metadata.publishDate || existingMetadata.publishDate,
      modifiedDate: metadata.modifiedDate || existingMetadata.modifiedDate,
      wordCount: metadata.wordCount,
      h1Issue: hasH1Issue,
    };

    // Update the entity
    const updatedEntity = await prisma.siteEntity.update({
      where: { id: entityId },
      data: {
        title,
        excerpt: metadata.description || metadata.ogDescription || entity.excerpt,
        featuredImage,
        seoData,
        metadata: updatedMetadata,
      },
    });

    console.log(`[Refresh] Successfully refreshed entity: ${entity.url}`);

    return NextResponse.json({
      success: true,
      entity: {
        id: updatedEntity.id,
        title: updatedEntity.title,
        excerpt: updatedEntity.excerpt,
        featuredImage: updatedEntity.featuredImage,
        seoData: updatedEntity.seoData,
        metadata: updatedEntity.metadata,
      },
      // Include updated credits for frontend to update UI
      creditsUpdated: creditsUsed > 0 ? { used: creditsUsed } : null,
    });

  } catch (error) {
    console.error('[Refresh] Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to refresh entity' }, { status: 500 });
  }
}
