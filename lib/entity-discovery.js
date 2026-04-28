import { generateStructuredResponse } from '@/lib/ai/gemini';
import { BOT_FETCH_HEADERS } from '@/lib/bot-identity';
import { z } from 'zod';

// Common Hebrew translations for post types - used to seed nameHe before AI runs
// so we have reasonable defaults when AI enhancement is skipped or fails.
const HEBREW_NAMES = {
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

export function getHebrewName(slug, englishName) {
  if (!slug) return englishName;
  const normalized = slug.toLowerCase().replace(/-/g, '_');
  return HEBREW_NAMES[normalized] || HEBREW_NAMES[slug] || englishName;
}

/**
 * Fetch and parse sitemap (supports all platforms, not just WordPress).
 * Checks robots.txt first, then common patterns. Returns the most useful
 * sitemap content (preferring sitemap indexes over single urlsets).
 */
export async function fetchWordPressSitemap(siteUrl) {
  const discoveredUrls = new Set();

  try {
    const robotsResponse = await fetch(`${siteUrl}/robots.txt`, {
      headers: BOT_FETCH_HEADERS,
      signal: AbortSignal.timeout(5000),
    });
    if (robotsResponse.ok) {
      const robotsContent = await robotsResponse.text();
      const matches = robotsContent.matchAll(/^Sitemap:\s*(.+)$/gmi);
      for (const match of matches) {
        const url = match[1].trim();
        if (url) discoveredUrls.add(url);
      }
    }
  } catch { /* ignore - robots.txt is best-effort */ }

  const commonPatterns = [
    `${siteUrl}/wp-sitemap.xml`,
    `${siteUrl}/sitemap.xml`,
    `${siteUrl}/sitemap_index.xml`,
    `${siteUrl}/sitemap-index.xml`,
    `${siteUrl}/server-sitemap.xml`,
    `${siteUrl}/sitemaps/sitemap.xml`,
    `${siteUrl}/sitemaps/static`,
    `${siteUrl}/sitemap1.xml`,
  ];
  for (const url of commonPatterns) {
    discoveredUrls.add(url);
  }

  let sitemapContent = null;
  let usedUrl = null;

  for (const url of discoveredUrls) {
    try {
      const response = await fetch(url, {
        headers: BOT_FETCH_HEADERS,
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        const text = await response.text();
        if (text.includes('<urlset') || text.includes('<sitemapindex')) {
          sitemapContent = text;
          usedUrl = url;
          if (text.includes('<sitemapindex')) break;
        }
      }
    } catch (e) {
      continue;
    }
  }

  return { content: sitemapContent, url: usedUrl };
}

/**
 * Fetch WordPress REST API to get post types with full labels.
 * Returns null for non-WordPress sites or sites with REST API disabled.
 */
export async function fetchWordPressPostTypes(siteUrl) {
  try {
    const response = await fetch(`${siteUrl}/wp-json/wp/v2/types?context=view`, {
      headers: BOT_FETCH_HEADERS,
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      return await response.json();
    }
  } catch (e) {
    // Not a WordPress site, or REST API is locked down
  }

  return null;
}

/**
 * Parse a sitemap index for post-type hints (used when REST API isn't available).
 */
export function parseSitemapForPostTypes(sitemapContent) {
  const postTypes = new Set();
  const urlPatterns = [];

  const urlMatches = sitemapContent.matchAll(/<loc>([^<]+)<\/loc>/g);
  for (const match of urlMatches) {
    urlPatterns.push(match[1]);
  }

  // WordPress 5.5+ format: wp-sitemap-{type}-N.xml
  const sitemapMatches = sitemapContent.matchAll(/wp-sitemap-([a-z0-9_-]+)-/gi);
  for (const match of sitemapMatches) {
    const type = match[1].toLowerCase();
    if (type !== 'users' && type !== 'taxonomies') {
      postTypes.add(type);
    }
  }

  // Yoast format: {type}-sitemap.xml - exclude taxonomies & built-in singulars
  const yoastMatches = sitemapContent.matchAll(/([a-z0-9_-]+)-sitemap\.xml/gi);
  for (const match of yoastMatches) {
    const type = match[1].toLowerCase();
    if (!['author', 'category', 'tag', 'post_tag', 'page', 'post'].includes(type)) {
      if (!type.includes('taxonomy') && !type.includes('sitemap')) {
        postTypes.add(type);
      }
    }
  }

  return {
    postTypes: Array.from(postTypes),
    urlPatterns: urlPatterns.slice(0, 50),
  };
}

/**
 * Fetch a sub-sitemap and extract URL entries with their metadata.
 */
export async function fetchSubSitemap(sitemapUrl) {
  try {
    const response = await fetch(sitemapUrl, {
      headers: BOT_FETCH_HEADERS,
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

      const lastmodMatch = urlBlock.match(/<lastmod>([^<]+)<\/lastmod>/);
      const imageMatch = urlBlock.match(/<image:loc>([^<]+)<\/image:loc>/);
      const imageTitleMatch = urlBlock.match(/<image:title>([^<]+)<\/image:title>/);

      urls.push({
        url: locMatch[1],
        lastmod: lastmodMatch ? lastmodMatch[1] : null,
        image: imageMatch ? imageMatch[1] : null,
        imageTitle: imageTitleMatch ? imageTitleMatch[1] : null,
      });
    }

    return urls;
  } catch (e) {
    console.error('[entity-discovery] Sub-sitemap fetch failed:', sitemapUrl, e.message);
    return [];
  }
}

export function extractSlugFromUrl(url) {
  try {
    const urlObj = new URL(url);
    let path = urlObj.pathname.replace(/\/$/, '');
    const segments = path.split('/').filter(Boolean);
    if (segments.length === 0) return null;
    return segments[segments.length - 1];
  } catch (e) {
    return null;
  }
}

export function slugToTitle(slug) {
  if (!slug) return 'Untitled';
  return slug
    .replace(/-/g, ' ')
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Crawl all sub-sitemaps referenced by a sitemap index (or process a single
 * urlset directly) and group the discovered entities by their inferred post
 * type. Returns: { [postType]: [{ url, slug, title, featuredImage, publishedAt }] }
 */
export async function crawlSitemapsForEntities(siteUrl, mainSitemapContent) {
  const entities = {};
  const isSitemapIndex = mainSitemapContent.includes('<sitemapindex');

  if (isSitemapIndex) {
    const sitemapRefs = mainSitemapContent.matchAll(/<loc>([^<]+)<\/loc>/g);

    for (const ref of sitemapRefs) {
      const sitemapUrl = ref[1];
      let postType = null;

      const wpMatch = sitemapUrl.match(/wp-sitemap-([a-z0-9_-]+)-\d+\.xml/i);
      if (wpMatch) postType = wpMatch[1];

      const yoastMatch = sitemapUrl.match(/([a-z0-9_-]+)-sitemap\d*\.xml/i);
      if (!postType && yoastMatch) postType = yoastMatch[1];

      if (!postType ||
          postType === 'taxonomies' ||
          postType === 'users' ||
          postType === 'author' ||
          postType === 'category' ||
          postType === 'tag' ||
          postType === 'post_tag') {
        continue;
      }

      // Normalize core types to plural form so they line up with REST API.
      if (postType === 'post') postType = 'posts';
      if (postType === 'page') postType = 'pages';

      const urls = await fetchSubSitemap(sitemapUrl);
      if (urls.length === 0) continue;

      if (!entities[postType]) entities[postType] = [];

      for (const urlData of urls) {
        const slug = extractSlugFromUrl(urlData.url);
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
  } else {
    // Single urlset - assume these are posts.
    const urls = [];
    const urlRegex = /<url>([\s\S]*?)<\/url>/gi;
    let match;
    while ((match = urlRegex.exec(mainSitemapContent)) !== null) {
      const urlBlock = match[1];
      const locMatch = urlBlock.match(/<loc>([^<]+)<\/loc>/);
      if (locMatch) {
        const url = locMatch[1];
        const slug = extractSlugFromUrl(url);
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
 * AI enhancement step - produces better Hebrew names and identifies entity
 * types that REST API + sitemap heuristics missed. Returns null on failure
 * so callers can degrade gracefully.
 */
export async function analyzeWithAI(sitemapData, wpTypes, { accountId, siteId } = {}) {
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
      operation: 'GENERIC',
      accountId,
      siteId,
    });

    return result.entityTypes;
  } catch (error) {
    console.error('[entity-discovery] AI analysis error:', error);
    return null;
  }
}

/**
 * Given REST-API types + sitemap-derived types, produce a normalized
 * entity-type list. Deduplicates singular/plural variants and ensures
 * core types (posts, pages) are always present.
 */
export function buildEntityTypesList(wpTypes, sitemapData) {
  let entityTypes = [];

  if (wpTypes) {
    const coreTypes = ['post', 'page'];
    const excludeTypes = [
      'attachment', 'nav_menu_item', 'wp_block', 'wp_template', 'wp_template_part',
      'wp_navigation', 'wp_font_family', 'wp_font_face', 'wp_global_styles', 'wp_pattern',
    ];

    for (const [key, typeData] of Object.entries(wpTypes)) {
      if (excludeTypes.includes(key)) continue;

      const isCore = coreTypes.includes(key);
      const isViewable = typeData.viewable === true || typeData.viewable === undefined;
      const hasRestBase = !!typeData.rest_base;

      if (isCore || isViewable || hasRestBase) {
        const slug = key === 'post' ? 'posts' : key === 'page' ? 'pages' : key;
        if (entityTypes.some(t => t.slug === slug)) continue;

        const wpLabel = typeData.name || typeData.labels?.name || key;

        entityTypes.push({
          slug,
          name: wpLabel,
          nameHe: wpLabel,
          apiEndpoint: typeData.rest_base || key,
          description: typeData.description || '',
          isCore,
        });
      }
    }
  }

  if (sitemapData?.postTypes?.length > 0) {
    for (const sitemapType of sitemapData.postTypes) {
      const coreVariants = ['post', 'posts', 'page', 'pages'];
      if (coreVariants.includes(sitemapType.toLowerCase())) continue;

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

  // Drop singular core types when their plural already exists
  entityTypes = entityTypes.filter(type => {
    const slug = type.slug?.toLowerCase();
    if (slug === 'post' && entityTypes.some(t => t.slug === 'posts')) return false;
    if (slug === 'page' && entityTypes.some(t => t.slug === 'pages')) return false;
    return true;
  });

  // Ensure core types are always present so users see Posts/Pages even when
  // discovery found nothing.
  if (!entityTypes.some(t => t.slug === 'posts')) {
    entityTypes.push({
      slug: 'posts',
      name: 'Posts',
      nameHe: 'פוסטים',
      apiEndpoint: 'posts',
      description: 'Blog posts',
      isCore: true,
    });
  }
  if (!entityTypes.some(t => t.slug === 'pages')) {
    entityTypes.push({
      slug: 'pages',
      name: 'Pages',
      nameHe: 'עמודים',
      apiEndpoint: 'pages',
      description: 'Static pages',
      isCore: true,
    });
  }

  entityTypes.sort((a, b) => {
    if (a.isCore && !b.isCore) return -1;
    if (!a.isCore && b.isCore) return 1;
    return a.name.localeCompare(b.name);
  });

  return entityTypes;
}

/**
 * Merge AI-enhanced types into a base list. Updates Hebrew names + descriptions
 * on existing entries, adds entries the heuristics missed. Mutates and returns
 * the input list.
 */
export function mergeAIEnhancements(entityTypes, aiTypes) {
  if (!aiTypes || aiTypes.length === 0) return entityTypes;

  for (const aiType of aiTypes) {
    const coreVariants = ['post', 'page'];
    if (coreVariants.includes(aiType.slug?.toLowerCase())) continue;

    const existing = entityTypes.find(t =>
      t.slug === aiType.slug || t.apiEndpoint === aiType.apiEndpoint
    );
    if (existing) {
      if (aiType.nameHe && aiType.nameHe !== aiType.name) existing.nameHe = aiType.nameHe;
      if (aiType.description) existing.description = aiType.description;
    } else {
      entityTypes.push(aiType);
    }
  }

  return entityTypes;
}

/**
 * Top-level discovery flow used by both /api/entities/discover (site-scoped)
 * and /api/auth/registration/entities/scan (tempReg-scoped during onboarding).
 *
 * Does NOT write to the database - returns the raw types + entities so the
 * caller can persist them wherever appropriate (SiteEntityType rows, JSON
 * blob on a draft account, etc).
 */
export async function discoverEntityTypesAndEntities(siteUrl, { accountId, siteId, useAI = true } = {}) {
  const normalizedUrl = siteUrl.replace(/\/$/, '');

  const wpTypes = await fetchWordPressPostTypes(normalizedUrl);
  const sitemap = await fetchWordPressSitemap(normalizedUrl);

  let sitemapData = { postTypes: [], urlPatterns: [] };
  if (sitemap.content) {
    sitemapData = parseSitemapForPostTypes(sitemap.content);
  }

  let entityTypes = buildEntityTypesList(wpTypes, sitemapData);

  let aiEnhanced = false;
  let aiUsed = false;
  if (useAI && entityTypes.length > 0 && (sitemap.content || wpTypes)) {
    try {
      const aiTypes = await analyzeWithAI(sitemapData, wpTypes, { accountId, siteId });
      aiUsed = true;
      if (aiTypes && aiTypes.length > 0) {
        aiEnhanced = true;
        entityTypes = mergeAIEnhancements(entityTypes, aiTypes);
      }
    } catch (e) {
      // Already logged in analyzeWithAI; degrade gracefully.
    }
  }

  let sitemapEntities = {};
  if (sitemap.content) {
    try {
      sitemapEntities = await crawlSitemapsForEntities(normalizedUrl, sitemap.content);
      for (const et of entityTypes) {
        et.entityCount = sitemapEntities[et.slug]?.length || 0;
      }
    } catch (e) {
      console.error('[entity-discovery] Sitemap crawl error:', e);
    }
  }

  return {
    entityTypes,
    sitemapEntities,
    source: {
      restApi: !!wpTypes,
      sitemap: !!sitemap.content,
      sitemapUrl: sitemap.url,
      aiEnhanced,
      aiUsed,
    },
  };
}
