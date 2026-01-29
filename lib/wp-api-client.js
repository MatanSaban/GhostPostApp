/**
 * WordPress Plugin API Client
 * 
 * Handles secure communication with the Ghost Post WordPress plugin
 * using HMAC-SHA256 signed requests.
 */

import crypto from 'crypto';

/**
 * Create HMAC-SHA256 signature for request
 */
function createSignature(payload, timestamp, secret) {
  const data = `${timestamp}.${payload}`;
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * Make authenticated request to WordPress plugin
 */
async function makePluginRequest(site, endpoint, method = 'GET', body = null) {
  if (!site.siteKey || !site.siteSecret) {
    throw new Error('Site is not connected - missing siteKey or siteSecret');
  }

  // Normalize site URL
  const baseUrl = site.url.replace(/\/$/, '');
  const url = `${baseUrl}/wp-json/ghost-post/v1${endpoint}`;
  
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = body ? JSON.stringify(body) : '';
  const signature = createSignature(payload, timestamp, site.siteSecret);

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-GP-Site-Key': site.siteKey,
    'X-GP-Timestamp': timestamp.toString(),
    'X-GP-Signature': signature,
  };

  const options = {
    method,
    headers,
    signal: AbortSignal.timeout(30000), // 30 second timeout
  };

  if (body && method !== 'GET') {
    options.body = payload;
  }

  const response = await fetch(url, options);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Plugin API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * Get site info from WordPress
 */
export async function getSiteInfo(site) {
  return makePluginRequest(site, '/site-info', 'GET');
}

/**
 * Get all post types from WordPress
 */
export async function getPostTypes(site) {
  try {
    // First try to get from our plugin endpoint
    const siteInfo = await getSiteInfo(site);
    return siteInfo.postTypes || [];
  } catch (error) {
    console.error('Failed to get post types from plugin:', error);
    
    // Fallback to public WP API
    const baseUrl = site.url.replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/wp-json/wp/v2/types`, {
      signal: AbortSignal.timeout(10000),
    });
    
    if (response.ok) {
      const types = await response.json();
      return Object.entries(types).map(([slug, data]) => ({
        slug,
        name: data.name,
        restBase: data.rest_base,
        hasArchive: data.has_archive,
      }));
    }
    
    return [];
  }
}

/**
 * Get posts/pages/CPT items
 * @param {Object} site - Site object with connection details
 * @param {string} postType - The post type slug (post, page, or custom post type)
 * @param {number} page - Page number
 * @param {number} perPage - Items per page
 */
export async function getPosts(site, postType = 'post', page = 1, perPage = 100) {
  // Normalize post type - WordPress uses singular slugs (post, page)
  // but REST base uses plural (posts, pages). Handle both.
  const normalizedType = postType.toLowerCase().trim();
  
  // Map post type to the correct plugin endpoint
  let endpoint;
  if (normalizedType === 'post' || normalizedType === 'posts') {
    endpoint = '/posts';
  } else if (normalizedType === 'page' || normalizedType === 'pages') {
    endpoint = '/pages';
  } else {
    // Custom post type
    endpoint = `/cpt/${normalizedType}`;
  }
  
  return makePluginRequest(site, `${endpoint}?page=${page}&per_page=${perPage}`, 'GET');
}

/**
 * Get a single post with full data
 */
export async function getPost(site, postType, postId) {
  // Map post type to the correct plugin endpoint
  let endpoint;
  if (postType === 'post') {
    endpoint = `/posts/${postId}`;
  } else if (postType === 'page') {
    endpoint = `/pages/${postId}`;
  } else {
    endpoint = `/cpt/${postType}/${postId}`;
  }
  
  return makePluginRequest(site, endpoint, 'GET');
}

/**
 * Get SEO data for a post (Yoast/RankMath)
 */
export async function getSeoData(site, postId) {
  return makePluginRequest(site, `/seo/${postId}`, 'GET');
}

/**
 * Get ACF fields for a post
 */
export async function getAcfFields(site, postId) {
  return makePluginRequest(site, `/acf/${postId}`, 'GET');
}

/**
 * Get all taxonomies
 */
export async function getTaxonomies(site) {
  return makePluginRequest(site, '/taxonomies', 'GET');
}

/**
 * Get terms for a taxonomy
 */
export async function getTaxonomyTerms(site, taxonomy) {
  return makePluginRequest(site, `/taxonomies/${taxonomy}/terms`, 'GET');
}

/**
 * Get menus from WordPress
 */
export async function getMenus(site) {
  try {
    // Try plugin endpoint first (if we add it)
    return makePluginRequest(site, '/menus', 'GET');
  } catch (error) {
    console.log('Menu endpoint not available, trying fallback');
    
    // Fallback: try WP REST API for menus (requires WP-REST-API extension or WP 5.9+)
    const baseUrl = site.url.replace(/\/$/, '');
    
    // Try WordPress 5.9+ menu endpoint
    const response = await fetch(`${baseUrl}/wp-json/wp/v2/menus`, {
      signal: AbortSignal.timeout(10000),
    });
    
    if (response.ok) {
      return response.json();
    }
    
    // Try older menu locations endpoint
    const locationsResponse = await fetch(`${baseUrl}/wp-json/wp/v2/menu-locations`, {
      signal: AbortSignal.timeout(10000),
    });
    
    if (locationsResponse.ok) {
      return locationsResponse.json();
    }
    
    return [];
  }
}

/**
 * Full entity sync - get all data for all post types
 */
export async function syncAllEntities(site, onProgress = null) {
  const result = {
    postTypes: [],
    entities: [],
    menus: [],
    taxonomies: [],
    errors: [],
  };

  try {
    // Step 1: Get site info and post types
    if (onProgress) onProgress('Fetching site info...', 5);
    
    let postTypes = [];
    try {
      const siteInfo = await getSiteInfo(site);
      postTypes = siteInfo.postTypes || [];
      result.siteInfo = siteInfo;
    } catch (e) {
      // Fallback to public API
      postTypes = await getPostTypes(site);
    }
    
    // Filter to usable post types
    const syncableTypes = postTypes.filter(pt => 
      pt.restBase && 
      !['attachment', 'revision', 'nav_menu_item', 'wp_block', 'wp_template', 'wp_template_part', 'wp_navigation'].includes(pt.slug)
    );
    
    result.postTypes = syncableTypes;
    
    // Step 2: Fetch entities for each post type
    const totalTypes = syncableTypes.length;
    let typesProcessed = 0;
    
    for (const postType of syncableTypes) {
      const progressPercent = 10 + Math.floor((typesProcessed / totalTypes) * 60);
      if (onProgress) onProgress(`Syncing ${postType.name}...`, progressPercent);
      
      try {
        const entities = await fetchAllEntitiesForType(site, postType);
        result.entities.push(...entities);
      } catch (error) {
        result.errors.push({
          type: 'post_type',
          slug: postType.slug,
          error: error.message,
        });
      }
      
      typesProcessed++;
    }

    // Step 3: Fetch menus
    if (onProgress) onProgress('Syncing menus...', 75);
    try {
      result.menus = await getMenus(site);
    } catch (error) {
      result.errors.push({
        type: 'menus',
        error: error.message,
      });
    }

    // Step 4: Fetch taxonomies
    if (onProgress) onProgress('Syncing taxonomies...', 85);
    try {
      result.taxonomies = await getTaxonomies(site);
    } catch (error) {
      result.errors.push({
        type: 'taxonomies',
        error: error.message,
      });
    }

    if (onProgress) onProgress('Sync complete!', 100);
    
  } catch (error) {
    result.errors.push({
      type: 'general',
      error: error.message,
    });
  }

  return result;
}

/**
 * Fetch all entities for a post type with pagination
 */
async function fetchAllEntitiesForType(site, postType) {
  const entities = [];
  const restBase = postType.restBase || postType.slug;
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    try {
      const response = await getPosts(site, restBase, page, 100);
      
      if (!response || response.length === 0) {
        hasMore = false;
        break;
      }

      // Enrich each entity with SEO and ACF data
      for (const post of response) {
        const entity = {
          postType: postType.slug,
          postTypeName: postType.name,
          externalId: String(post.id),
          title: post.title?.rendered || post.title || 'Untitled',
          slug: post.slug,
          url: post.link,
          excerpt: cleanHtml(post.excerpt?.rendered),
          content: post.content?.rendered || null,
          status: post.status === 'publish' ? 'PUBLISHED' : 'DRAFT',
          featuredImage: post._embedded?.['wp:featuredmedia']?.[0]?.source_url || null,
          publishedAt: post.date ? new Date(post.date) : null,
          modifiedAt: post.modified ? new Date(post.modified) : null,
          author: post._embedded?.author?.[0]?.name || null,
          categories: post._embedded?.['wp:term']?.[0]?.map(t => t.name) || [],
          tags: post._embedded?.['wp:term']?.[1]?.map(t => t.name) || [],
          seoData: null,
          acfData: null,
        };

        // Try to get SEO data
        try {
          entity.seoData = await getSeoData(site, post.id);
        } catch (e) {
          // SEO plugin might not be installed
        }

        // Try to get ACF data
        try {
          entity.acfData = await getAcfFields(site, post.id);
        } catch (e) {
          // ACF might not be installed
        }

        entities.push(entity);
      }

      // Check if there are more pages
      if (response.length < 100) {
        hasMore = false;
      } else {
        page++;
      }
      
    } catch (error) {
      console.error(`Error fetching ${restBase} page ${page}:`, error);
      hasMore = false;
    }
  }

  return entities;
}

/**
 * Clean HTML from a string
 */
function cleanHtml(html) {
  if (!html) return null;
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

const wpApiClient = {
  getSiteInfo,
  getPostTypes,
  getPosts,
  getPost,
  getSeoData,
  getAcfFields,
  getTaxonomies,
  getTaxonomyTerms,
  getMenus,
  syncAllEntities,
};

export default wpApiClient;
