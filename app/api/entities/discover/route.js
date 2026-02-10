import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { generateStructuredResponse } from '@/lib/ai/gemini';
import { trackAIUsage } from '@/lib/ai/credits-service';
import { z } from 'zod';

const SESSION_COOKIE = 'user_session';

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
 * Fetch sub-sitemap and extract all URLs with metadata
 */
async function fetchSubSitemap(sitemapUrl) {
  try {
    const response = await fetch(sitemapUrl, {
      headers: { 'User-Agent': 'GhostPost-Platform/1.0' },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return [];

    const content = await response.text();
    const urls = [];

    // Parse <url> entries - each contains <loc>, optionally <lastmod>, <image:loc>, etc.
    const urlRegex = /<url>([\s\S]*?)<\/url>/gi;
    let match;

    while ((match = urlRegex.exec(content)) !== null) {
      const urlBlock = match[1];
      
      // Extract loc (URL)
      const locMatch = urlBlock.match(/<loc>([^<]+)<\/loc>/);
      if (!locMatch) continue;

      const url = locMatch[1];
      
      // Extract lastmod if available
      const lastmodMatch = urlBlock.match(/<lastmod>([^<]+)<\/lastmod>/);
      const lastmod = lastmodMatch ? lastmodMatch[1] : null;

      // Extract image if available (Yoast format)
      const imageMatch = urlBlock.match(/<image:loc>([^<]+)<\/image:loc>/);
      const image = imageMatch ? imageMatch[1] : null;

      // Extract title from image:title if available
      const imageTitleMatch = urlBlock.match(/<image:title>([^<]+)<\/image:title>/);
      const imageTitle = imageTitleMatch ? imageTitleMatch[1] : null;

      urls.push({
        url,
        lastmod,
        image,
        imageTitle,
      });
    }

    return urls;
  } catch (e) {
    console.error('Error fetching sub-sitemap:', sitemapUrl, e.message);
    return [];
  }
}

/**
 * Extract slug from URL path
 */
function extractSlugFromUrl(url, siteUrl) {
  try {
    const urlObj = new URL(url);
    let path = urlObj.pathname;
    
    // Remove trailing slash
    path = path.replace(/\/$/, '');
    
    // Get the last segment as slug
    const segments = path.split('/').filter(Boolean);
    if (segments.length === 0) return null;
    
    // Last segment is the slug
    return segments[segments.length - 1];
  } catch (e) {
    return null;
  }
}

/**
 * Extract title from URL - convert slug to readable title
 */
function slugToTitle(slug) {
  if (!slug) return 'Untitled';
  
  return slug
    .replace(/-/g, ' ')
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Crawl all sitemaps and collect entities grouped by post type
 */
async function crawlSitemapsForEntities(siteUrl, mainSitemapContent) {
  const entities = {}; // { postType: [{ url, slug, title, ... }] }
  
  // Check if this is a sitemap index or direct urlset
  const isSitemapIndex = mainSitemapContent.includes('<sitemapindex');
  
  if (isSitemapIndex) {
    // Extract all sitemap URLs from index
    const sitemapRefs = mainSitemapContent.matchAll(/<loc>([^<]+)<\/loc>/g);
    
    for (const ref of sitemapRefs) {
      const sitemapUrl = ref[1];
      
      // Detect post type from sitemap URL
      let postType = null;
      
      // WordPress 5.5+ format: wp-sitemap-posts-1.xml, wp-sitemap-pages-1.xml
      const wpMatch = sitemapUrl.match(/wp-sitemap-([a-z0-9_-]+)-\d+\.xml/i);
      if (wpMatch) {
        postType = wpMatch[1];
      }
      
      // Yoast format: post-sitemap.xml, page-sitemap.xml, portfolio-sitemap.xml
      const yoastMatch = sitemapUrl.match(/([a-z0-9_-]+)-sitemap\d*\.xml/i);
      if (!postType && yoastMatch) {
        postType = yoastMatch[1];
      }
      
      // Skip taxonomy, author, and other non-content sitemaps
      if (!postType || 
          postType === 'taxonomies' || 
          postType === 'users' ||
          postType === 'author' ||
          postType === 'category' ||
          postType === 'tag' ||
          postType === 'post_tag') {
        continue;
      }
      
      // Normalize post type to plural form
      if (postType === 'post') postType = 'posts';
      if (postType === 'page') postType = 'pages';
      
      // Fetch and parse sub-sitemap
      const urls = await fetchSubSitemap(sitemapUrl);
      
      if (urls.length > 0) {
        if (!entities[postType]) {
          entities[postType] = [];
        }
        
        for (const urlData of urls) {
          const slug = extractSlugFromUrl(urlData.url, siteUrl);
          if (!slug) continue;
          
          entities[postType].push({
            url: urlData.url,
            slug,
            title: urlData.imageTitle || slugToTitle(slug),
            featuredImage: urlData.image || null,
            publishedAt: urlData.lastmod ? new Date(urlData.lastmod) : null,
          });
        }
      }
    }
  } else {
    // Single urlset - assume these are posts or pages
    const urls = [];
    const urlRegex = /<url>([\s\S]*?)<\/url>/gi;
    let match;
    
    while ((match = urlRegex.exec(mainSitemapContent)) !== null) {
      const urlBlock = match[1];
      const locMatch = urlBlock.match(/<loc>([^<]+)<\/loc>/);
      if (locMatch) {
        const url = locMatch[1];
        const slug = extractSlugFromUrl(url, siteUrl);
        if (slug) {
          urls.push({
            url,
            slug,
            title: slugToTitle(slug),
            publishedAt: null,
          });
        }
      }
    }
    
    if (urls.length > 0) {
      entities['posts'] = urls;
    }
  }
  
  return entities;
}

/**
 * Populate entities from sitemap data
 */
async function populateEntitiesFromSitemap(siteId, entityTypes, sitemapEntities) {
  const stats = {
    created: 0,
    updated: 0,
    types: 0,
  };

  for (const entityType of entityTypes) {
    // Find matching sitemap data for this entity type
    const postTypeKey = entityType.slug;
    const sitemapData = sitemapEntities[postTypeKey];
    
    if (!sitemapData || sitemapData.length === 0) {
      continue;
    }

    // First, ensure the entity type exists in the database
    let dbEntityType = await prisma.siteEntityType.findUnique({
      where: {
        siteId_slug: {
          siteId,
          slug: entityType.slug,
        },
      },
    });

    if (!dbEntityType) {
      dbEntityType = await prisma.siteEntityType.create({
        data: {
          siteId,
          slug: entityType.slug,
          name: entityType.name,
          apiEndpoint: entityType.apiEndpoint,
          isEnabled: true,
          sortOrder: entityType.isCore ? 0 : 10,
        },
      });
      stats.types++;
    }

    // Create entities from sitemap data
    for (const item of sitemapData) {
      try {
        // Check if entity already exists
        const existing = await prisma.siteEntity.findFirst({
          where: {
            siteId,
            entityTypeId: dbEntityType.id,
            slug: item.slug,
          },
        });

        if (existing) {
          // Update if we have newer data
          await prisma.siteEntity.update({
            where: { id: existing.id },
            data: {
              url: item.url,
              title: item.title,
              featuredImage: item.featuredImage || existing.featuredImage,
              publishedAt: item.publishedAt || existing.publishedAt,
            },
          });
          stats.updated++;
        } else {
          // Create new entity
          await prisma.siteEntity.create({
            data: {
              siteId,
              entityTypeId: dbEntityType.id,
              slug: item.slug,
              title: item.title,
              url: item.url,
              featuredImage: item.featuredImage,
              publishedAt: item.publishedAt,
              status: 'PUBLISHED', // Sitemap only contains published content
            },
          });
          stats.created++;
        }
      } catch (e) {
        // Skip duplicates or errors
        console.error('Error creating entity:', e.message);
      }
    }
  }

  return stats;
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
    // Check authentication
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { siteId } = await request.json();

    if (!siteId) {
      return NextResponse.json({ error: 'Site ID is required' }, { status: 400 });
    }

    // Get user's accounts
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

    // Get the site and verify access
    const site = await prisma.site.findFirst({
      where: { 
        id: siteId,
        accountId: { in: accountIds },
      },
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

    // Track whether AI was used (for credit tracking)
    let usedAI = false;

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
      // Core types to exclude if their plural exists (these are redundant)
      const coreRedundant = ['post', 'page', 'posts', 'pages'];

      for (const [key, typeData] of Object.entries(wpTypes)) {
        if (excludeTypes.includes(key)) continue;
        
        // Always include core types (post, page) - normalize to plural
        const isCore = coreTypes.includes(key);
        
        // For custom types: include if viewable or has REST base
        const isViewable = typeData.viewable === true || typeData.viewable === undefined;
        const hasRestBase = !!typeData.rest_base;
        
        if (isCore || isViewable || hasRestBase) {
          // Normalize core types to plural form
          const slug = key === 'post' ? 'posts' : key === 'page' ? 'pages' : key;
          
          // Skip if this slug already exists (avoid duplicates)
          if (entityTypes.some(t => t.slug === slug)) continue;
          
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
        // Skip core type duplicates (post/posts, page/pages already handled)
        const coreVariants = ['post', 'posts', 'page', 'pages'];
        if (coreVariants.includes(sitemapType.toLowerCase())) {
          continue;
        }
        
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
        usedAI = true;  // Track that AI was called
        
        if (aiTypes && aiTypes.length > 0) {
          aiEnhanced = true;
          // Merge AI results with direct API results
          for (const aiType of aiTypes) {
            // Skip core type duplicates from AI
            const coreVariants = ['post', 'page'];
            if (coreVariants.includes(aiType.slug?.toLowerCase())) {
              continue;
            }
            
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

    // Final deduplication: filter out singular core types if plural exists
    entityTypes = entityTypes.filter(type => {
      const slug = type.slug?.toLowerCase();
      // If this is a singular core type, check if plural exists
      if (slug === 'post' && entityTypes.some(t => t.slug === 'posts')) return false;
      if (slug === 'page' && entityTypes.some(t => t.slug === 'pages')) return false;
      return true;
    });

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

    // Crawl sitemaps to extract entities and populate them
    let sitemapEntities = {};
    let populateStats = { created: 0, updated: 0, types: 0 };
    
    if (sitemap.content) {
      try {
        // Crawl all sitemaps and collect entities by post type
        sitemapEntities = await crawlSitemapsForEntities(siteUrl, sitemap.content);
        
        // Populate entities in database
        populateStats = await populateEntitiesFromSitemap(siteId, entityTypes, sitemapEntities);
        
        // Count entities per type for response
        for (const et of entityTypes) {
          const count = sitemapEntities[et.slug]?.length || 0;
          et.entityCount = count;
        }
      } catch (crawlError) {
        console.error('Sitemap crawl error:', crawlError);
        // Continue without entity population
      }
    }

    // Track AI usage if AI was used for enhancement
    let creditsUsed = 0;
    if (usedAI) {
      const trackResult = await trackAIUsage({
        accountId: site.accountId,
        userId,
        siteId: site.id,
        operation: 'GENERIC',
        description: `Entity types discovery with AI enhancement`,
      });
      
      if (trackResult.success) {
        creditsUsed = trackResult.totalUsed;
      }
    }

    return NextResponse.json({
      success: true,
      entityTypes,
      source: {
        restApi: !!wpTypes,
        sitemap: !!sitemap.content,
        sitemapUrl: sitemap.url,
        aiEnhanced,
      },
      populated: {
        created: populateStats.created,
        updated: populateStats.updated,
        typesCreated: populateStats.types,
        totalEntities: Object.values(sitemapEntities).reduce((sum, arr) => sum + arr.length, 0),
      },
      // Include updated credits for frontend to update UI
      creditsUpdated: creditsUsed > 0 ? { used: creditsUsed } : null,
    });
  } catch (error) {
    console.error('Entity discovery error:', error);
    return NextResponse.json(
      { error: 'Failed to discover entity types' },
      { status: 500 }
    );
  }
}
