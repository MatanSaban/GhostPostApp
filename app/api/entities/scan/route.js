import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

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
 */
async function fetchMainSitemap(siteUrl) {
  console.log('[Scan] Looking for sitemap at:', siteUrl);
  
  const sitemapUrls = [
    `${siteUrl}/wp-sitemap.xml`,           // WordPress 5.5+ default
    `${siteUrl}/sitemap.xml`,               // Yoast SEO
    `${siteUrl}/sitemap_index.xml`,         // Yoast SEO alternative
    `${siteUrl}/sitemap-index.xml`,         // Rank Math
  ];

  for (const url of sitemapUrls) {
    try {
      console.log('[Scan] Trying sitemap URL:', url);
      const response = await fetch(url, {
        headers: { 'User-Agent': 'GhostPost-Platform/1.0' },
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        const content = await response.text();
        if (content.includes('<urlset') || content.includes('<sitemapindex')) {
          // Detect sitemap type
          const isYoast = url.includes('sitemap.xml') && content.includes('sitemap');
          const isRankMath = url.includes('sitemap-index') || url.includes('sitemap_index');
          const isWordPressDefault = url.includes('wp-sitemap');
          
          const type = isWordPressDefault ? 'wordpress' : isYoast ? 'yoast' : isRankMath ? 'rankmath' : 'generic';
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
};

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
 * Phase 1: Discover post types from sitemap
 */
async function discoverPostTypes(site) {
  const siteUrl = site.url.replace(/\/$/, '');
  const result = {
    postTypes: [],
    source: {
      sitemap: false,
      sitemapUrl: null,
      sitemapType: null,
      restApi: false,
    },
  };

  // Fetch main sitemap
  const sitemap = await fetchMainSitemap(siteUrl);
  if (sitemap) {
    result.source.sitemap = true;
    result.source.sitemapUrl = sitemap.url;
    result.source.sitemapType = sitemap.type;
    console.log('[Scan] Sitemap found:', sitemap.url, 'Type:', sitemap.type);
  } else {
    console.log('[Scan] No sitemap found for site');
  }

  // For WordPress sites, try REST API for accurate post type info
  let wpTypes = null;
  if (site.platform === 'wordpress') {
    wpTypes = await fetchWordPressTypes(siteUrl);
    if (wpTypes) {
      result.source.restApi = true;
      console.log('[Scan] WP REST API available, found types:', Object.keys(wpTypes));
    }
  }

  // Count URLs from sitemap
  let sitemapCounts = {};
  if (sitemap && sitemap.isIndex) {
    sitemapCounts = await countUrlsFromSitemapIndex(sitemap.content, sitemap.type);
    console.log('[Scan] Sitemap URL counts:', sitemapCounts);
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

  // Convert to array and sort (core first, then by count)
  result.postTypes = Array.from(postTypesMap.values()).sort((a, b) => {
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
 */
function extractSlugFromUrl(url) {
  try {
    const urlObj = new URL(url);
    let path = urlObj.pathname.replace(/\/$/, '');
    const segments = path.split('/').filter(Boolean);
    return segments.length > 0 ? segments[segments.length - 1] : null;
  } catch (e) {
    return null;
  }
}

/**
 * Convert slug to title
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
 * Fetch posts from WP REST API
 */
async function fetchWpRestPosts(siteUrl, restEndpoint, page = 1, perPage = 100) {
  const url = `${siteUrl}/wp-json/wp/v2/${restEndpoint}?page=${page}&per_page=${perPage}&_fields=id,slug,title,link,date,modified,status,excerpt,featured_media`;
  console.log(`[Scan] Fetching WP REST: ${url}`);
  
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'GhostPost-Platform/1.0' },
      signal: AbortSignal.timeout(20000),
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
      
      for (const sitemapUrl of sitemaps) {
        const sitemapUrls = await fetchSitemapUrls(sitemapUrl);
        
        for (const urlData of sitemapUrls) {
          const slug = extractSlugFromUrl(urlData.url);
          if (!slug) continue;

          // Skip archive pages for non-page entity types
          // Archive pages like /blog, /services should be treated as pages, not posts
          if (entityType.slug !== 'pages' && isArchivePage(urlData.url, entityType.slug)) {
            console.log(`[Scan] Skipping archive page for ${entityType.slug}: ${urlData.url}`);
            continue;
          }

          entities.push({
            externalId: null,
            slug,
            title: urlData.imageTitle || slugToTitle(slug),
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
    });

    if (!response.ok) return null;

    const html = await response.text();
    const metadata = {
      title: null,
      description: null,
      ogTitle: null,
      ogDescription: null,
      ogImage: null,
      twitterTitle: null,
      twitterDescription: null,
      twitterImage: null,
      canonicalUrl: null,
      author: null,
      publishDate: null,
      modifiedDate: null,
      keywords: null,
      schema: [],
    };

    // Title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) metadata.title = titleMatch[1].trim();

    // Meta tags
    const metaRegex = /<meta\s+([^>]+)>/gi;
    let metaMatch;
    while ((metaMatch = metaRegex.exec(html)) !== null) {
      const attrs = metaMatch[1];
      
      const nameMatch = attrs.match(/(?:name|property)=["']([^"']+)["']/i);
      const contentMatch = attrs.match(/content=["']([^"']+)["']/i);
      
      if (nameMatch && contentMatch) {
        const name = nameMatch[1].toLowerCase();
        const content = contentMatch[1];
        
        switch (name) {
          case 'description':
            metadata.description = content;
            break;
          case 'keywords':
            metadata.keywords = content;
            break;
          case 'author':
            metadata.author = content;
            break;
          case 'og:title':
            metadata.ogTitle = content;
            break;
          case 'og:description':
            metadata.ogDescription = content;
            break;
          case 'og:image':
            metadata.ogImage = content;
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
          case 'article:published_time':
            metadata.publishDate = content;
            break;
          case 'article:modified_time':
            metadata.modifiedDate = content;
            break;
        }
      }
    }

    // Canonical URL
    const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
    if (canonicalMatch) metadata.canonicalUrl = canonicalMatch[1];

    // JSON-LD structured data
    const jsonLdRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let jsonLdMatch;
    while ((jsonLdMatch = jsonLdRegex.exec(html)) !== null) {
      try {
        const schemaData = JSON.parse(jsonLdMatch[1]);
        metadata.schema.push(schemaData);
      } catch (e) {
        // Invalid JSON-LD
      }
    }

    return metadata;
  } catch (e) {
    console.error('Error extracting metadata:', url, e.message);
    return null;
  }
}

/**
 * Phase 3: Deep crawl entities to extract rich metadata
 * @param {Object} site - The site object
 * @param {Object} options - Options for crawling
 * @param {number} options.batchSize - Number of entities to crawl per batch (default: 50)
 * @param {boolean} options.forceRescan - If true, crawl all entities regardless of existing seoData
 */
async function deepCrawlEntities(site, options = {}) {
  console.log('[Scan] Phase 3: Starting deep crawl', { forceRescan: options.forceRescan });
  
  const stats = {
    crawled: 0,
    enriched: 0,
    failed: 0,
    skipped: 0,
    total: 0,
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

  // Get total count for progress calculation
  const whereClause = forceRescan 
    ? { siteId: site.id }
    : { 
        siteId: site.id,
        OR: [
          { seoData: { equals: null } },
          { seoData: { equals: {} } },
        ],
      };
  
  const totalCount = await prisma.siteEntity.count({ where: whereClause });
  stats.total = totalCount;
  
  console.log(`[Scan] Total entities to crawl: ${totalCount} (forceRescan: ${forceRescan})`);

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
        try {
          // Build SEO data from extracted metadata
          const seoData = {
            title: metadata.ogTitle || metadata.title,
            description: metadata.ogDescription || metadata.description,
            canonicalUrl: metadata.canonicalUrl,
            ogImage: metadata.ogImage,
            ogTitle: metadata.ogTitle,
            ogDescription: metadata.ogDescription,
            twitterTitle: metadata.twitterTitle,
            twitterDescription: metadata.twitterDescription,
            twitterImage: metadata.twitterImage,
            keywords: metadata.keywords,
            schema: metadata.schema,
            crawledAt: new Date().toISOString(),
          };

          // Update existing metadata
          const existingMetadata = entity.metadata || {};
          const updatedMetadata = {
            ...existingMetadata,
            needsDeepCrawl: false,
            lastCrawledAt: new Date().toISOString(),
            author: metadata.author || existingMetadata.author,
            publishDate: metadata.publishDate || existingMetadata.publishDate,
            modifiedDate: metadata.modifiedDate || existingMetadata.modifiedDate,
          };

          // Determine the best featured image
          // Priority: existing featuredImage > og:image > twitter:image
          let featuredImage = entity.featuredImage;
          if (!featuredImage && metadata.ogImage) {
            featuredImage = metadata.ogImage;
          } else if (!featuredImage && metadata.twitterImage) {
            featuredImage = metadata.twitterImage;
          }

          // Update entity title and excerpt if we found better data
          const updateData = {
            seoData,
            metadata: updatedMetadata,
            featuredImage,
          };

          // Update title from meta if current title is just a slug or empty
          if (metadata.title && (!entity.title || entity.title === entity.slug)) {
            // Clean up meta title (remove site name suffix if present)
            let cleanTitle = metadata.title;
            if (cleanTitle.includes(' | ') || cleanTitle.includes(' - ')) {
              cleanTitle = cleanTitle.split(/\s*[\|\-]\s*/)[0].trim();
            }
            updateData.title = cleanTitle;
          }

          // Update excerpt from meta description if current excerpt is empty
          if (metadata.description && !entity.excerpt) {
            updateData.excerpt = metadata.description;
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
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    if (!site.url) {
      return NextResponse.json({ error: 'Site URL not configured' }, { status: 400 });
    }

    console.log('[Scan] Starting Phase 1 discovery for site:', site.url, 'Platform:', site.platform);

    // Perform quick discovery
    const result = await discoverPostTypes(site);

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
    const { siteId, phase, options = {} } = body;

    if (!siteId) {
      return NextResponse.json({ error: 'Site ID is required' }, { status: 400 });
    }

    if (!phase || !['populate', 'crawl'].includes(phase)) {
      return NextResponse.json({ error: 'Phase must be "populate" or "crawl"' }, { status: 400 });
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
      } else {
        // Phase 3: Deep crawl
        result = await deepCrawlEntities(site, options);
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
