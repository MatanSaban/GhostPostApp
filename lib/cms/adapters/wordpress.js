/**
 * WordPress CMS Adapter
 *
 * Handles secure communication with the GhostSEO WordPress plugin
 * using HMAC-SHA256 signed requests.
 *
 * Invoked via the cms dispatcher (see lib/cms/index.js). Legacy callers
 * can still import from '@/lib/wp-api-client' - it's a thin shim.
 */

import crypto from 'crypto';
import { BOT_FETCH_HEADERS } from '@/lib/bot-identity';
import { WORDPRESS_CAPABILITIES } from '../capabilities';

export const capabilities = WORDPRESS_CAPABILITIES;

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

  // Normalize site URL - ensure protocol is present, prefer HTTPS
  // HTTP→HTTPS redirects (301/302) convert POST to GET, breaking POST endpoints
  let baseUrl = site.url.replace(/\/$/, '');
  if (!/^https?:\/\//i.test(baseUrl)) {
    baseUrl = `https://${baseUrl}`;
  }
  baseUrl = baseUrl.replace(/^http:\/\//i, 'https://');
  const url = `${baseUrl}/wp-json/ghostseo/v1${endpoint}`;
  
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

  console.log(`[WP-API] ${method} ${url}`);
  const response = await fetch(url, options);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[WP-API] FAILED ${method} ${url} → ${response.status}: ${errorText}`);
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
      headers: BOT_FETCH_HEADERS,
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
 * @param {boolean} full - Include full content, ACF, SEO data
 */
export async function getPosts(site, postType = 'post', page = 1, perPage = 100, full = true) {
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
  
  // Build query string with full parameter for sync operations
  const queryParams = `page=${page}&per_page=${perPage}&full=${full ? 'true' : 'false'}`;
  
  return makePluginRequest(site, `${endpoint}?${queryParams}`, 'GET');
}

/**
 * Get a single post with full data
 */
export async function getPost(site, postType, postId) {
  const cleanId = String(postId).replace(/[^0-9]/g, '');
  // Normalize post type - WordPress uses singular slugs (post, page)
  // but REST base uses plural (posts, pages). Handle both.
  const normalizedType = (postType || 'post').toLowerCase().trim();
  
  // Map post type to the correct plugin endpoint
  let endpoint;
  if (normalizedType === 'post' || normalizedType === 'posts') {
    endpoint = `/posts/${cleanId}`;
  } else if (normalizedType === 'page' || normalizedType === 'pages') {
    endpoint = `/pages/${cleanId}`;
  } else {
    endpoint = `/cpt/${normalizedType}/${cleanId}`;
  }
  
  return makePluginRequest(site, endpoint, 'GET');
}

/**
 * Get a post by slug
 * @param {Object} site - Site object with connection details
 * @param {string} postType - The post type slug (post, page, or custom post type)
 * @param {string} slug - The post slug
 * @returns {Promise<Object|null>} - Post data or null if not found
 */
export async function getPostBySlug(site, postType, slug) {
  try {
    // Get posts filtered by slug using getPosts with slug filter
    // WordPress REST API supports slug parameter
    let endpoint;
    if (postType === 'post' || postType === 'posts') {
      endpoint = `/posts?slug=${encodeURIComponent(slug)}&per_page=1`;
    } else if (postType === 'page' || postType === 'pages') {
      endpoint = `/pages?slug=${encodeURIComponent(slug)}&per_page=1`;
    } else {
      endpoint = `/cpt/${postType}?slug=${encodeURIComponent(slug)}&per_page=1`;
    }
    
    const response = await makePluginRequest(site, endpoint, 'GET');
    
    // Response could be an array or object with posts property
    const posts = Array.isArray(response) ? response : (response.posts || response.data || []);
    
    return posts.length > 0 ? posts[0] : null;
  } catch (error) {
    console.error(`Failed to get post by slug "${slug}":`, error);
    return null;
  }
}

/**
 * Create a post/page/CPT in WordPress
 * @param {Object} site - Site object with connection details
 * @param {string} postType - The post type slug (post, page, or custom post type)
 * @param {Object} data - Post data { title, content, excerpt, slug, status, featured_image, featured_image_id, categories, tags, meta }
 * @returns {Promise<Object>} - Created post data { id, message, post? }
 */
export async function createPost(site, postType, data) {
  let endpoint;
  if (postType === 'post' || postType === 'posts') {
    endpoint = '/posts';
  } else if (postType === 'page' || postType === 'pages') {
    endpoint = '/pages';
  } else {
    endpoint = `/cpt/${postType}`;
  }
  
  return makePluginRequest(site, endpoint, 'POST', data);
}

/**
 * Update a post/page/CPT in WordPress
 * @param {Object} site - Site object with connection details
 * @param {string} postType - The post type slug (post, page, or custom post type)
 * @param {number|string} postId - The WordPress post ID
 * @param {Object} data - The data to update
 * @returns {Promise<Object>} - Updated post data
 */
export async function deletePost(site, postType, postId) {
  const cleanId = String(postId).replace(/[^0-9]/g, '');
  let endpoint;
  if (postType === 'post' || postType === 'posts') {
    endpoint = `/posts/${cleanId}`;
  } else if (postType === 'page' || postType === 'pages') {
    endpoint = `/pages/${cleanId}`;
  } else {
    endpoint = `/cpt/${postType}/${cleanId}`;
  }
  return makePluginRequest(site, endpoint, 'DELETE');
}

export async function updatePost(site, postType, postId, data) {
  const cleanId = String(postId).replace(/[^0-9]/g, '');
  // Map post type to the correct plugin endpoint
  let endpoint;
  if (postType === 'post' || postType === 'posts') {
    endpoint = `/posts/${cleanId}`;
  } else if (postType === 'page' || postType === 'pages') {
    endpoint = `/pages/${cleanId}`;
  } else {
    endpoint = `/cpt/${postType}/${cleanId}`;
  }
  
  return makePluginRequest(site, endpoint, 'PUT', data);
}

/**
 * Update SEO data for a post (Yoast/RankMath)
 * @param {Object} site - Site object with connection details
 * @param {number|string} postId - The WordPress post ID
 * @param {Object} seoData - The SEO data to update
 * @returns {Promise<Object>} - Updated SEO data
 */
export async function updateSeoData(site, postId, seoData) {
  const cleanId = String(postId).replace(/[^0-9]/g, '');
  return makePluginRequest(site, `/seo/${cleanId}`, 'PUT', seoData);
}

/**
 * Clear WordPress caches (core + Elementor + third-party cache plugins).
 * Requires plugin version ≥ 3.0.6.
 * @param {Object} site
 * @param {{ postIds?: Array<number|string> }} [opts]
 * @returns {Promise<{ cleared: string[], post_ids: number[] }>}
 */
export async function clearCache(site, opts = {}) {
  const body = {};
  if (opts.postIds?.length) {
    body.post_ids = opts.postIds.map(id => parseInt(id, 10)).filter(Boolean);
  }
  return makePluginRequest(site, '/cache/clear', 'POST', body);
}

/**
 * Run a generic element manipulation (insert/update/delete) against any builder.
 * The plugin dispatches to Elementor, Beaver Builder, or raw post_content HTML.
 *
 * @param {Object} site
 * @param {number|string} postId
 * @param {{
 *   operation: 'insert'|'update'|'delete',
 *   locator?: { kind: 'widget_id'|'text_match'|'tag_text'|'selector'|'all_of_tag', value?: string, tag?: string, text?: string, selector?: string },
 *   position?: 'before'|'after'|'inside_start'|'inside_end'|'replace',
 *   element?: { tag?: string, text?: string, html?: string, widget_type?: string, settings?: Object, attributes?: Object },
 *   mutation?: { text?: string, html?: string, tag?: string, attributes?: Object, settings?: Object },
 *   dry_run?: boolean
 * }} spec
 */
export async function manipulateElement(site, postId, spec) {
  return makePluginRequest(site, `/elements/manipulate/${parseInt(postId, 10)}`, 'POST', spec);
}

/**
 * Fetch a summarized structural view of a post so the AI can locate targets
 * without handling raw builder JSON.
 *
 * @param {Object} site
 * @param {number|string} postId
 */
export async function getElementStructure(site, postId) {
  return makePluginRequest(site, `/elements/structure/${parseInt(postId, 10)}`, 'GET');
}

/**
 * Resolve a URL to a WordPress post ID via the plugin.
 * Uses WordPress url_to_postid() which handles rewrites, translated slugs, etc.
 * @param {Object} site - Site object with connection details
 * @param {string} url - The URL to resolve
 * @returns {Promise<{found: boolean, postId: number|null, postType?: string, slug?: string, permalink?: string}>}
 */
export async function resolveUrl(site, url) {
  try {
    return await makePluginRequest(site, '/resolve-url', 'POST', { url });
  } catch (error) {
    console.warn('[resolveUrl] Failed to resolve URL:', url, error.message);
    const isEndpointMissing = error.message.includes('rest_no_route') || error.message.includes('(404)');
    return { found: false, postId: null, endpointMissing: isEndpointMissing };
  }
}

/**
 * Resolve image src URLs to WordPress attachment IDs.
 * @param {Object} site - Site object with connection details
 * @param {string[]} urls - Array of image src URLs to resolve
 * @returns {Promise<{results: Object.<string, {found: boolean, attachmentId: number|null}>}>}
 */
export async function resolveMediaUrls(site, urls) {
  try {
    return await makePluginRequest(site, '/resolve-media-urls', 'POST', { urls });
  } catch (error) {
    console.warn('[resolveMediaUrls] Failed:', error.message);
    const isEndpointMissing = error.message.includes('rest_no_route') || error.message.includes('(404)');
    return { results: {}, endpointMissing: isEndpointMissing };
  }
}

/**
 * Set the site favicon (site icon) to a media attachment.
 * @param {Object} site - Site object with connection details
 * @param {number|string} attachmentId - The WordPress media attachment ID
 * @returns {Promise<{success: boolean, attachmentId: number, faviconUrl: string}>}
 */
export async function setFavicon(site, attachmentId) {
  return makePluginRequest(site, '/set-favicon', 'POST', { attachmentId });
}

/**
 * Get the WordPress "Discourage search engines from indexing this site" setting.
 * @param {Object} site - Site object with connection details
 * @returns {Promise<{discouraged: boolean, blogPublic: string}>}
 */
export async function getSearchEngineVisibility(site) {
  return makePluginRequest(site, '/search-engine-visibility', 'GET');
}

/**
 * Update the WordPress search engine visibility setting.
 * @param {Object} site - Site object with connection details
 * @param {boolean} discouraged - true to discourage indexing, false to allow
 * @returns {Promise<{success: boolean, discouraged: boolean, blogPublic: string}>}
 */
export async function setSearchEngineVisibility(site, discouraged) {
  return makePluginRequest(site, '/search-engine-visibility', 'PUT', { discouraged });
}

/**
 * Enable security headers on the WordPress site via the plugin.
 * Stores config in gp_security_headers option and sends headers on every request.
 * @param {Object} site - Site object with connection details
 * @param {Object} [headers] - Optional custom header values; uses safe defaults if omitted
 * @returns {Promise<{success: boolean, enabled: boolean, headers: Object}>}
 */
export async function enableSecurityHeaders(site, headers) {
  return makePluginRequest(site, '/security-headers', 'PUT', { enable: true, ...(headers ? { headers } : {}) });
}

/**
 * Update ACF fields for a post
 * @param {Object} site - Site object with connection details
 * @param {number|string} postId - The WordPress post ID
 * @param {Object} acfData - The ACF field values to update
 * @returns {Promise<Object>} - Updated ACF data
 */
export async function updateAcfFields(site, postId, acfData) {
  const cleanId = String(postId).replace(/[^0-9]/g, '');
  return makePluginRequest(site, `/acf/${cleanId}`, 'PUT', acfData);
}

/**
 * Get SEO data for a post (Yoast/RankMath)
 */
export async function getSeoData(site, postId) {
  const cleanId = String(postId).replace(/[^0-9]/g, '');
  return makePluginRequest(site, `/seo/${cleanId}`, 'GET');
}

/**
 * Get ACF fields for a post
 */
export async function getAcfFields(site, postId) {
  const cleanId = String(postId).replace(/[^0-9]/g, '');
  return makePluginRequest(site, `/acf/${cleanId}`, 'GET');
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
 * Terms (categories / tags / any taxonomy) - CRUD.
 */
export async function listTerms(site, taxonomy, { search, limit } = {}) {
  const qs = new URLSearchParams();
  if (search) qs.set('search', search);
  if (limit) qs.set('limit', String(limit));
  const q = qs.toString() ? `?${qs.toString()}` : '';
  return makePluginRequest(site, `/terms/${taxonomy}${q}`, 'GET');
}
export async function createTerm(site, taxonomy, data) {
  return makePluginRequest(site, `/terms/${taxonomy}`, 'POST', data);
}
export async function updateTerm(site, taxonomy, termId, data) {
  return makePluginRequest(site, `/terms/${taxonomy}/${termId}`, 'PUT', data);
}
export async function deleteTerm(site, taxonomy, termId) {
  return makePluginRequest(site, `/terms/${taxonomy}/${termId}`, 'DELETE');
}

/**
 * Comments - list / update status / reply / delete.
 */
export async function listComments(site, { status, postId, limit } = {}) {
  const qs = new URLSearchParams();
  if (status) qs.set('status', status);
  if (postId) qs.set('postId', String(postId));
  if (limit) qs.set('limit', String(limit));
  const q = qs.toString() ? `?${qs.toString()}` : '';
  return makePluginRequest(site, `/comments${q}`, 'GET');
}
export async function updateComment(site, commentId, data) {
  return makePluginRequest(site, `/comments/${commentId}`, 'PUT', data);
}
export async function replyComment(site, data) {
  return makePluginRequest(site, `/comments`, 'POST', data);
}
export async function deleteComment(site, commentId, force = false) {
  const q = force ? '?force=1' : '';
  return makePluginRequest(site, `/comments/${commentId}${q}`, 'DELETE');
}

/**
 * Read/write whitelisted WP options (site title, timezone, permalinks, etc.).
 */
export async function getOptions(site) {
  return makePluginRequest(site, '/options', 'GET');
}
export async function updateOptions(site, data) {
  return makePluginRequest(site, '/options', 'PUT', data);
}

/**
 * Force the GhostSEO plugin to update itself to the latest published version.
 */
export async function selfUpdatePlugin(site) {
  return makePluginRequest(site, '/self-update', 'POST', {});
}

/**
 * Generic WordPress REST passthrough. The plugin executes the request as an
 * admin, so any plugin route (WooCommerce, Yoast, RankMath, Elementor, CF7,
 * WPForms, etc.) can be invoked end-to-end.
 *
 * @param {object} site
 * @param {{ method?: string, path: string, params?: object, headers?: object }} request
 */
export async function wpRestPassthrough(site, { method = 'GET', path, params = {}, headers = {} }) {
  return makePluginRequest(site, '/wp-passthrough', 'POST', { method, path, params, headers });
}

/**
 * Add a new item to an existing nav menu.
 */
export async function addMenuItem(site, menuId, itemData) {
  return makePluginRequest(site, `/menus/${menuId}/items`, 'POST', itemData);
}

/**
 * Update an existing nav menu item by ID.
 */
export async function updateMenuItem(site, itemId, itemData) {
  return makePluginRequest(site, `/menus/items/${itemId}`, 'PUT', itemData);
}

/**
 * Delete a nav menu item by ID.
 */
export async function deleteMenuItem(site, itemId) {
  return makePluginRequest(site, `/menus/items/${itemId}`, 'DELETE');
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
      headers: BOT_FETCH_HEADERS,
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      return response.json();
    }

    // Try older menu locations endpoint
    const locationsResponse = await fetch(`${baseUrl}/wp-json/wp/v2/menu-locations`, {
      headers: BOT_FETCH_HEADERS,
      signal: AbortSignal.timeout(10000),
    });
    
    if (locationsResponse.ok) {
      return locationsResponse.json();
    }
    
    return [];
  }
}

/**
 * Get all redirects from WordPress (from detected plugin or GP storage)
 */
export async function getRedirects(site) {
  return makePluginRequest(site, '/redirects', 'GET');
}

/**
 * Create a redirect in WordPress
 */
export async function createRedirect(site, data) {
  return makePluginRequest(site, '/redirects', 'POST', data);
}

/**
 * Update a redirect in WordPress
 */
export async function updateRedirect(site, id, data) {
  return makePluginRequest(site, `/redirects/${id}`, 'PUT', data);
}

/**
 * Delete a redirect in WordPress
 */
export async function deleteRedirect(site, id) {
  return makePluginRequest(site, `/redirects/${id}`, 'DELETE');
}

/**
 * Bulk sync redirects from platform to WordPress
 */
export async function bulkSyncRedirects(site, redirects) {
  return makePluginRequest(site, '/redirects/bulk-sync', 'POST', { redirects });
}

/**
 * Import redirects from detected third-party plugin into GP storage
 */
export async function importRedirects(site) {
  return makePluginRequest(site, '/redirects/import', 'POST');
}

/**
 * Get detected redirect plugins on the WordPress site
 */
export async function getDetectedRedirectPlugins(site) {
  return makePluginRequest(site, '/redirects/detected-plugins', 'GET');
}

/**
 * Search and replace internal links across the entire WordPress site.
 * Finds all posts/pages containing links to `oldUrl` and replaces them with `newUrl`.
 * This prevents 301 chains and orphaned internal links after content merges/redirects.
 * @param {Object} site - Site with connection details
 * @param {string} oldUrl - The old URL (path or full URL) to find in post content
 * @param {string} newUrl - The new URL (path or full URL) to replace with
 * @returns {Promise<{updated: number, posts: Array<{id: number, title: string}>}>}
 */
export async function searchReplaceLinks(site, oldUrl, newUrl) {
  return makePluginRequest(site, '/search-replace-links', 'POST', {
    search: oldUrl,
    replace: newUrl,
  });
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
        // Map WordPress status to our EntityStatus
        const statusMap = {
          'publish': 'PUBLISHED',
          'draft': 'DRAFT',
          'pending': 'PENDING',
          'future': 'SCHEDULED',
          'private': 'PRIVATE',
          'trash': 'TRASH',
        };
        const mappedStatus = statusMap[post.status] || 'DRAFT';
        
        const entity = {
          postType: postType.slug,
          postTypeName: postType.name,
          externalId: String(post.id),
          title: post.title?.rendered || post.title || 'Untitled',
          slug: post.slug,
          url: post.link,
          excerpt: cleanHtml(post.excerpt?.rendered),
          content: post.content?.rendered || null,
          status: mappedStatus,
          featuredImage: post._embedded?.['wp:featuredmedia']?.[0]?.source_url || null,
          publishedAt: post.date_gmt ? new Date(String(post.date_gmt).replace(' ', 'T') + 'Z') : (post.date ? new Date(String(post.date).replace(' ', 'T')) : null),
          scheduledAt: post.status === 'future' && post.date_gmt ? new Date(String(post.date_gmt).replace(' ', 'T') + 'Z') : (post.status === 'future' && post.date ? new Date(String(post.date).replace(' ', 'T')) : null),
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

// ============================================
// Media Functions
// ============================================

/**
 * Get media items from WordPress
 * @param {Object} site - Site object with connection details
 * @param {Object} options - Query options
 * @param {number} options.page - Page number (default: 1)
 * @param {number} options.perPage - Items per page (default: 20)
 * @param {string} options.mimeType - Filter by mime type (e.g., 'image', 'image/jpeg')
 * @param {string} options.search - Search query
 * @returns {Promise<Object>} - Media items with pagination info
 */
export async function getMedia(site, options = {}) {
  const { page = 1, perPage = 20, mimeType, search } = options;
  
  let queryParams = `page=${page}&per_page=${perPage}`;
  if (mimeType) queryParams += `&mime_type=${encodeURIComponent(mimeType)}`;
  if (search) queryParams += `&search=${encodeURIComponent(search)}`;
  
  return makePluginRequest(site, `/media?${queryParams}`, 'GET');
}

/**
 * Get a single media item by ID
 * @param {Object} site - Site object with connection details
 * @param {number|string} mediaId - The WordPress attachment ID
 * @returns {Promise<Object>} - Media item details
 */
export async function getMediaItem(site, mediaId) {
  const result = await getMedia(site, { perPage: 1 });
  // The API doesn't have a single item endpoint, so we'll need to filter
  // For now, we can use the standard WP API
  const baseUrl = site.url.replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/wp-json/wp/v2/media/${mediaId}`, {
    headers: BOT_FETCH_HEADERS,
    signal: AbortSignal.timeout(10000),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to get media item: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Upload media to WordPress from a URL
 * @param {Object} site - Site object with connection details
 * @param {string} url - URL of the image to upload
 * @param {Object} options - Upload options
 * @param {string} options.filename - Custom filename
 * @param {string} options.title - Media title
 * @param {string} options.alt - Alt text
 * @param {string} options.caption - Caption
 * @param {string} options.description - Description
 * @param {number} options.postId - Parent post ID to attach to
 * @returns {Promise<Object>} - Uploaded media details
 */
export async function uploadMediaFromUrl(site, url, options = {}) {
  const data = {
    url,
    ...options,
    post_id: options.postId,
  };
  
  return makePluginRequest(site, '/media', 'POST', data);
}

/**
 * Upload media to WordPress from base64 data
 * @param {Object} site - Site object with connection details
 * @param {string} base64 - Base64 encoded file data (without data URI prefix)
 * @param {string} filename - Filename with extension
 * @param {Object} options - Upload options
 * @param {string} options.title - Media title
 * @param {string} options.alt - Alt text
 * @param {string} options.caption - Caption
 * @param {string} options.description - Description
 * @param {number} options.postId - Parent post ID to attach to
 * @returns {Promise<Object>} - Uploaded media details
 */
export async function uploadMediaFromBase64(site, base64, filename, options = {}) {
  // Strip data URI prefix if present
  const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, '');
  
  const data = {
    base64: cleanBase64,
    filename,
    ...options,
    post_id: options.postId,
  };
  
  return makePluginRequest(site, '/media', 'POST', data);
}

/**
 * Upload media to WordPress from a Buffer
 * @param {Object} site - Site object with connection details
 * @param {Buffer} buffer - File buffer
 * @param {string} filename - Filename with extension
 * @param {Object} options - Upload options
 * @returns {Promise<Object>} - Uploaded media details
 */
export async function uploadMediaFromBuffer(site, buffer, filename, options = {}) {
  const base64 = buffer.toString('base64');
  return uploadMediaFromBase64(site, base64, filename, options);
}

/**
 * Delete media from WordPress
 * @param {Object} site - Site object with connection details
 * @param {number|string} mediaId - The WordPress attachment ID
 * @returns {Promise<Object>} - Deletion result
 */
export async function deleteMedia(site, mediaId) {
  return makePluginRequest(site, `/media/${mediaId}`, 'DELETE');
}

/**
 * Update media metadata in WordPress
 * @param {Object} site - Site object with connection details
 * @param {number|string} mediaId - The WordPress attachment ID
 * @param {Object} data - Metadata to update
 * @param {string} data.title - Media title
 * @param {string} data.alt - Alt text
 * @param {string} data.caption - Caption
 * @param {string} data.description - Description
 * @returns {Promise<Object>} - Updated media details
 */
export async function updateMedia(site, mediaId, data) {
  return makePluginRequest(site, `/media/${mediaId}`, 'PUT', data);
}

/**
 * Push widget data to the WordPress plugin dashboard widget.
 * Fire-and-forget - errors are logged but never thrown.
 * 
 * @param {Object} site - Site with url, siteKey, siteSecret
 * @param {Object} widgetData - { auditScore?, pendingInsights?, recentActivity? }
 */
export async function pushWidgetData(site, widgetData) {
  try {
    await makePluginRequest(site, '/widget-data', 'POST', widgetData);
  } catch (err) {
    console.warn(`[WP-API] pushWidgetData failed for ${site.url}: ${err.message}`);
  }
}

const wpApiClient = {
  getSiteInfo,
  getPostTypes,
  getPosts,
  getPost,
  getPostBySlug,
  updatePost,
  getSeoData,
  updateSeoData,
  getAcfFields,
  updateAcfFields,
  getTaxonomies,
  getTaxonomyTerms,
  getMenus,
  syncAllEntities,
  // Media functions
  getMedia,
  getMediaItem,
  uploadMediaFromUrl,
  uploadMediaFromBase64,
  uploadMediaFromBuffer,
  deleteMedia,
  updateMedia,
  resolveMediaUrls,
  enableSecurityHeaders,
  // Generic request function for custom endpoints
  makePluginRequest,
  // Widget data push
  pushWidgetData,
  // Element manipulation
  manipulateElement,
  getElementStructure,
  clearCache,
  resolveUrl,
};

export { makePluginRequest };
export default wpApiClient;
