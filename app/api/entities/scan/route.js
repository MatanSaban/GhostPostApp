import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { generateStructuredResponse } from '@/lib/ai/gemini';
import { trackAIUsage } from '@/lib/ai/credits-service';
import { getSiteInfo as getPluginSiteInfo } from '@/lib/wp-api-client';
import { z } from 'zod';

// Force dynamic - never cache this route
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SESSION_COOKIE = 'user_session';

/**
 * Decode HTML entities like &#x27; to actual characters
 */
function decodeHtmlEntities(text) {
  if (!text) return text;
  
  // Common HTML entities - use Unicode escapes to avoid syntax issues
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'",
    '&#39;': "'",
    '&#x27;': "'",
    '&nbsp;': ' ',
    '&ndash;': '\u2013',  // en-dash
    '&mdash;': '\u2014',  // em-dash
    '&lsquo;': '\u2018',  // left single quote
    '&rsquo;': '\u2019',  // right single quote
    '&ldquo;': '\u201C',  // left double quote
    '&rdquo;': '\u201D',  // right double quote
    '&hellip;': '\u2026', // horizontal ellipsis
    '&copy;': '\u00A9',   // copyright
    '&reg;': '\u00AE',    // registered
    '&trade;': '\u2122',  // trademark
    '&euro;': '\u20AC',   // euro
    '&pound;': '\u00A3',  // pound
    '&yen;': '\u00A5',    // yen
    '&cent;': '\u00A2',   // cent
    '&deg;': '\u00B0',    // degree
    '&plusmn;': '\u00B1', // plus-minus
    '&times;': '\u00D7',  // multiplication
    '&divide;': '\u00F7', // division
    '&frac12;': '\u00BD', // 1/2
    '&frac14;': '\u00BC', // 1/4
    '&frac34;': '\u00BE', // 3/4
  };
  
  let decoded = text;
  
  // Replace named entities
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.split(entity).join(char);
  }
  
  // Replace numeric entities (decimal) like &#39;
  decoded = decoded.replace(/&#(\d+);/g, (match, code) => {
    return String.fromCharCode(parseInt(code, 10));
  });
  
  // Replace numeric entities (hex) like &#x27;
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (match, code) => {
    return String.fromCharCode(parseInt(code, 16));
  });
  
  return decoded;
}

/**
 * Entity Scanning System - 3 Phase Approach
 * 
 * Phase 1: Quick Discovery (GET /api/entities/scan?siteId=xxx&phase=discover)
 *   - Scan sitemap to find post types
 *   - Count URLs per post type from sitemap
 *   - For WordPress: filter to public post types only
 *   - Fast operation, returns post types list
 * 
 * Phase 2: Entity Population (POST /api/entities/scan with phase=populate)
 *   - Triggered after user saves selected post types
 *   - Crawl sitemaps for selected post types
 *   - Use WP REST API if available for richer data
 *   - Create/update SiteEntity records with basic data
 * 
 * Phase 3: Deep Crawl (POST /api/entities/scan with phase=crawl)
 *   - Crawl each entity's actual page
 *   - Extract metadata, structured data, SEO info
 *   - Update entities with enriched data
 * 
 * Limitations: Each plan has crawl limits (to be implemented)
 */

// ============================================
// PHASE 1: Quick Discovery
// ============================================

/**
 * Fetch main sitemap and detect type
 * Now supports all platforms, not just WordPress
 */
async function fetchMainSitemap(siteUrl, customSitemapUrl = null) {
  console.log('[Scan] Looking for sitemap at:', siteUrl);
  
  // If custom sitemap URL is provided, try it first
  const sitemapUrls = customSitemapUrl 
    ? [customSitemapUrl]
    : [
        // WordPress sitemaps
        `${siteUrl}/wp-sitemap.xml`,           // WordPress 5.5+ default
        `${siteUrl}/sitemap.xml`,               // Universal / Yoast SEO
        `${siteUrl}/sitemap_index.xml`,         // Yoast SEO alternative
        `${siteUrl}/sitemap-index.xml`,         // Rank Math
        // Shopify sitemaps
        `${siteUrl}/sitemap.xml`,               // Shopify default
        // Next.js / other frameworks
        `${siteUrl}/server-sitemap.xml`,        // Next.js sitemap
        `${siteUrl}/server-sitemap-index.xml`,
        // Common alternatives
        `${siteUrl}/sitemaps/sitemap.xml`,
        `${siteUrl}/sitemap/sitemap.xml`,
        `${siteUrl}/sitemap1.xml`,
        // Robots.txt fallback (we'll check this separately)
      ];

  // Deduplicate URLs
  const uniqueUrls = [...new Set(sitemapUrls)];

  for (const url of uniqueUrls) {
    try {
      console.log('[Scan] Trying sitemap URL:', url);
      const response = await fetch(url, {
        headers: { 'User-Agent': 'GhostPost-Platform/1.0' },
        signal: AbortSignal.timeout(10000),
        cache: 'no-store',
      });

      if (response.ok) {
        const content = await response.text();
        if (content.includes('<urlset') || content.includes('<sitemapindex')) {
          // Detect sitemap type based on URL patterns and content
          const isWordPressDefault = url.includes('wp-sitemap');
          const isYoast = url.includes('sitemap') && (content.includes('yoast') || content.includes('post-sitemap') || content.includes('page-sitemap'));
          const isRankMath = url.includes('sitemap-index') || url.includes('sitemap_index');
          // Only mark as Shopify if URL or content clearly indicates Shopify
          const isShopify = url.includes('.myshopify.com') || content.includes('myshopify.com') || content.includes('cdn.shopify.com');
          
          const type = isWordPressDefault ? 'wordpress' : 
                       isShopify ? 'shopify' :
                       isYoast ? 'yoast' : 
                       isRankMath ? 'rankmath' : 'generic';
          
          console.log('[Scan] Found sitemap:', { url, type, isIndex: content.includes('<sitemapindex') });
          
          return { 
            content, 
            url, 
            type,
            isIndex: content.includes('<sitemapindex'),
          };
        }
      }
    } catch (e) {
      console.log('[Scan] Failed to fetch sitemap:', url, e.message);
      continue;
    }
  }

  // Try to find sitemap from robots.txt
  if (!customSitemapUrl) {
    try {
      console.log('[Scan] Checking robots.txt for sitemap...');
      const robotsResponse = await fetch(`${siteUrl}/robots.txt`, {
        headers: { 'User-Agent': 'GhostPost-Platform/1.0' },
        signal: AbortSignal.timeout(5000),
        cache: 'no-store',
      });
      
      if (robotsResponse.ok) {
        const robotsContent = await robotsResponse.text();
        const sitemapMatch = robotsContent.match(/Sitemap:\s*(.+)/i);
        if (sitemapMatch) {
          const robotsSitemapUrl = sitemapMatch[1].trim();
          console.log('[Scan] Found sitemap in robots.txt:', robotsSitemapUrl);
          // Recursively try to fetch this sitemap
          return fetchMainSitemap(siteUrl, robotsSitemapUrl);
        }
      }
    } catch (e) {
      console.log('[Scan] Failed to check robots.txt:', e.message);
    }
  }

  console.log('[Scan] No sitemap found');
  return null;
}

// Hebrew translations for common post types
const POST_TYPE_TRANSLATIONS = {
  posts: { en: 'Posts', he: 'פוסטים' },
  pages: { en: 'Pages', he: 'עמודים' },
  post: { en: 'Posts', he: 'פוסטים' },
  page: { en: 'Pages', he: 'עמודים' },
  products: { en: 'Products', he: 'מוצרים' },
  product: { en: 'Products', he: 'מוצרים' },
  services: { en: 'Services', he: 'שירותים' },
  service: { en: 'Services', he: 'שירותים' },
  projects: { en: 'Projects', he: 'פרויקטים' },
  project: { en: 'Projects', he: 'פרויקטים' },
  portfolio: { en: 'Portfolio', he: 'תיק עבודות' },
  testimonials: { en: 'Testimonials', he: 'המלצות' },
  testimonial: { en: 'Testimonials', he: 'המלצות' },
  team: { en: 'Team', he: 'צוות' },
  events: { en: 'Events', he: 'אירועים' },
  event: { en: 'Events', he: 'אירועים' },
  news: { en: 'News', he: 'חדשות' },
  faq: { en: 'FAQ', he: 'שאלות נפוצות' },
  faqs: { en: 'FAQ', he: 'שאלות נפוצות' },
  gallery: { en: 'Gallery', he: 'גלריה' },
  galleries: { en: 'Galleries', he: 'גלריות' },
  locations: { en: 'Locations', he: 'מיקומים' },
  location: { en: 'Locations', he: 'מיקומים' },
  careers: { en: 'Careers', he: 'קריירה' },
  job: { en: 'Jobs', he: 'משרות' },
  jobs: { en: 'Jobs', he: 'משרות' },
  technologies: { en: 'Technologies', he: 'טכנולוגיות' },
  technology: { en: 'Technologies', he: 'טכנולוגיות' },
  tech: { en: 'Technologies', he: 'טכנולוגיות' },
  clients: { en: 'Clients', he: 'לקוחות' },
  client: { en: 'Clients', he: 'לקוחות' },
  partners: { en: 'Partners', he: 'שותפים' },
  partner: { en: 'Partners', he: 'שותפים' },
  // Taxonomy types
  'post-categories': { en: 'Blog Categories', he: 'קטגוריות בלוג' },
  'post-tags': { en: 'Blog Tags', he: 'תגיות בלוג' },
  'product-categories': { en: 'Product Categories', he: 'קטגוריות מוצרים' },
  'product-tags': { en: 'Product Tags', he: 'תגיות מוצרים' },
  'service-categories': { en: 'Service Categories', he: 'קטגוריות שירותים' },
  'project-categories': { en: 'Project Categories', he: 'קטגוריות פרויקטים' },
};

// Taxonomy indicators in URL paths
const TAXONOMY_INDICATORS = [
  'categories', 'category', 'cat',
  'tags', 'tag',
  'topics', 'topic',
  'authors', 'author',
  'archives', 'archive',
];

/**
 * Check if a URL segment indicates a taxonomy (category, tag, etc.)
 * @param {string} segment - URL path segment
 * @returns {string|null} - Taxonomy type if detected, null otherwise
 */
function getTaxonomyType(segment) {
  const lowerSegment = segment.toLowerCase();
  
  if (['categories', 'category', 'cat'].includes(lowerSegment)) {
    return 'categories';
  }
  if (['tags', 'tag'].includes(lowerSegment)) {
    return 'tags';
  }
  if (['topics', 'topic'].includes(lowerSegment)) {
    return 'topics';
  }
  if (['authors', 'author', 'writer'].includes(lowerSegment)) {
    return 'authors';
  }
  
  return null;
}

/**
 * Detect if URL is a taxonomy page and return taxonomy info
 * @param {string[]} segments - URL path segments
 * @returns {{ isTaxonomy: boolean, taxonomyType: string|null, parentType: string|null }}
 */
function detectTaxonomyUrl(segments) {
  if (segments.length < 2) {
    return { isTaxonomy: false, taxonomyType: null, parentType: null };
  }

  // Check each segment for taxonomy indicators
  for (let i = 0; i < segments.length - 1; i++) {
    const taxonomyType = getTaxonomyType(segments[i]);
    if (taxonomyType) {
      // Found taxonomy indicator, determine parent type
      let parentType = 'post'; // default
      
      if (i > 0) {
        // Check segment before taxonomy for parent type hint
        const prevSegment = segments[i - 1].toLowerCase();
        if (['blog', 'posts', 'news', 'articles'].includes(prevSegment)) {
          parentType = 'post';
        } else if (['products', 'product', 'shop'].includes(prevSegment)) {
          parentType = 'product';
        } else if (['services', 'service'].includes(prevSegment)) {
          parentType = 'service';
        } else if (['projects', 'project', 'portfolio'].includes(prevSegment)) {
          parentType = 'project';
        }
      }

      return {
        isTaxonomy: true,
        taxonomyType: taxonomyType,
        parentType: parentType,
      };
    }
  }

  return { isTaxonomy: false, taxonomyType: null, parentType: null };
}

// Common archive page slugs that should be treated as pages, not posts
const ARCHIVE_PAGE_SLUGS = [
  'blog', 'posts', 'articles', 'news',
  'services', 'service',
  'projects', 'portfolio', 'work', 'our-work', 'case-studies',
  'products', 'shop', 'store',
  'testimonials', 'reviews',
  'team', 'our-team', 'about-us', 'about',
  'events', 'calendar',
  'faq', 'faqs',
  'gallery', 'galleries', 'photos',
  'locations', 'branches', 'contact',
  'careers', 'jobs', 'job-openings',
  'categories', 'tags', 'archive', 'archives',
];

/**
 * Check if a URL is an archive page (listing page for a post type)
 * Archive pages should be treated as "pages" not as posts of that type
 * @param {string} url - The URL to check
 * @param {string} entityTypeSlug - The entity type being processed (e.g., 'posts', 'services')
 * @returns {boolean} - True if this URL is an archive page
 */
function isArchivePage(url, entityTypeSlug) {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname.replace(/\/$/, '');
    const segments = path.split('/').filter(Boolean);
    
    // If URL has only 1 segment (e.g., /blog, /services), it's likely an archive page
    if (segments.length === 1) {
      const slug = segments[0].toLowerCase();
      
      // Check against known archive page slugs
      if (ARCHIVE_PAGE_SLUGS.includes(slug)) {
        console.log(`[Scan] Detected archive page: ${url} (slug: ${slug})`);
        return true;
      }
      
      // Check if the slug matches or is similar to the entity type
      // e.g., /services for 'services' type, /blog for 'posts' type
      const normalizedTypeSlug = entityTypeSlug.toLowerCase().replace(/s$/, '');
      const normalizedUrlSlug = slug.replace(/s$/, '');
      
      if (normalizedTypeSlug === normalizedUrlSlug) {
        console.log(`[Scan] Detected archive page (matches type): ${url}`);
        return true;
      }
      
      // Special case: /blog is archive for 'posts'
      if (entityTypeSlug === 'posts' && ['blog', 'news', 'articles'].includes(slug)) {
        console.log(`[Scan] Detected blog archive page: ${url}`);
        return true;
      }
    }
    
    return false;
  } catch (e) {
    return false;
  }
}

/**
 * Format slug to readable name
 */
function formatSlugToName(slug) {
  return slug
    .replace(/[-_]/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Fetch WordPress REST API types (only public ones)
 */
async function fetchWordPressTypes(siteUrl) {
  console.log('[Scan] Fetching WordPress types from REST API...');
  
  try {
    const response = await fetch(`${siteUrl}/wp-json/wp/v2/types?context=view`, {
      headers: { 'User-Agent': 'GhostPost-Platform/1.0' },
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
    });

    if (!response.ok) {
      console.log('[Scan] WP REST API not available:', response.status);
      return null;
    }

    const types = await response.json();
    console.log('[Scan] WP REST API returned types:', Object.keys(types));
    
    const publicTypes = {};

    // Internal/excluded types
    const excludeTypes = [
      'attachment', 'nav_menu_item', 'wp_block', 'wp_template', 
      'wp_template_part', 'wp_navigation', 'wp_font_family', 'wp_font_face', 
      'wp_global_styles', 'wp_pattern', 'revision', 'custom_css', 
      'customize_changeset', 'oembed_cache', 'user_request',
      'elementor_library', 'elementor_font', 'elementor_icons', 'elementor_snippet',
      'e-landing-page', 'acf-field-group', 'acf-field', 'acf-post-type',
      'acf-taxonomy', 'acf-ui-options-page',
    ];

    for (const [slug, typeData] of Object.entries(types)) {
      if (excludeTypes.includes(slug)) continue;
      
      // Only include viewable/public types
      const isPublic = typeData.viewable === true;
      const hasRestBase = !!typeData.rest_base;
      
      if (isPublic || hasRestBase) {
        // Handle name - WordPress returns labels with proper translations
        // Priority: labels.name (plural label) > name > slug
        let typeName = slug;
        let typeLabel = null;
        
        // First try to get the label from labels object (this has the translated name)
        if (typeData.labels?.name) {
          typeLabel = typeof typeData.labels.name === 'object' ? typeData.labels.name.rendered : typeData.labels.name;
        }
        
        // Then try the name property
        if (typeData.name) {
          typeName = typeof typeData.name === 'object' ? typeData.name.rendered : typeData.name;
        }
        
        // Use label if it looks like a proper translation (not just the slug capitalized)
        const finalLabel = typeLabel || typeName;
        
        // Handle description similarly
        let typeDescription = '';
        if (typeData.description) {
          typeDescription = typeof typeData.description === 'object' ? typeData.description.rendered : typeData.description;
        }

        // Get translations if available from our map
        const translations = POST_TYPE_TRANSLATIONS[slug] || POST_TYPE_TRANSLATIONS[slug.replace(/s$/, '')];
        
        // Use the WordPress label if it's different from slug (means it's a real label)
        // Otherwise fall back to our translations or formatted slug
        const isLabelValid = finalLabel && finalLabel.toLowerCase() !== slug.toLowerCase() && finalLabel !== formatSlugToName(slug);
        const displayName = isLabelValid ? finalLabel : (translations?.en || formatSlugToName(slug));
        
        // For Hebrew, use the WP label if it contains Hebrew chars, otherwise use our translation
        const hasHebrewChars = /[\u0590-\u05FF]/.test(finalLabel);
        const nameHe = hasHebrewChars ? finalLabel : (translations?.he || displayName);

        console.log('[Scan] Post type:', {
          slug,
          wpLabel: finalLabel,
          name: displayName,
          nameHe,
          hasHebrewChars,
          restBase: typeData.rest_base,
        });

        publicTypes[slug] = {
          slug,
          name: displayName,
          nameHe,
          description: typeDescription,
          restBase: typeData.rest_base || slug,
          hierarchical: typeData.hierarchical || false,
          isCore: ['post', 'page'].includes(slug),
        };
      }
    }

    console.log('[Scan] Found', Object.keys(publicTypes).length, 'public post types');
    return publicTypes;
  } catch (e) {
    console.error('Failed to fetch WP types:', e.message);
    return null;
  }
}

/**
 * Count URLs per post type from sitemap index
 */
async function countUrlsFromSitemapIndex(sitemapContent, sitemapType) {
  const counts = {};
  const sitemapRefs = [];

  // Extract sitemap references
  const locMatches = sitemapContent.matchAll(/<loc>([^<]+)<\/loc>/g);
  for (const match of locMatches) {
    sitemapRefs.push(match[1]);
  }

  for (const sitemapUrl of sitemapRefs) {
    let postType = null;

    // WordPress 5.5+ format: wp-sitemap-posts-1.xml, wp-sitemap-pages-1.xml
    const wpMatch = sitemapUrl.match(/wp-sitemap-([a-z0-9_-]+)-\d+\.xml/i);
    if (wpMatch) {
      postType = wpMatch[1];
    }

    // Yoast format: post-sitemap.xml, page-sitemap.xml
    const yoastMatch = sitemapUrl.match(/([a-z0-9_-]+)-sitemap\d*\.xml/i);
    if (!postType && yoastMatch) {
      postType = yoastMatch[1];
    }

    // Skip non-content sitemaps
    if (!postType || 
        postType === 'taxonomies' || 
        postType === 'users' ||
        postType === 'author' ||
        postType === 'category' ||
        postType === 'tag' ||
        postType === 'post_tag') {
      continue;
    }

    // Normalize to plural form
    if (postType === 'post') postType = 'posts';
    if (postType === 'page') postType = 'pages';

    // Quick count: fetch sitemap and count <url> tags
    try {
      const response = await fetch(sitemapUrl, {
        headers: { 'User-Agent': 'GhostPost-Platform/1.0' },
        signal: AbortSignal.timeout(8000),
        cache: 'no-store',
      });

      if (response.ok) {
        const content = await response.text();
        const urlCount = (content.match(/<url>/g) || []).length;
        
        if (!counts[postType]) {
          counts[postType] = { count: 0, sitemaps: [] };
        }
        counts[postType].count += urlCount;
        counts[postType].sitemaps.push(sitemapUrl);
      }
    } catch (e) {
      // Skip failed sitemaps
    }
  }

  return counts;
}

/**
 * Parse URLs from a single sitemap (not sitemap index)
 * Categorize by path structure to identify content types
 */
async function parseUrlsFromSingleSitemap(sitemapContent, siteUrl) {
  const counts = {};
  const urlsByPath = {};

  // Extract all URLs
  const urlMatches = sitemapContent.matchAll(/<loc>([^<]+)<\/loc>/g);
  const siteHost = new URL(siteUrl).hostname;

  for (const match of urlMatches) {
    const url = match[1];
    try {
      const urlObj = new URL(url);
      
      // Skip external URLs
      if (urlObj.hostname !== siteHost && !urlObj.hostname.endsWith(`.${siteHost}`)) {
        continue;
      }

      const path = urlObj.pathname.replace(/\/$/, '');
      const segments = path.split('/').filter(Boolean);

      // Determine category based on path structure
      let category = 'pages'; // default

      if (segments.length === 0) {
        // Homepage - add to pages category
        category = 'pages';
      } else if (segments.length === 1) {
        // Single segment: /about, /contact, /blog
        category = 'pages';
      } else if (segments.length >= 2) {
        // First, check if this is a taxonomy URL (categories, tags, etc.)
        const taxonomyInfo = detectTaxonomyUrl(segments);
        
        if (taxonomyInfo.isTaxonomy) {
          // This is a taxonomy page - categorize by parent type + taxonomy type
          category = `${taxonomyInfo.parentType}-${taxonomyInfo.taxonomyType}`;
          console.log(`[Scan] Detected taxonomy URL: ${url} -> ${category}`);
        } else {
          // Not a taxonomy - check for content type hints in path segments
          const firstSegment = segments[0].toLowerCase();
          const secondSegment = segments.length >= 2 ? segments[1].toLowerCase() : null;
          
          // Common content type prefixes
          const contentTypePrefixes = {
            'blog': 'posts',
            'posts': 'posts',
            'news': 'posts',
            'articles': 'posts',
            'products': 'products',
            'product': 'products',
            'shop': 'products',
            'services': 'services',
            'service': 'services',
            'projects': 'projects',
            'project': 'projects',
            'portfolio': 'portfolio',
            'work': 'portfolio',
            'case-studies': 'portfolio',
            'team': 'team',
            'our-team': 'team',
            'events': 'events',
            'event': 'events',
            'testimonials': 'testimonials',
            'reviews': 'testimonials',
            'faq': 'faq',
            'faqs': 'faq',
            'gallery': 'gallery',
            'galleries': 'gallery',
            'locations': 'locations',
            'branches': 'locations',
            'careers': 'careers',
            'jobs': 'careers',
            'technologies': 'technologies',
            'tech': 'technologies',
            'tools': 'technologies',
            'clients': 'clients',
            'partners': 'partners',
          };

          // Check for nested paths like /about/technologies/* (3+ segments with known second segment)
          if (segments.length >= 3 && secondSegment && contentTypePrefixes[secondSegment] !== undefined) {
            category = contentTypePrefixes[secondSegment];
          } else if (contentTypePrefixes[firstSegment] !== undefined) {
            category = contentTypePrefixes[firstSegment];
          } else {
            // Default to pages for unknown patterns
            category = 'pages';
          }
        }
      }

      if (!urlsByPath[category]) {
        urlsByPath[category] = [];
      }
      urlsByPath[category].push(url);
    } catch (e) {
      // Skip invalid URLs
    }
  }

  // Convert to counts format
  for (const [category, urls] of Object.entries(urlsByPath)) {
    counts[category] = {
      count: urls.length,
      sitemaps: [],
      urls: urls, // Store actual URLs for later use
    };
  }

  return counts;
}

/**
 * Crawl a website by following internal links (when no sitemap available)
 * Uses HTML parsing to discover pages
 * @param {string} siteUrl - The site URL to crawl
 * @param {number} maxPages - Maximum pages to crawl (default 100)
 */
async function crawlWebsiteLinks(siteUrl, maxPages = 100) {
  console.log('[Crawl] Starting website crawl for:', siteUrl);
  
  const visited = new Set();
  const queue = [siteUrl];
  const discoveredUrls = [];
  const siteHost = new URL(siteUrl).hostname;

  while (queue.length > 0 && visited.size < maxPages) {
    const currentUrl = queue.shift();
    
    // Normalize URL
    let normalizedUrl;
    try {
      const urlObj = new URL(currentUrl);
      // Remove trailing slash and hash
      normalizedUrl = `${urlObj.origin}${urlObj.pathname.replace(/\/$/, '')}`;
    } catch (e) {
      continue;
    }

    if (visited.has(normalizedUrl)) {
      continue;
    }
    visited.add(normalizedUrl);

    try {
      console.log(`[Crawl] Fetching ${visited.size}/${maxPages}: ${normalizedUrl}`);
      
      const response = await fetch(normalizedUrl, {
        headers: { 
          'User-Agent': 'GhostPost-Platform/1.0 (Content Discovery Bot)',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(10000),
        redirect: 'follow',
        cache: 'no-store',
      });

      if (!response.ok) {
        continue;
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) {
        continue;
      }

      const html = await response.text();
      discoveredUrls.push(normalizedUrl);

      // Extract all links from the page
      const linkRegex = /<a[^>]+href=["']([^"'#]+)["'][^>]*>/gi;
      let match;

      while ((match = linkRegex.exec(html)) !== null) {
        let href = match[1];
        
        // Skip external links, javascript:, mailto:, tel:, etc.
        if (href.startsWith('javascript:') || 
            href.startsWith('mailto:') || 
            href.startsWith('tel:') ||
            href.startsWith('#')) {
          continue;
        }

        // Resolve relative URLs
        try {
          const fullUrl = new URL(href, normalizedUrl);
          
          // Only follow internal links
          if (fullUrl.hostname !== siteHost && !fullUrl.hostname.endsWith(`.${siteHost}`)) {
            continue;
          }

          // Skip common non-page URLs
          const path = fullUrl.pathname.toLowerCase();
          if (path.match(/\.(jpg|jpeg|png|gif|svg|webp|pdf|doc|docx|xls|xlsx|zip|css|js|woff|woff2|ttf|eot)$/)) {
            continue;
          }

          // Skip common non-content paths
          if (path.startsWith('/wp-content/') ||
              path.startsWith('/wp-admin/') ||
              path.startsWith('/wp-includes/') ||
              path.startsWith('/feed/') ||
              path.startsWith('/cart/') ||
              path.startsWith('/checkout/') ||
              path.startsWith('/account/') ||
              path.startsWith('/login') ||
              path.startsWith('/register')) {
            continue;
          }

          const newUrl = `${fullUrl.origin}${fullUrl.pathname.replace(/\/$/, '')}`;
          if (!visited.has(newUrl) && !queue.includes(newUrl)) {
            queue.push(newUrl);
          }
        } catch (e) {
          // Invalid URL, skip
        }
      }
    } catch (e) {
      console.log(`[Crawl] Failed to fetch ${normalizedUrl}:`, e.message);
    }
  }

  console.log(`[Crawl] Finished. Discovered ${discoveredUrls.length} pages`);
  
  // Categorize discovered URLs
  return categorizeDiscoveredUrls(discoveredUrls, siteUrl);
}

/**
 * Categorize discovered URLs into content types
 */
function categorizeDiscoveredUrls(urls, siteUrl) {
  const counts = {};
  const urlsByCategory = {};
  const siteHost = new URL(siteUrl).hostname;

  for (const url of urls) {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname.replace(/\/$/, '');
      const segments = path.split('/').filter(Boolean);

      // Determine category based on path structure
      let category = 'pages';

      if (segments.length === 0) {
        // Homepage - add to pages
        category = 'pages';
      }

      if (segments.length >= 1) {
        const firstSegment = segments[0].toLowerCase();
        
        const contentTypePrefixes = {
          'blog': 'posts',
          'posts': 'posts',
          'news': 'posts',
          'articles': 'posts',
          'products': 'products',
          'product': 'products',
          'shop': 'products',
          'collections': 'products',
          'services': 'services',
          'service': 'services',
          'projects': 'projects',
          'project': 'projects',
          'portfolio': 'portfolio',
          'work': 'portfolio',
          'case-studies': 'portfolio',
          'team': 'team',
          'our-team': 'team',
          'events': 'events',
          'event': 'events',
          'testimonials': 'testimonials',
          'reviews': 'testimonials',
          'faq': 'faq',
          'faqs': 'faq',
          'gallery': 'gallery',
          'galleries': 'gallery',
          'locations': 'locations',
          'branches': 'locations',
          'careers': 'careers',
          'jobs': 'careers',
        };

        if (segments.length >= 2 && contentTypePrefixes[firstSegment]) {
          category = contentTypePrefixes[firstSegment];
        } else if (segments.length === 1) {
          category = 'pages';
        }
      }

      if (!urlsByCategory[category]) {
        urlsByCategory[category] = [];
      }
      urlsByCategory[category].push(url);
    } catch (e) {
      // Skip invalid URLs
    }
  }

  // Convert to counts format
  for (const [category, categoryUrls] of Object.entries(urlsByCategory)) {
    counts[category] = {
      count: categoryUrls.length,
      sitemaps: [],
      urls: categoryUrls,
      fromCrawl: true,
    };
  }

  return counts;
}

/**
 * Save discovered sitemaps to database
 * @param {Object} site - The site object
 * @param {Object} mainSitemap - The main sitemap data from fetchMainSitemap
 * @param {Object} sitemapCounts - The counts object with child sitemaps
 * @param {string|null} userId - User who triggered the scan (null for system)
 */
async function saveDiscoveredSitemaps(site, mainSitemap, sitemapCounts, userId = null) {
  if (!mainSitemap) return [];
  
  const savedSitemaps = [];
  
  try {
    // Determine sitemap type
    let sitemapType = 'STANDARD';
    if (mainSitemap.isIndex) {
      sitemapType = 'INDEX';
    } else if (mainSitemap.url.includes('news')) {
      sitemapType = 'NEWS';
    } else if (mainSitemap.url.includes('image')) {
      sitemapType = 'IMAGE';
    } else if (mainSitemap.url.includes('video')) {
      sitemapType = 'VIDEO';
    }

    // Save main sitemap
    const mainSitemapRecord = await prisma.siteSitemap.upsert({
      where: {
        siteId_url: {
          siteId: site.id,
          url: mainSitemap.url,
        },
      },
      update: {
        type: sitemapType,
        isIndex: mainSitemap.isIndex,
        content: mainSitemap.content,
        urlCount: mainSitemap.isIndex 
          ? Object.values(sitemapCounts).reduce((sum, c) => sum + (c.sitemaps?.length || 0), 0)
          : Object.values(sitemapCounts).reduce((sum, c) => sum + (c.count || 0), 0),
        lastScannedAt: new Date(),
        lastScannedBy: userId,
        scanStatus: 'COMPLETED',
        scanError: null,
        entityTypes: Object.keys(sitemapCounts),
      },
      create: {
        siteId: site.id,
        url: mainSitemap.url,
        type: sitemapType,
        isIndex: mainSitemap.isIndex,
        content: mainSitemap.content,
        urlCount: mainSitemap.isIndex 
          ? Object.values(sitemapCounts).reduce((sum, c) => sum + (c.sitemaps?.length || 0), 0)
          : Object.values(sitemapCounts).reduce((sum, c) => sum + (c.count || 0), 0),
        lastScannedAt: new Date(),
        lastScannedBy: userId,
        scanStatus: 'COMPLETED',
        entityTypes: Object.keys(sitemapCounts),
      },
    });
    
    savedSitemaps.push(mainSitemapRecord);
    console.log('[Scan] Saved main sitemap:', mainSitemap.url);

    // If it's a sitemap index, save child sitemaps
    if (mainSitemap.isIndex) {
      for (const [postType, data] of Object.entries(sitemapCounts)) {
        if (data.sitemaps && data.sitemaps.length > 0) {
          for (const childUrl of data.sitemaps) {
            try {
              const childRecord = await prisma.siteSitemap.upsert({
                where: {
                  siteId_url: {
                    siteId: site.id,
                    url: childUrl,
                  },
                },
                update: {
                  type: 'STANDARD',
                  isIndex: false,
                  parentId: mainSitemapRecord.id,
                  urlCount: data.count / data.sitemaps.length, // Approximate
                  lastScannedAt: new Date(),
                  lastScannedBy: userId,
                  scanStatus: 'COMPLETED',
                  scanError: null,
                  entityTypes: [postType],
                },
                create: {
                  siteId: site.id,
                  url: childUrl,
                  type: 'STANDARD',
                  isIndex: false,
                  parentId: mainSitemapRecord.id,
                  urlCount: data.count / data.sitemaps.length,
                  lastScannedAt: new Date(),
                  lastScannedBy: userId,
                  scanStatus: 'COMPLETED',
                  entityTypes: [postType],
                },
              });
              
              savedSitemaps.push(childRecord);
            } catch (e) {
              console.error('[Scan] Failed to save child sitemap:', childUrl, e.message);
            }
          }
        }
      }
      console.log('[Scan] Saved', savedSitemaps.length - 1, 'child sitemaps');
    }
  } catch (e) {
    console.error('[Scan] Error saving sitemaps:', e.message);
  }

  return savedSitemaps;
}

/**
 * Phase 1: Discover post types from sitemap
 * Works for all platforms, not just WordPress
 */
async function discoverPostTypes(site, customSitemapUrl = null, userId = null) {
  const siteUrl = site.url.replace(/\/$/, '');
  const result = {
    postTypes: [],
    source: {
      sitemap: false,
      sitemapUrl: null,
      sitemapType: null,
      sitemapNotFound: false,
      triedUrls: [],
      restApi: false,
    },
  };

  // Fetch main sitemap (with optional custom URL)
  const sitemap = await fetchMainSitemap(siteUrl, customSitemapUrl);
  if (sitemap) {
    result.source.sitemap = true;
    result.source.sitemapUrl = sitemap.url;
    result.source.sitemapType = sitemap.type;
    console.log('[Scan] Sitemap found:', sitemap.url, 'Type:', sitemap.type);
  } else {
    result.source.sitemapNotFound = true;
    console.log('[Scan] No sitemap found for site');
  }

  // For WordPress sites, try to get post types
  // Prefer plugin API if connected, fallback to public REST API
  let wpTypes = null;
  if (site.platform === 'wordpress') {
    // Check if plugin is connected
    const isPluginConnected = site.connectionStatus === 'CONNECTED' && site.siteKey && site.siteSecret;
    
    if (isPluginConnected) {
      // Use authenticated plugin API
      try {
        console.log('[Scan] Using authenticated plugin API for post types...');
        const pluginInfo = await getPluginSiteInfo(site);
        if (pluginInfo?.postTypes) {
          wpTypes = {};
          for (const pt of pluginInfo.postTypes) {
            wpTypes[pt.slug] = {
              name: pt.name,
              nameHe: POST_TYPE_TRANSLATIONS[pt.slug]?.he || pt.name,
              description: pt.description || '',
              restBase: pt.restBase || pt.slug,
              isCore: ['post', 'page', 'posts', 'pages'].includes(pt.slug),
            };
          }
          result.source.restApi = true;
          result.source.pluginConnected = true;
          console.log('[Scan] Plugin API returned types:', Object.keys(wpTypes));
        }
      } catch (e) {
        console.log('[Scan] Plugin API failed, falling back to public REST API:', e.message);
      }
    }
    
    // Fallback to public REST API if plugin didn't work
    if (!wpTypes) {
      wpTypes = await fetchWordPressTypes(siteUrl);
      if (wpTypes) {
        result.source.restApi = true;
        console.log('[Scan] WP REST API available, found types:', Object.keys(wpTypes));
      }
    }
  }

  // Count URLs from sitemap
  let sitemapCounts = {};
  if (sitemap) {
    if (sitemap.isIndex) {
      sitemapCounts = await countUrlsFromSitemapIndex(sitemap.content, sitemap.type);
    } else {
      // Single sitemap - parse URLs directly and categorize by path structure
      sitemapCounts = await parseUrlsFromSingleSitemap(sitemap.content, siteUrl);
    }
    console.log('[Scan] Sitemap URL counts:', sitemapCounts);
    
    // Save discovered sitemaps to database
    await saveDiscoveredSitemaps(site, sitemap, sitemapCounts, userId);
  }

  // Build post types list
  const postTypesMap = new Map();

  // Add from WP REST API (preferred source)
  if (wpTypes) {
    for (const [slug, typeData] of Object.entries(wpTypes)) {
      const normalizedSlug = slug === 'post' ? 'posts' : slug === 'page' ? 'pages' : slug;
      
      postTypesMap.set(normalizedSlug, {
        slug: normalizedSlug,
        name: typeData.name,
        nameHe: typeData.nameHe,
        description: typeData.description,
        restEndpoint: typeData.restBase,
        isCore: typeData.isCore,
        isPublic: true,
        entityCount: sitemapCounts[normalizedSlug]?.count || sitemapCounts[slug]?.count || 0,
        sitemaps: sitemapCounts[normalizedSlug]?.sitemaps || sitemapCounts[slug]?.sitemaps || [],
      });
    }
  }

  // Add from sitemap (for non-WordPress or additional types)
  for (const [postType, data] of Object.entries(sitemapCounts)) {
    if (!postTypesMap.has(postType)) {
      // Get translations if available
      const translations = POST_TYPE_TRANSLATIONS[postType] || POST_TYPE_TRANSLATIONS[postType.replace(/s$/, '')];
      const name = translations?.en || formatSlugToName(postType);
      const nameHe = translations?.he || name;

      postTypesMap.set(postType, {
        slug: postType,
        name,
        nameHe,
        description: '',
        restEndpoint: postType,
        isCore: ['posts', 'pages'].includes(postType),
        isPublic: true, // Assume public if in sitemap
        entityCount: data.count,
        sitemaps: data.sitemaps,
      });
    }
  }

  // Ensure core types exist
  if (!postTypesMap.has('posts')) {
    postTypesMap.set('posts', {
      slug: 'posts',
      name: 'Posts',
      nameHe: 'פוסטים',
      description: 'Blog posts',
      restEndpoint: 'posts',
      isCore: true,
      isPublic: true,
      entityCount: 0,
      sitemaps: [],
    });
  }

  if (!postTypesMap.has('pages')) {
    postTypesMap.set('pages', {
      slug: 'pages',
      name: 'Pages',
      nameHe: 'עמודים',
      description: 'Static pages',
      restEndpoint: 'pages',
      isCore: true,
      isPublic: true,
      entityCount: 0,
      sitemaps: [],
    });
  }

  // Post types to exclude from discovery (internal/private types)
  const excludedPostTypes = [
    'elementor_library',     // Elementor templates
    'elementor_font',        // Elementor fonts
    'elementor_icons',       // Elementor icons
    'elementor_snippet',     // Elementor snippets
    'e-landing-page',        // Elementor landing pages
    'e-floating-buttons',    // Elementor floating buttons
    'oembed_cache',          // oEmbed cache
    'wp_global_styles',      // Global styles
    'custom_css',            // Custom CSS
    'customize_changeset',   // Customizer changesets
    'user_request',          // GDPR user requests
    'acf-field-group',       // ACF field groups
    'acf-field',             // ACF fields
    'acf-post-type',         // ACF post types
    'acf-taxonomy',          // ACF taxonomies
    'acf-ui-options-page',   // ACF options pages
    'wp_template',           // Block templates
    'wp_template_part',      // Block template parts
    'wp_navigation',         // Navigation menus
    'wp_font_family',        // Font families
    'wp_font_face',          // Font faces
  ];

  // Convert to array, filter excluded types, and sort (core first, then by count)
  result.postTypes = Array.from(postTypesMap.values())
    .filter(pt => !excludedPostTypes.includes(pt.slug))
    .sort((a, b) => {
      if (a.isCore && !b.isCore) return -1;
      if (!a.isCore && b.isCore) return 1;
      return b.entityCount - a.entityCount;
    });

  return result;
}

// ============================================
// PHASE 2: Entity Population
// ============================================

/**
 * Fetch all URLs from a sitemap
 */
async function fetchSitemapUrls(sitemapUrl) {
  try {
    const response = await fetch(sitemapUrl, {
      headers: { 'User-Agent': 'GhostPost-Platform/1.0' },
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    });

    if (!response.ok) return [];

    const content = await response.text();
    const urls = [];

    const urlRegex = /<url>([\s\S]*?)<\/url>/gi;
    let match;

    while ((match = urlRegex.exec(content)) !== null) {
      const urlBlock = match[1];
      
      const locMatch = urlBlock.match(/<loc>([^<]+)<\/loc>/);
      if (!locMatch) continue;

      const url = locMatch[1];
      const lastmodMatch = urlBlock.match(/<lastmod>([^<]+)<\/lastmod>/);
      const imageMatch = urlBlock.match(/<image:loc>([^<]+)<\/image:loc>/);
      const imageTitleMatch = urlBlock.match(/<image:title>([^<]+)<\/image:title>/);

      urls.push({
        url,
        lastmod: lastmodMatch ? lastmodMatch[1] : null,
        image: imageMatch ? imageMatch[1] : null,
        imageTitle: imageTitleMatch ? imageTitleMatch[1] : null,
      });
    }

    return urls;
  } catch (e) {
    console.error('Error fetching sitemap:', sitemapUrl, e.message);
    return [];
  }
}

/**
 * Extract slug from URL
 * Returns empty string for homepage, null only for invalid URLs
 */
function extractSlugFromUrl(url) {
  try {
    const urlObj = new URL(url);
    let path = urlObj.pathname.replace(/\/$/, '');
    const segments = path.split('/').filter(Boolean);
    // Return empty string for homepage (valid entity), or the last segment
    return segments.length > 0 ? segments[segments.length - 1] : '';
  } catch (e) {
    return null;
  }
}

/**
 * Convert slug to title
 */
function slugToTitle(slug) {
  if (!slug || slug === 'homepage') return 'עמוד הבית';
  return slug
    .replace(/-/g, ' ')
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
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
 * Fetch posts from WP REST API
 */
async function fetchWpRestPosts(siteUrl, restEndpoint, page = 1, perPage = 100) {
  const url = `${siteUrl}/wp-json/wp/v2/${restEndpoint}?page=${page}&per_page=${perPage}&_fields=id,slug,title,link,date,modified,status,excerpt,featured_media`;
  console.log(`[Scan] Fetching WP REST: ${url}`);
  
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'GhostPost-Platform/1.0' },
      signal: AbortSignal.timeout(20000),
      cache: 'no-store',
    });

    if (!response.ok) {
      console.log(`[Scan] WP REST failed: ${response.status} ${response.statusText}`);
      return { posts: [], totalPages: 0 };
    }

    const posts = await response.json();
    const totalPages = parseInt(response.headers.get('X-WP-TotalPages') || '1');
    console.log(`[Scan] WP REST returned ${posts.length} posts, page ${page}/${totalPages}`);

    return { posts, totalPages };
  } catch (e) {
    console.error('[Scan] Error fetching WP REST posts:', e.message);
    return { posts: [], totalPages: 0 };
  }
}

/**
 * Phase 2: Populate entities for selected post types
 */
async function populateEntities(site, entityTypes, options = {}) {
  console.log('[Scan] Phase 2: Starting entity population');
  console.log('[Scan] Entity types to populate:', entityTypes.map(t => t.slug));
  
  const siteUrl = site.url.replace(/\/$/, '');
  const stats = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    byType: {},
  };

  // Limitation placeholder (to be connected to plan limits)
  const maxEntitiesPerType = options.limit || null; // null = unlimited for now

  // Update progress helper
  const updateProgress = async (progress, message) => {
    await prisma.site.update({
      where: { id: site.id },
      data: {
        entitySyncProgress: progress,
        entitySyncMessage: message,
      },
    });
  };

  let typeIndex = 0;
  for (const entityType of entityTypes) {
    console.log(`[Scan] Processing type: ${entityType.slug} (${entityType.name})`);
    const typeStats = { created: 0, updated: 0, skipped: 0 };
    const progressBase = Math.floor((typeIndex / entityTypes.length) * 80);
    await updateProgress(progressBase + 10, `Populating ${entityType.name}...`);

    // First, try WP REST API if available (richer data)
    let entities = [];
    let usedRestApi = false;

    if (site.platform === 'wordpress') {
      console.log(`[Scan] Trying WP REST API for ${entityType.slug}, endpoint: ${entityType.apiEndpoint || entityType.slug}`);
      let page = 1;
      let hasMore = true;
      
      while (hasMore) {
        const { posts, totalPages } = await fetchWpRestPosts(siteUrl, entityType.apiEndpoint || entityType.slug, page);
        
        if (posts.length > 0) {
          usedRestApi = true;
          for (const post of posts) {
            entities.push({
              externalId: String(post.id),
              slug: post.slug,
              title: post.title?.rendered || post.title || slugToTitle(post.slug),
              url: post.link,
              excerpt: post.excerpt?.rendered?.replace(/<[^>]*>/g, '').trim() || null,
              publishedAt: post.date ? new Date(post.date) : null,
              modifiedAt: post.modified ? new Date(post.modified) : null,
              featuredMediaId: post.featured_media || null,
            });

            // Check limit
            if (maxEntitiesPerType && entities.length >= maxEntitiesPerType) {
              hasMore = false;
              break;
            }
          }
        }
        
        hasMore = posts.length > 0 && page < totalPages;
        if (maxEntitiesPerType && entities.length >= maxEntitiesPerType) hasMore = false;
        page++;
      }
    }

    // If REST API didn't work or returned nothing, use sitemap
    if (entities.length === 0) {
      console.log(`[Scan] REST API returned no results, trying sitemap for ${entityType.slug}`);
      // Get sitemap URLs for this type (stored when types were saved)
      const sitemaps = entityType.sitemaps || [];
      console.log(`[Scan] Sitemaps for ${entityType.slug}:`, sitemaps);
      
      // For sites with sitemap index, use the stored sitemaps
      if (sitemaps.length > 0) {
        for (const sitemapUrl of sitemaps) {
          const sitemapUrls = await fetchSitemapUrls(sitemapUrl);
          
          for (const urlData of sitemapUrls) {
            const slug = extractSlugFromUrl(urlData.url);
            if (slug === null) continue; // Skip only invalid URLs, not homepage (empty slug)

            // Skip archive pages for non-page entity types
            // Archive pages like /blog, /services should be treated as pages, not posts
            if (entityType.slug !== 'pages' && isArchivePage(urlData.url, entityType.slug)) {
              console.log(`[Scan] Skipping archive page for ${entityType.slug}: ${urlData.url}`);
              continue;
            }

            // Determine title - use 'Homepage' for empty slug
            const title = slug === '' 
              ? 'עמוד הבית' 
              : (urlData.imageTitle || slugToTitle(slug));

            entities.push({
              externalId: null,
              slug: slug || 'homepage', // Use 'homepage' as slug for the root page
              title,
              url: urlData.url,
              excerpt: null,
              publishedAt: urlData.lastmod ? new Date(urlData.lastmod) : null,
              modifiedAt: null,
              featuredImage: urlData.image || null,
            });

            // Check limit
            if (maxEntitiesPerType && entities.length >= maxEntitiesPerType) break;
          }
          
          if (maxEntitiesPerType && entities.length >= maxEntitiesPerType) break;
        }
      } else {
        // For sites with a single flat sitemap (non-WordPress), re-fetch and filter
        console.log(`[Scan] No stored sitemaps, re-fetching main sitemap for ${entityType.slug}`);
        const sitemap = await fetchMainSitemap(siteUrl);
        
        if (sitemap && !sitemap.isIndex) {
          // Parse sitemap and get URLs categorized by type
          const categorizedUrls = await parseUrlsFromSingleSitemap(sitemap.content, siteUrl);
          const typeUrls = categorizedUrls[entityType.slug]?.urls || [];
          
          console.log(`[Scan] Found ${typeUrls.length} URLs for ${entityType.slug} from sitemap`);
          
          for (const url of typeUrls) {
            const slug = extractSlugFromUrl(url);
            if (slug === null) continue; // Skip only invalid URLs, not homepage (empty slug)

            // Skip archive pages
            if (entityType.slug !== 'pages' && isArchivePage(url, entityType.slug)) {
              console.log(`[Scan] Skipping archive page for ${entityType.slug}: ${url}`);
              continue;
            }

            // Determine title - use 'Homepage' for empty slug
            const title = slug === '' 
              ? 'עמוד הבית' 
              : slugToTitle(slug);

            entities.push({
              externalId: null,
              slug: slug || 'homepage', // Use 'homepage' as slug for the root page
              title,
              url: url,
              excerpt: null,
              publishedAt: null,
              modifiedAt: null,
              featuredImage: null,
            });

            // Check limit
            if (maxEntitiesPerType && entities.length >= maxEntitiesPerType) break;
          }
        }
      }
    }

    console.log(`[Scan] Found ${entities.length} entities for ${entityType.slug} (source: ${usedRestApi ? 'REST API' : 'sitemap'})`);

    // Save entities to database
    for (const entity of entities) {
      try {
        // Check if exists
        const whereClause = entity.externalId 
          ? { siteId_externalId: { siteId: site.id, externalId: entity.externalId } }
          : { siteId_entityTypeId_slug: { siteId: site.id, entityTypeId: entityType.id, slug: entity.slug } };

        const existing = entity.externalId
          ? await prisma.siteEntity.findUnique({ where: whereClause })
          : await prisma.siteEntity.findFirst({ 
              where: { siteId: site.id, entityTypeId: entityType.id, slug: entity.slug } 
            });

        const entityData = {
          title: entity.title,
          slug: entity.slug,
          url: entity.url,
          excerpt: entity.excerpt,
          featuredImage: entity.featuredImage || null,
          publishedAt: entity.publishedAt,
          status: 'PUBLISHED',
          metadata: {
            source: usedRestApi ? 'wp-rest-api' : 'sitemap',
            externalId: entity.externalId,
            modifiedAt: entity.modifiedAt,
            featuredMediaId: entity.featuredMediaId,
            needsDeepCrawl: true, // Flag for phase 3
          },
        };

        if (existing) {
          await prisma.siteEntity.update({
            where: { id: existing.id },
            data: entityData,
          });
          typeStats.updated++;
        } else {
          // Only include externalId if it's not null (to avoid unique constraint issues)
          const createData = {
            siteId: site.id,
            entityTypeId: entityType.id,
            ...entityData,
          };
          if (entity.externalId) {
            createData.externalId = entity.externalId;
          }
          
          await prisma.siteEntity.create({
            data: createData,
          });
          typeStats.created++;
        }
      } catch (e) {
        console.error('Error saving entity:', e.message);
        stats.errors++;
      }
    }

    console.log(`[Scan] ${entityType.slug} stats:`, typeStats);
    stats.created += typeStats.created;
    stats.updated += typeStats.updated;
    stats.byType[entityType.slug] = typeStats;
    typeIndex++;
  }

  console.log('[Scan] Phase 2 complete. Total stats:', stats);
  await updateProgress(90, 'Finalizing...');
  return stats;
}

// ============================================
// PHASE 3: Deep Crawl
// ============================================

/**
 * Extract main content text from HTML
 * Removes navigation, footer, sidebars, scripts, etc.
 */
function extractMainContent(html) {
  // Remove script and style tags
  let content = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  content = content.replace(/<style[\s\S]*?<\/style>/gi, '');
  content = content.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
  
  // Try to find main content area
  let mainContent = null;
  
  // Priority order for content containers
  const contentSelectors = [
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<div[^>]*(?:class|id)=["'][^"']*(?:content|main|post|entry|article)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*(?:class|id)=["'][^"']*(?:page-content|post-content|entry-content|article-content)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
  ];
  
  for (const regex of contentSelectors) {
    const match = content.match(regex);
    if (match && match[1]) {
      mainContent = match[1];
      break;
    }
  }
  
  // If no main content found, use body
  if (!mainContent) {
    const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    mainContent = bodyMatch ? bodyMatch[1] : content;
  }
  
  // Remove common non-content elements
  mainContent = mainContent.replace(/<header[\s\S]*?<\/header>/gi, '');
  mainContent = mainContent.replace(/<footer[\s\S]*?<\/footer>/gi, '');
  mainContent = mainContent.replace(/<nav[\s\S]*?<\/nav>/gi, '');
  mainContent = mainContent.replace(/<aside[\s\S]*?<\/aside>/gi, '');
  mainContent = mainContent.replace(/<form[\s\S]*?<\/form>/gi, '');
  mainContent = mainContent.replace(/<!--[\s\S]*?-->/g, '');
  
  // Strip remaining HTML tags
  mainContent = mainContent.replace(/<[^>]+>/g, ' ');
  
  // Clean up whitespace
  mainContent = mainContent.replace(/\s+/g, ' ').trim();
  
  // Decode HTML entities
  mainContent = decodeHtmlEntities(mainContent);
  
  return mainContent;
}

/**
 * Extract metadata from HTML page with enhanced field extraction
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
      // Basic
      title: null,
      h1: null,
      description: null,
      
      // SEO
      canonicalUrl: null,
      focusKeyword: null,
      keywords: null,
      robots: {
        index: true,
        follow: true,
        noindex: false,
        nofollow: false,
      },
      
      // Open Graph (Facebook)
      ogTitle: null,
      ogDescription: null,
      ogImage: null,
      ogUrl: null,
      ogType: null,
      ogSiteName: null,
      ogLocale: null,
      
      // Twitter Card
      twitterCard: null,
      twitterTitle: null,
      twitterDescription: null,
      twitterImage: null,
      twitterSite: null,
      twitterCreator: null,
      
      // Article metadata
      author: null,
      publishDate: null,
      modifiedDate: null,
      
      // Content
      mainContent: null,
      wordCount: 0,
      
      // Structured data
      schema: [],
      
      // Raw HTML for AI analysis if needed
      _html: html,
    };

    // Title tag
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
    // 3. If only one H1 and it's not generic, use it
    
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
    
    console.log(`[Scan] Found ${allH1s.length} H1s: ${allH1s.slice(0, 5).join(', ')}${allH1s.length > 5 ? '...' : ''}`);
    
    // If multiple H1s, this is likely a listing page (blog archive, category, etc.)
    // In this case, DON'T use H1 - let OG title take precedence
    if (allH1s.length > 1) {
      console.log(`[Scan] Multiple H1s detected (${allH1s.length}) - likely a listing page, skipping H1 for title`);
      bestH1 = null;
    } else if (allH1s.length === 1) {
      // Single H1 - use it if not generic
      if (!isGenericH1(allH1s[0])) {
        bestH1 = allH1s[0];
        console.log(`[Scan] Single H1 found: "${bestH1}"`);
      } else {
        console.log(`[Scan] Single H1 is generic ("${allH1s[0]}"), skipping`);
      }
    }
    
    metadata.h1 = bestH1;
    if (bestH1) {
      console.log(`[Scan] Selected H1: "${bestH1}"`);
    }

    // Meta tags - comprehensive extraction
    const metaRegex = /<meta\s+([^>]+)>/gi;
    let metaMatch;
    while ((metaMatch = metaRegex.exec(html)) !== null) {
      const attrs = metaMatch[1];
      
      const nameMatch = attrs.match(/(?:name|property)=["']([^"']+)["']/i);
      const contentMatch = attrs.match(/content=["']([^"']*?)["']/i);
      
      if (nameMatch && contentMatch) {
        const name = nameMatch[1].toLowerCase();
        const content = decodeHtmlEntities(contentMatch[1]);
        
        switch (name) {
          // Basic SEO
          case 'description':
            metadata.description = content;
            break;
          case 'keywords':
            metadata.keywords = content;
            break;
          case 'author':
            metadata.author = content;
            break;
            
          // Robots
          case 'robots':
            const robotsContent = content.toLowerCase();
            metadata.robots.noindex = robotsContent.includes('noindex');
            metadata.robots.nofollow = robotsContent.includes('nofollow');
            metadata.robots.index = !metadata.robots.noindex;
            metadata.robots.follow = !metadata.robots.nofollow;
            break;
          case 'googlebot':
            // Also check googlebot-specific directives
            if (content.toLowerCase().includes('noindex')) {
              metadata.robots.noindex = true;
              metadata.robots.index = false;
            }
            break;
            
          // Open Graph
          case 'og:title':
            metadata.ogTitle = content;
            break;
          case 'og:description':
            metadata.ogDescription = content;
            break;
          case 'og:image':
            metadata.ogImage = content;
            break;
          case 'og:url':
            metadata.ogUrl = content;
            break;
          case 'og:type':
            metadata.ogType = content;
            break;
          case 'og:site_name':
            metadata.ogSiteName = content;
            break;
          case 'og:locale':
            metadata.ogLocale = content;
            break;
            
          // Twitter Card
          case 'twitter:card':
            metadata.twitterCard = content;
            break;
          case 'twitter:title':
            metadata.twitterTitle = content;
            break;
          case 'twitter:description':
            metadata.twitterDescription = content;
            break;
          case 'twitter:image':
            metadata.twitterImage = content;
            break;
          case 'twitter:site':
            metadata.twitterSite = content;
            break;
          case 'twitter:creator':
            metadata.twitterCreator = content;
            break;
            
          // Article dates
          case 'article:published_time':
            metadata.publishDate = content;
            break;
          case 'article:modified_time':
            metadata.modifiedDate = content;
            break;
            
          // Yoast/RankMath focus keyword (stored in various ways)
          case 'focus-keyword':
          case 'focus_keyword':
            metadata.focusKeyword = content;
            break;
        }
      }
    }

    // Canonical URL - try both href orders
    let canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
    if (!canonicalMatch) {
      canonicalMatch = html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
    }
    if (canonicalMatch) metadata.canonicalUrl = canonicalMatch[1];

    // Extract main content
    metadata.mainContent = extractMainContent(html);
    metadata.wordCount = metadata.mainContent.split(/\s+/).filter(w => w.length > 0).length;

    // JSON-LD structured data
    const jsonLdRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let jsonLdMatch;
    while ((jsonLdMatch = jsonLdRegex.exec(html)) !== null) {
      try {
        const schemaData = JSON.parse(jsonLdMatch[1]);
        metadata.schema.push(schemaData);
        
        // Extract additional data from schema
        if (schemaData['@type'] === 'Article' || schemaData['@type'] === 'BlogPosting' || schemaData['@type'] === 'NewsArticle') {
          if (!metadata.author && schemaData.author?.name) {
            metadata.author = schemaData.author.name;
          }
          if (!metadata.publishDate && schemaData.datePublished) {
            metadata.publishDate = schemaData.datePublished;
          }
          if (!metadata.modifiedDate && schemaData.dateModified) {
            metadata.modifiedDate = schemaData.dateModified;
          }
          if (!metadata.focusKeyword && schemaData.keywords) {
            // First keyword is often the focus keyword
            const keywords = Array.isArray(schemaData.keywords) 
              ? schemaData.keywords 
              : schemaData.keywords.split(',').map(k => k.trim());
            if (keywords.length > 0) {
              metadata.focusKeyword = keywords[0];
            }
          }
        }
      } catch (e) {
        // Invalid JSON-LD
      }
    }

    // Clean up - remove _html from returned metadata (it's only for internal use)
    delete metadata._html;

    return { ...metadata, _rawHtml: html };
  } catch (e) {
    console.error('Error extracting metadata:', url, e.message);
    return null;
  }
}

/**
 * Use AI to extract/enhance content when code-based extraction is uncertain
 */
async function enrichContentWithAI(url, rawHtml, existingMetadata) {
  try {
    // Prepare a condensed version of the HTML (first 30KB to avoid token limits)
    const condensedHtml = rawHtml.substring(0, 30000);
    
    const schema = z.object({
      title: z.string().nullable().describe('The main title/H1 of the page'),
      description: z.string().nullable().describe('A concise description of the page content (max 160 chars)'),
      focusKeyword: z.string().nullable().describe('The main keyword/topic this page is about'),
      mainContent: z.string().nullable().describe('The main text content of the page, cleaned and readable'),
      contentType: z.enum(['article', 'service', 'product', 'portfolio', 'page', 'other']).describe('The type of content'),
      confidence: z.number().min(0).max(1).describe('Confidence score of the extraction (0-1)'),
    });
    
    const result = await generateStructuredResponse({
      system: `You are an expert content analyzer. Extract key information from web pages.
Your task is to identify the main content, title, and focus keyword from the HTML.
Ignore navigation, footers, sidebars, and other non-content elements.
Provide clean, readable text without HTML artifacts or encoded characters.
For Hebrew content, ensure proper character handling.`,
      prompt: `Analyze this webpage and extract key content information.
URL: ${url}
Existing metadata found: ${JSON.stringify({
  title: existingMetadata.title,
  h1: existingMetadata.h1,
  description: existingMetadata.description,
})}

HTML content (truncated):
${condensedHtml}

Extract:
1. The main title (prefer H1 over meta title)
2. A clean description (meta description or generate one)
3. The main focus keyword/topic
4. The main content text (cleaned)
5. What type of content this is`,
      schema,
      temperature: 0.3,
    });
    
    return result;
  } catch (e) {
    console.error('AI enrichment failed for:', url, e.message);
    return null;
  }
}

/**
 * Phase 3: Deep crawl entities to extract rich metadata
 * @param {Object} site - The site object
 * @param {Object} options - Options for crawling
 * @param {number} options.batchSize - Number of entities to crawl per batch (default: 50)
 * @param {boolean} options.forceRescan - If true, crawl all entities regardless of existing seoData
 * @param {boolean} options.createFromSitemap - If true, create entities from sitemap URLs while crawling
 * @param {string} options.entityTypeId - If provided, only crawl entities of this type
 */
async function deepCrawlEntities(site, options = {}) {
  const createFromSitemap = options.createFromSitemap || false;
  const entityTypeId = options.entityTypeId || null;
  console.log('[Scan] Phase 3: Starting deep crawl', { forceRescan: options.forceRescan, createFromSitemap, entityTypeId });
  
  const stats = {
    crawled: 0,
    enriched: 0,
    aiCalls: 0,  // Track AI enrichment calls for credit tracking
    failed: 0,
    skipped: 0,
    total: 0,
    created: 0,
    updated: 0,
  };

  const batchSize = options.batchSize || 50;
  const forceRescan = options.forceRescan || false;
  
  // Update progress helper
  const updateProgress = async (progress, message) => {
    await prisma.site.update({
      where: { id: site.id },
      data: {
        entitySyncProgress: progress,
        entitySyncMessage: message,
      },
    });
  };

  // If createFromSitemap is true and no entities exist, create them from sitemap while crawling
  if (createFromSitemap) {
    console.log('[Scan] createFromSitemap mode: Creating entities from sitemap while crawling');
    await updateProgress(5, 'Fetching sitemap URLs...');
    
    // Get enabled entity types - filter by entityTypeId if provided
    const entityTypesWhere = { siteId: site.id, isEnabled: true };
    if (entityTypeId) {
      entityTypesWhere.id = entityTypeId;
    }
    
    const entityTypes = await prisma.siteEntityType.findMany({
      where: entityTypesWhere,
    });
    
    if (entityTypes.length === 0) {
      return { ...stats, message: entityTypeId ? 'Entity type not found or not enabled.' : 'No entity types enabled. Please enable entity types first.' };
    }
    
    console.log(`[Scan] Processing ${entityTypes.length} entity type(s):`, entityTypes.map(et => et.slug));
    
    // Fetch sitemap URLs for each entity type
    const urlsToProcess = [];
    
    for (const entityType of entityTypes) {
      // Get sitemap URLs for this type
      const sitemapUrls = entityType.sitemaps || [];
      let typeUrls = [];
      
      for (const sitemapUrl of sitemapUrls) {
        try {
          const urls = await fetchSitemapUrls(sitemapUrl);
          typeUrls.push(...urls);
        } catch (e) {
          console.error(`[Scan] Error fetching sitemap ${sitemapUrl}:`, e.message);
        }
      }
      
      // If no sitemap URLs, try to guess from site URL
      if (typeUrls.length === 0) {
        const mainSitemap = await fetchMainSitemap(site.url);
        if (mainSitemap?.sitemaps) {
          for (const sm of mainSitemap.sitemaps) {
            if (sm.includes(entityType.slug) || (entityType.slug === 'posts' && sm.includes('post'))) {
              try {
                const urls = await fetchSitemapUrls(sm);
                typeUrls.push(...urls);
              } catch (e) {
                console.error(`[Scan] Error fetching sitemap ${sm}:`, e.message);
              }
            }
          }
        }
      }
      
      // Add URLs with entity type info
      for (const urlData of typeUrls) {
        urlsToProcess.push({ url: urlData.url, entityType });
      }
    }
    
    console.log(`[Scan] Found ${urlsToProcess.length} URLs to process from sitemap`);
    stats.total = urlsToProcess.length;
    
    // If no sitemap URLs, skip to standard flow (will crawl existing entities)
    if (urlsToProcess.length === 0) {
      console.log('[Scan] No URLs from sitemap, will try crawling existing entities instead');
    } else {
      // Process URLs in batches - crawl and create entities
      let processedCount = 0;
      
      for (let i = 0; i < urlsToProcess.length; i += batchSize) {
        const batch = urlsToProcess.slice(i, i + batchSize);
        
        console.log(`[Scan] Processing batch ${Math.floor(i / batchSize) + 1}, URLs ${i + 1}-${i + batch.length} of ${urlsToProcess.length}`);
        
        for (const { url, entityType } of batch) {
          processedCount++;
        const progress = Math.floor((processedCount / urlsToProcess.length) * 100);
        await updateProgress(progress, `Crawling (${processedCount}/${urlsToProcess.length}): ${url.substring(0, 50)}...`);
        
        // Extract slug from URL
        const urlPath = new URL(url).pathname;
        const slug = urlPath.replace(/^\//, '').replace(/\/$/, '').split('/').pop() || 'homepage';
        
        // Check if entity already exists
        const existing = await prisma.siteEntity.findFirst({
          where: { siteId: site.id, entityTypeId: entityType.id, slug },
        });
        
        // Crawl the page
        const metadata = await extractPageMetadata(url);
        stats.crawled++;
        
        if (metadata) {
          // Debug: log title extraction results
          console.log(`[Scan] Title extraction for ${url}:`, {
            h1: metadata.h1,
            ogTitle: metadata.ogTitle,
            title: metadata.title,
            slug
          });
          
          // Build SEO data from extracted metadata
          const seoData = {
            title: metadata.ogTitle || metadata.title,
            description: metadata.ogDescription || metadata.description,
            canonicalUrl: metadata.canonicalUrl,
            focusKeyword: metadata.focusKeyword,
            keywords: metadata.keywords,
            robots: metadata.robots,
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
            schema: metadata.schema,
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
          
          // Get best title (prefer H1 if not generic, then OG title, then cleaned page title)
          const cleanedTitle = cleanPageTitle(metadata.title);
          let title;
          
          if (metadata.h1 && !isGenericTitle(metadata.h1)) {
            title = metadata.h1;
          } else if (metadata.ogTitle && !isGenericTitle(metadata.ogTitle)) {
            title = metadata.ogTitle;
          } else if (cleanedTitle && !isGenericTitle(cleanedTitle)) {
            title = cleanedTitle;
          } else {
            // For homepage, use a proper title; for other pages, use slug-based title
            if (slug === '' || slug === 'homepage' || urlPath === '/' || urlPath === '') {
              title = 'עמוד הבית';
            } else {
              title = slugToTitle(slug);
            }
          }
          
          console.log(`[Scan] Title decision for ${url}:`, {
            h1: metadata.h1,
            isH1Generic: isGenericTitle(metadata.h1),
            ogTitle: metadata.ogTitle,
            cleanedTitle,
            slugTitle: slugToTitle(slug),
            finalTitle: title
          });
          
          // Get featured image
          const featuredImage = metadata.ogImage || metadata.twitterImage || null;
          
          const entityData = {
            title,
            slug,
            url,
            excerpt: metadata.description || metadata.ogDescription || null,
            featuredImage,
            status: 'PUBLISHED',
            seoData,
            metadata: {
              source: 'deep-crawl',
              lastCrawledAt: new Date().toISOString(),
              author: metadata.author,
              publishDate: metadata.publishDate,
              modifiedDate: metadata.modifiedDate,
              wordCount: metadata.wordCount,
              needsDeepCrawl: false,
              h1Issue: !metadata.h1,
            },
          };
          
          if (existing) {
            await prisma.siteEntity.update({
              where: { id: existing.id },
              data: entityData,
            });
            stats.updated++;
          } else {
            await prisma.siteEntity.create({
              data: {
                siteId: site.id,
                entityTypeId: entityType.id,
                ...entityData,
              },
            });
            stats.created++;
          }
          stats.enriched++;
        } else {
          stats.failed++;
          // Still create a basic entity record even if crawl failed
          if (!existing) {
            await prisma.siteEntity.create({
              data: {
                siteId: site.id,
                entityTypeId: entityType.id,
                title: slugToTitle(slug),
                slug,
                url,
                status: 'PUBLISHED',
                metadata: {
                  source: 'sitemap',
                  needsDeepCrawl: true,
                  crawlError: 'Failed to extract metadata',
                },
              },
            });
            stats.created++;
          }
        }
      }
    }
    } // end else block for processing sitemap URLs
    
    console.log('[Scan] createFromSitemap complete. Stats:', stats);
    
    // If no URLs found from sitemap, fall through to crawl existing entities
    if (urlsToProcess.length === 0) {
      console.log('[Scan] No URLs from sitemap, falling through to crawl existing entities');
    } else {
      // If we processed sitemap URLs, return the stats
      return stats;
    }
  }

  // Standard flow: crawl existing entities
  // Get total count for progress calculation
  // When forceRescan is false, crawl entities that:
  // 1. Have needsDeepCrawl flag set in metadata
  // 2. Have no seoData (never crawled)
  // 3. Have title that looks like a slug (needs real title)
  const baseWhere = { siteId: site.id };
  
  // Filter by entityTypeId if provided
  if (entityTypeId) {
    baseWhere.entityTypeId = entityTypeId;
  }
  
  const whereClause = forceRescan 
    ? baseWhere
    : { 
        ...baseWhere,
        OR: [
          { seoData: { equals: null } },
          { seoData: { equals: {} } },
          { metadata: { path: ['needsDeepCrawl'], equals: true } },
        ],
      };
  
  const totalCount = await prisma.siteEntity.count({ where: whereClause });
  stats.total = totalCount;
  
  console.log(`[Scan] Total entities to crawl: ${totalCount} (forceRescan: ${forceRescan}, entityTypeId: ${entityTypeId || 'all'})`);

  if (totalCount === 0) {
    return { ...stats, message: 'No entities to crawl' };
  }

  let offset = 0;
  let processedCount = 0;

  // Process entities in batches
  while (offset < totalCount) {
    // Get next batch of entities
    const entities = await prisma.siteEntity.findMany({
      where: whereClause,
      skip: offset,
      take: batchSize,
      orderBy: forceRescan ? { updatedAt: 'asc' } : { createdAt: 'asc' },
    });

    if (entities.length === 0) break;

    console.log(`[Scan] Processing batch ${Math.floor(offset / batchSize) + 1}, entities ${offset + 1}-${offset + entities.length} of ${totalCount}`);

    for (const entity of entities) {
      if (!entity.url) {
        stats.skipped++;
        processedCount++;
        continue;
      }

      const progress = Math.floor((processedCount / totalCount) * 100);
      await updateProgress(progress, `Crawling (${processedCount + 1}/${totalCount}): ${entity.title?.substring(0, 30)}...`);

      const metadata = await extractPageMetadata(entity.url);
      stats.crawled++;
      processedCount++;

      if (metadata) {
        // Debug: log title extraction results
        console.log(`[Scan] Standard crawl - Title extraction for ${entity.url}:`, {
          h1: metadata.h1,
          ogTitle: metadata.ogTitle,
          title: metadata.title,
          currentTitle: entity.title,
          slug: entity.slug
        });

        try {
          // Build SEO data from extracted metadata
          const seoData = {
            // Basic SEO
            title: metadata.ogTitle || metadata.title,
            description: metadata.ogDescription || metadata.description,
            canonicalUrl: metadata.canonicalUrl,
            focusKeyword: metadata.focusKeyword,
            keywords: metadata.keywords,
            
            // Robots
            robots: metadata.robots,
            
            // Open Graph
            ogTitle: metadata.ogTitle,
            ogDescription: metadata.ogDescription,
            ogImage: metadata.ogImage,
            ogUrl: metadata.ogUrl,
            ogType: metadata.ogType,
            ogSiteName: metadata.ogSiteName,
            ogLocale: metadata.ogLocale,
            
            // Twitter Card
            twitterCard: metadata.twitterCard,
            twitterTitle: metadata.twitterTitle,
            twitterDescription: metadata.twitterDescription,
            twitterImage: metadata.twitterImage,
            twitterSite: metadata.twitterSite,
            twitterCreator: metadata.twitterCreator,
            
            // Schema
            schema: metadata.schema,
            
            // Metadata
            crawledAt: new Date().toISOString(),
          };

          // Check if we need AI enrichment (uncertain content extraction)
          const needsAI = (
            // No meaningful content extracted
            (!metadata.mainContent || metadata.wordCount < 50) ||
            // No focus keyword found
            (!metadata.focusKeyword && !metadata.keywords) ||
            // Title might be wrong (same as site name or too short)
            (!metadata.h1 && (!metadata.title || metadata.title.length < 5))
          );

          // Use AI enrichment for uncertain content (only for pages with content)
          let aiEnrichment = null;
          if (needsAI && metadata._rawHtml && metadata.wordCount > 20) {
            console.log(`[Scan] Using AI enrichment for: ${entity.url}`);
            aiEnrichment = await enrichContentWithAI(entity.url, metadata._rawHtml, metadata);
            stats.aiCalls++;  // Track AI calls for credit tracking
            
            if (aiEnrichment) {
              // Merge AI results with higher priority for missing fields
              if (!seoData.focusKeyword && aiEnrichment.focusKeyword) {
                seoData.focusKeyword = aiEnrichment.focusKeyword;
              }
              if (!seoData.description && aiEnrichment.description) {
                seoData.description = aiEnrichment.description;
              }
              seoData.aiEnriched = true;
              seoData.aiContentType = aiEnrichment.contentType;
              seoData.aiConfidence = aiEnrichment.confidence;
            }
          }

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
            h1Issue: !metadata.h1,
          };

          // Determine the best featured image
          // Priority: existing featuredImage > og:image > twitter:image
          let featuredImage = entity.featuredImage;
          if (!featuredImage && metadata.ogImage) {
            featuredImage = metadata.ogImage;
          } else if (!featuredImage && metadata.twitterImage) {
            featuredImage = metadata.twitterImage;
          }

          // Get main content (prefer AI enrichment if available)
          let mainContent = metadata.mainContent;
          if (aiEnrichment?.mainContent && aiEnrichment.confidence > 0.7) {
            mainContent = aiEnrichment.mainContent;
          }

          // Update entity title and excerpt if we found better data
          const updateData = {
            seoData,
            metadata: updatedMetadata,
            featuredImage,
          };

          // Update content if extracted
          if (mainContent && mainContent.length > 50) {
            updateData.content = mainContent;
          }

          // Update title from page content
          // When forceRescan is true, always update title with fresh data
          // Otherwise, only update if current title looks like a slug
          const currentTitleIsSlug = !entity.title || 
            entity.title === entity.slug || 
            entity.title === slugToTitle(entity.slug);
          
          // Common generic titles to avoid (site-wide titles that shouldn't override page-specific slugs)
          const genericTitles = [
            'עמוד הבית', 'homepage', 'home', 'דף הבית', 'ראשי',
            'welcome', 'main', 'index', 'home page', 'menu', 'navigation'
          ];
          
          const isGenericTitle = (title) => {
            if (!title) return true;
            const lowerTitle = title.toLowerCase().trim();
            return genericTitles.some(generic => lowerTitle === generic.toLowerCase());
          };
          
          // Always try to get the best title (for forceRescan or when title is slug)
          if (forceRescan || currentTitleIsSlug) {
            let newTitle = null;
            
            // Prefer H1 as the real page title (but not if it's generic)
            if (metadata.h1 && !isGenericTitle(metadata.h1)) {
              newTitle = metadata.h1;
            } else if (aiEnrichment?.title && aiEnrichment.confidence > 0.6 && !isGenericTitle(aiEnrichment.title)) {
              newTitle = aiEnrichment.title;
            } else if (metadata.ogTitle && !isGenericTitle(metadata.ogTitle)) {
              newTitle = metadata.ogTitle;
            } else if (metadata.title && !isGenericTitle(metadata.title)) {
              // Clean up meta title (remove site name suffix if present)
              const cleanTitle = cleanPageTitle(metadata.title);
              // Only use if not generic after cleaning
              if (cleanTitle && !isGenericTitle(cleanTitle)) {
                newTitle = cleanTitle;
              }
            }
            
            // If newTitle is still null but we have a homepage entity, set a proper homepage title
            if (!newTitle && entity.slug === '' && entity.url) {
              const urlObj = new URL(entity.url);
              if (urlObj.pathname === '/' || urlObj.pathname === '') {
                newTitle = 'עמוד הבית'; // For homepage only, this is correct
              }
            }
            
            console.log(`[Scan] Standard flow - Title decision for ${entity.url}:`, {
              h1: metadata.h1,
              ogTitle: metadata.ogTitle,
              pageTitle: metadata.title,
              currentTitle: entity.title,
              newTitle,
              willUpdate: newTitle && newTitle.length > 2
            });
            
            if (newTitle && newTitle.length > 2) {
              updateData.title = newTitle;
            }
          }

          // Update excerpt from meta description if current excerpt is empty
          if (!entity.excerpt) {
            const newExcerpt = metadata.ogDescription || metadata.description || aiEnrichment?.description;
            if (newExcerpt) {
              updateData.excerpt = newExcerpt;
            }
          }

          // Update entity
          await prisma.siteEntity.update({
            where: { id: entity.id },
            data: updateData,
          });

          stats.enriched++;
        } catch (e) {
          console.error('Error updating entity:', e.message);
          stats.failed++;
        }
      } else {
        stats.failed++;
      }
      
      // Small delay to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 150));
    }

    offset += batchSize;
  }

  await updateProgress(100, 'Deep crawl complete');
  console.log('[Scan] Phase 3 complete. Stats:', stats);
  return stats;
}

// ============================================
// API Routes
// ============================================

/**
 * GET /api/entities/scan - Phase 1: Quick Discovery
 * Query params:
 *   - siteId: required
 *   - sitemapUrl: optional custom sitemap URL
 */
export async function GET(request) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    const customSitemapUrl = searchParams.get('sitemapUrl');

    if (!siteId) {
      return NextResponse.json({ error: 'Site ID is required' }, { status: 400 });
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
      select: {
        id: true,
        url: true,
        name: true,
        platform: true,
        accountId: true,
        connectionStatus: true,
        siteKey: true,
        siteSecret: true,
      },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    if (!site.url) {
      return NextResponse.json({ error: 'Site URL not configured' }, { status: 400 });
    }

    console.log('[Scan] Starting Phase 1 discovery for site:', site.url, 'Platform:', site.platform, 'Connected:', site.connectionStatus === 'CONNECTED');
    if (customSitemapUrl) {
      console.log('[Scan] Using custom sitemap URL:', customSitemapUrl);
    }

    // Perform quick discovery (pass userId to save who triggered the scan)
    const result = await discoverPostTypes(site, customSitemapUrl, userId);

    console.log('[Scan] Discovery complete. Found', result.postTypes.length, 'post types:');
    result.postTypes.forEach(pt => {
      console.log(`  - ${pt.slug}: "${pt.name}" (HE: "${pt.nameHe}") - ${pt.entityCount} entities`);
    });

    return NextResponse.json({
      success: true,
      ...result,
    });

  } catch (error) {
    console.error('Entity scan error:', error);
    return NextResponse.json({ error: 'Failed to scan site' }, { status: 500 });
  }
}

/**
 * POST /api/entities/scan - Phase 2 & 3: Populate or Deep Crawl
 */
export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { siteId, phase, entityTypeId, options = {} } = body;

    if (!siteId) {
      return NextResponse.json({ error: 'Site ID is required' }, { status: 400 });
    }

    if (!phase || !['populate', 'crawl', 'discover-crawl'].includes(phase)) {
      return NextResponse.json({ error: 'Phase must be "populate", "crawl", or "discover-crawl"' }, { status: 400 });
    }

    // Verify user has access
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
      include: {
        entityTypes: {
          where: { isEnabled: true },
        },
      },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Handle discover-crawl phase (crawl without sitemap)
    if (phase === 'discover-crawl') {
      console.log('[Scan] Starting discover-crawl phase for site:', site.url);
      
      const maxPages = options.maxPages || 100;
      const crawlCounts = await crawlWebsiteLinks(site.url, maxPages);
      
      // Build post types from crawl results
      const postTypes = [];
      
      for (const [slug, data] of Object.entries(crawlCounts)) {
        const translations = POST_TYPE_TRANSLATIONS[slug] || POST_TYPE_TRANSLATIONS[slug.replace(/s$/, '')];
        const displayName = translations?.en || formatSlugToName(slug);
        const nameHe = translations?.he || displayName;
        
        postTypes.push({
          slug,
          name: displayName,
          nameHe,
          description: '',
          entityCount: data.count,
          isCore: ['posts', 'pages'].includes(slug),
          fromCrawl: true,
        });
      }

      // Sort: core types first, then by count
      postTypes.sort((a, b) => {
        if (a.isCore !== b.isCore) return a.isCore ? -1 : 1;
        return b.entityCount - a.entityCount;
      });

      return NextResponse.json({
        success: true,
        postTypes,
        source: {
          sitemap: false,
          crawl: true,
          pagesDiscovered: Object.values(crawlCounts).reduce((sum, d) => sum + d.count, 0),
        },
      });
    }

    console.log('[Scan] Entity types from DB:', site.entityTypes?.map(t => ({
      slug: t.slug,
      apiEndpoint: t.apiEndpoint,
      sitemaps: t.sitemaps,
    })));

    // Update sync status
    await prisma.site.update({
      where: { id: siteId },
      data: {
        entitySyncStatus: 'SYNCING',
        entitySyncProgress: 0,
        entitySyncMessage: phase === 'populate' ? 'Starting entity population...' : 'Starting deep crawl...',
        entitySyncError: null,
      },
    });

    let result;

    try {
      if (phase === 'populate') {
        // Phase 2: Populate entities
        result = await populateEntities(site, site.entityTypes, options);
        
        // Always run Phase 3 (deep crawl) to get real titles and metadata
        // This ensures entities get proper titles from page content, not just slugs
        {
          console.log('[Scan] Starting automatic deep crawl after population...');
          await prisma.site.update({
            where: { id: siteId },
            data: {
              entitySyncProgress: 50,
              entitySyncMessage: 'Fetching page content and metadata...',
            },
          });
          
          const crawlResult = await deepCrawlEntities(site, { 
            forceRescan: true,
            batchSize: 20, // Smaller batches for faster feedback
          });
          
          // Merge results
          result.crawled = crawlResult.crawled;
          result.enriched = crawlResult.enriched;
          result.aiCalls = crawlResult.aiCalls;
          console.log('[Scan] Deep crawl complete:', crawlResult);
        }
      } else if (phase === 'crawl') {
        // Phase 3: Deep crawl only
        // Pass entityTypeId if provided to filter by specific entity type
        result = await deepCrawlEntities(site, { ...options, entityTypeId });
      }

      // Update sync status to completed
      await prisma.site.update({
        where: { id: siteId },
        data: {
          entitySyncStatus: 'COMPLETED',
          entitySyncProgress: 100,
          entitySyncMessage: null,
          lastEntitySyncAt: new Date(),
          entitySyncError: result.errors > 0 ? `Completed with ${result.errors} error(s)` : null,
        },
      });

      // Track AI usage for all AI enrichment calls made during the scan
      const aiCallCount = result.aiCalls || 0;
      if (aiCallCount > 0) {
        console.log(`[Scan] Tracking ${aiCallCount} AI calls for account ${site.accountId}`);
        for (let i = 0; i < aiCallCount; i++) {
          await trackAIUsage({
            accountId: site.accountId,
            userId,
            siteId: site.id,
            operation: 'GENERIC',
            description: `Entity content enrichment (${i + 1}/${aiCallCount})`,
          });
        }
      }

      return NextResponse.json({
        success: true,
        phase,
        stats: result,
      });

    } catch (e) {
      // Update sync status to error
      await prisma.site.update({
        where: { id: siteId },
        data: {
          entitySyncStatus: 'ERROR',
          entitySyncError: e.message,
        },
      });

      throw e;
    }

  } catch (error) {
    console.error('Entity scan error:', error);
    return NextResponse.json({ error: error.message || 'Failed to scan site' }, { status: 500 });
  }
}
