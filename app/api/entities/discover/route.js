import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generateStructuredResponse } from '@/lib/ai/gemini';
import { z } from 'zod';

/**
 * Fetch and parse WordPress sitemap
 */
async function fetchWordPressSitemap(siteUrl) {
  const sitemapUrls = [
    `${siteUrl}/wp-sitemap.xml`,           // WordPress 5.5+ default
    `${siteUrl}/sitemap.xml`,               // Yoast SEO
    `${siteUrl}/sitemap_index.xml`,         // Yoast SEO alternative
    `${siteUrl}/sitemap-index.xml`,         // Rank Math
  ];

  let sitemapContent = null;
  let usedUrl = null;

  for (const url of sitemapUrls) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'GhostPost-Platform/1.0' },
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        const text = await response.text();
        if (text.includes('<urlset') || text.includes('<sitemapindex')) {
          sitemapContent = text;
          usedUrl = url;
          break;
        }
      }
    } catch (e) {
      continue;
    }
  }

  return { content: sitemapContent, url: usedUrl };
}

/**
 * Fetch WordPress REST API to get post types with full labels
 */
async function fetchWordPressPostTypes(siteUrl) {
  try {
    // Get post types from the REST API with context=edit for full labels
    // If that fails, try without context
    let response = await fetch(`${siteUrl}/wp-json/wp/v2/types?context=view`, {
      headers: { 'User-Agent': 'GhostPost-Platform/1.0' },
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      const types = await response.json();
      console.log('WordPress types found:', Object.keys(types));
      return types;
    }
  } catch (e) {
    console.error('Failed to fetch WP types:', e);
  }

  return null;
}

/**
 * Parse sitemap and extract post type patterns
 */
function parseSitemapForPostTypes(sitemapContent) {
  const postTypes = new Set();
  const urlPatterns = [];

  // Extract all URLs from sitemap
  const urlMatches = sitemapContent.matchAll(/<loc>([^<]+)<\/loc>/g);
  for (const match of urlMatches) {
    urlPatterns.push(match[1]);
  }

  // Look for sitemap references (sitemap index)
  const sitemapMatches = sitemapContent.matchAll(/wp-sitemap-([a-z0-9_-]+)-/gi);
  for (const match of sitemapMatches) {
    const type = match[1].toLowerCase();
    if (type !== 'users' && type !== 'taxonomies') {
      postTypes.add(type);
    }
  }

  // Yoast sitemap patterns
  const yoastMatches = sitemapContent.matchAll(/([a-z0-9_-]+)-sitemap\.xml/gi);
  for (const match of yoastMatches) {
    const type = match[1].toLowerCase();
    if (!['author', 'category', 'tag', 'post_tag', 'page', 'post'].includes(type)) {
      // This might be a custom post type
      if (!type.includes('taxonomy') && !type.includes('sitemap')) {
        postTypes.add(type);
      }
    }
  }

  return { 
    postTypes: Array.from(postTypes), 
    urlPatterns: urlPatterns.slice(0, 50) // Limit for AI analysis
  };
}

/**
 * Use AI to analyze sitemap URLs and identify post types
 */
async function analyzeWithAI(sitemapData, wpTypes) {
  const schema = z.object({
    entityTypes: z.array(z.object({
      slug: z.string().describe('Unique identifier for the post type (lowercase, no spaces)'),
      name: z.string().describe('Human-readable name in English'),
      nameHe: z.string().describe('Human-readable name in Hebrew'),
      apiEndpoint: z.string().describe('WordPress REST API endpoint (e.g., "posts", "pages", "portfolio")'),
      description: z.string().describe('Brief description of what this post type contains'),
      isCore: z.boolean().describe('True if this is a core WordPress type (posts, pages)'),
    })),
  });

  const prompt = `Analyze this WordPress site data and identify ALL content types (post types) that exist on the site.

WordPress REST API Types (if available):
${wpTypes ? JSON.stringify(wpTypes, null, 2) : 'Not available'}

Sitemap Post Types Found:
${sitemapData.postTypes.join(', ') || 'None detected'}

Sample URLs from Sitemap (for pattern analysis):
${sitemapData.urlPatterns.slice(0, 30).join('\n')}

Instructions:
1. Identify all post types including:
   - Core types: posts, pages
   - Custom post types: portfolio, projects, products, services, team, testimonials, etc.
2. For each post type, determine the REST API endpoint
3. Provide names in both English and Hebrew
4. Only include post types that appear to have actual content
5. Do NOT include taxonomies (categories, tags), users, or media
6. The apiEndpoint should be the REST API path (e.g., "posts", "pages", "portfolio")

Return ONLY post types that actually exist on this site based on the data provided.`;

  try {
    const result = await generateStructuredResponse({
      system: 'You are an expert WordPress developer. Analyze sitemap and REST API data to identify all content types on a WordPress site. Be accurate and only return post types that actually exist.',
      prompt,
      schema,
      temperature: 0.2,
    });

    return result.entityTypes;
  } catch (error) {
    console.error('AI analysis error:', error);
    return null;
  }
}

/**
 * POST /api/entities/discover
 * Discovers entity types from a WordPress site by analyzing sitemap and REST API
 */
export async function POST(request) {
  try {
    const { siteId } = await request.json();

    if (!siteId) {
      return NextResponse.json({ error: 'Site ID is required' }, { status: 400 });
    }

    // Get the site
    const site = await prisma.site.findUnique({
      where: { id: siteId },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    if (!site.url) {
      return NextResponse.json({ error: 'Site URL is not configured' }, { status: 400 });
    }

    const siteUrl = site.url.replace(/\/$/, '');

    // Only support WordPress for now
    if (site.platform !== 'wordpress') {
      return NextResponse.json({ 
        error: 'Entity discovery is currently only supported for WordPress sites',
        platform: site.platform,
      }, { status: 400 });
    }

    // Common Hebrew translations for post types
    const hebrewNames = {
      posts: 'פוסטים',
      pages: 'עמודים',
      post: 'פוסטים',
      page: 'עמודים',
      portfolio: 'תיק עבודות',
      project: 'פרויקטים',
      projects: 'פרויקטים',
      service: 'שירותים',
      services: 'שירותים',
      product: 'מוצרים',
      products: 'מוצרים',
      team: 'צוות',
      testimonial: 'המלצות',
      testimonials: 'המלצות',
      event: 'אירועים',
      events: 'אירועים',
      gallery: 'גלריה',
      faq: 'שאלות נפוצות',
      case_study: 'מקרי בוחן',
      case_studies: 'מקרי בוחן',
      blog: 'בלוג',
      news: 'חדשות',
      article: 'מאמרים',
      articles: 'מאמרים',
    };

    function getHebrewName(slug, englishName) {
      const normalized = slug.toLowerCase().replace(/-/g, '_');
      return hebrewNames[normalized] || hebrewNames[slug] || englishName;
    }

    // Fetch WordPress REST API types
    const wpTypes = await fetchWordPressPostTypes(siteUrl);

    // Fetch and parse sitemap
    const sitemap = await fetchWordPressSitemap(siteUrl);
    let sitemapData = { postTypes: [], urlPatterns: [] };
    
    if (sitemap.content) {
      sitemapData = parseSitemapForPostTypes(sitemap.content);
    }

    // If we have REST API types, we can use them directly
    let entityTypes = [];

    if (wpTypes) {
      // Map WordPress types to our format
      const coreTypes = ['post', 'page'];
      const excludeTypes = ['attachment', 'nav_menu_item', 'wp_block', 'wp_template', 'wp_template_part', 'wp_navigation', 'wp_font_family', 'wp_font_face', 'wp_global_styles', 'wp_pattern'];

      for (const [key, typeData] of Object.entries(wpTypes)) {
        if (excludeTypes.includes(key)) continue;
        
        // Always include core types (post, page)
        const isCore = coreTypes.includes(key);
        
        // For custom types: include if viewable or has REST base
        const isViewable = typeData.viewable === true || typeData.viewable === undefined;
        const hasRestBase = !!typeData.rest_base;
        
        if (isCore || isViewable || hasRestBase) {
          const slug = key === 'post' ? 'posts' : key === 'page' ? 'pages' : key;
          
          // Use the actual label from WordPress (typeData.name is the registered label)
          // This preserves the original language from the WordPress site
          const wpLabel = typeData.name || typeData.labels?.name || key;
          
          entityTypes.push({
            slug,
            name: wpLabel,  // Original label from WordPress
            nameHe: wpLabel, // Same label (already in site's language)
            apiEndpoint: typeData.rest_base || key,
            description: typeData.description || '',
            isCore,
          });
        }
      }
    }

    // Also add types found in sitemap that aren't in REST API
    if (sitemapData.postTypes.length > 0) {
      for (const sitemapType of sitemapData.postTypes) {
        const exists = entityTypes.some(t => 
          t.slug === sitemapType || 
          t.apiEndpoint === sitemapType ||
          t.slug === sitemapType + 's' ||
          t.slug + 's' === sitemapType
        );
        
        if (!exists) {
          const name = sitemapType.charAt(0).toUpperCase() + sitemapType.slice(1).replace(/_/g, ' ');
          entityTypes.push({
            slug: sitemapType,
            name,
            nameHe: getHebrewName(sitemapType, name),
            apiEndpoint: sitemapType,
            description: `Custom post type: ${name}`,
            isCore: false,
          });
        }
      }
    }

    // Try AI enhancement only if we have entity types and want better Hebrew names
    // Skip AI if we already have enough data to avoid rate limits
    let aiEnhanced = false;
    if (entityTypes.length > 0 && (sitemap.content || wpTypes)) {
      try {
        const aiTypes = await analyzeWithAI(sitemapData, wpTypes);
        
        if (aiTypes && aiTypes.length > 0) {
          aiEnhanced = true;
          // Merge AI results with direct API results
          for (const aiType of aiTypes) {
            const existing = entityTypes.find(t => t.slug === aiType.slug || t.apiEndpoint === aiType.apiEndpoint);
            if (existing) {
              // Update with AI data (better Hebrew names)
              if (aiType.nameHe && aiType.nameHe !== aiType.name) {
                existing.nameHe = aiType.nameHe;
              }
              if (aiType.description) {
                existing.description = aiType.description;
              }
            } else {
              entityTypes.push(aiType);
            }
          }
        }
      } catch (aiError) {
        // AI failed, but we already have types from REST API - continue without AI
        console.log('AI enhancement skipped due to error, using REST API data');
      }
    }

    // Ensure core types are always present
    const hasPages = entityTypes.some(t => t.slug === 'pages');
    const hasPosts = entityTypes.some(t => t.slug === 'posts');
    
    if (!hasPosts) {
      entityTypes.push({
        slug: 'posts',
        name: 'Posts',
        nameHe: 'פוסטים',
        apiEndpoint: 'posts',
        description: 'Blog posts',
        isCore: true,
      });
    }
    
    if (!hasPages) {
      entityTypes.push({
        slug: 'pages',
        name: 'Pages',
        nameHe: 'עמודים',
        apiEndpoint: 'pages',
        description: 'Static pages',
        isCore: true,
      });
    }

    // Sort: core types first, then alphabetically
    entityTypes.sort((a, b) => {
      if (a.isCore && !b.isCore) return -1;
      if (!a.isCore && b.isCore) return 1;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({
      success: true,
      entityTypes,
      source: {
        restApi: !!wpTypes,
        sitemap: !!sitemap.content,
        sitemapUrl: sitemap.url,
        aiEnhanced,
      },
    });
  } catch (error) {
    console.error('Entity discovery error:', error);
    return NextResponse.json(
      { error: 'Failed to discover entity types' },
      { status: 500 }
    );
  }
}
